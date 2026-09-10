import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import type { AllocationBoundViolation } from 'customer-orders/domain/errors/demand-allocation.errors';
import { demandAllocationOutOfBoundsError } from 'customer-orders/domain/errors/demand-allocation.errors';
import { uniq } from 'lodash';
import type {
  CustomerOrderEntity,
  CustomerOrderState,
} from 'shared/domain/entities/customer-order.entity';
import type { CustomerOrderAllocationUpdate } from 'shared/domain/repositories/demand-allocation.repository';
import { DemandAllocationRepository } from 'shared/domain/repositories/demand-allocation.repository';

// T10/sad.md §4, §8 "Naming" — narrowed from the presented figure to the derived Accepted Quantity
// a caller has already computed (`ArrivalInspectionService.deriveAcceptedQuantity`, T8). This service
// never derives it itself: `assignableQuantity` is the bound, and `rejectedQuantity` rides beside it
// only so a refusal can name both figures (AC-11) without a second read.
export interface DemandAllocationLineInput {
  readonly purchaseDraftLineId: string;
  readonly assignableQuantity: number;
  readonly rejectedQuantity: number;
  readonly allocations: readonly DemandAllocationLineAssignment[];
}

// contracts/openapi.yaml `ArrivalAllocationCreate` (`additionalProperties: false`) — the Customer
// Order an assignment reaches is never accepted as caller input here. It is resolved through the
// link itself, by `DemandAllocationRepository.lockCustomerOrdersForLinks`.
export interface DemandAllocationLineAssignment {
  readonly purchaseDraftLineLinkId: string;
  readonly allocatedQuantity: number;
}

export interface DemandAllocationRuntime {
  readonly now: () => Date;
}

const defaultDemandAllocationRuntime: DemandAllocationRuntime = {
  now: () => new Date(),
};

// AC-18's three bounds (server-error-handling.md §1 — pure, domain-named predicates). Each is used
// once, by `collectViolations` below, so each stays next to that one implementation rather than in
// a shared predicates module.
const exceedsAssignableQuantity = (
  allocatedQuantity: number,
  assignableQuantity: number,
): boolean => allocatedQuantity > assignableQuantity;

const exceedsOutstandingQuantity = (
  allocatedQuantity: number,
  outstandingQuantity: number,
): boolean => allocatedQuantity > outstandingQuantity;

const isUnfulfilled = (state: CustomerOrderState): boolean =>
  state === 'unfulfilled';

// AC-18 — when the refused Customer Order last moved, so the refusal can be dated ("cancelled on
// 24 Aug", design frame `s5EPi.png`). `updated_at` is left equal to `created_at` by the insert and
// rewritten by every path that moves the row, so an order that has not been changed since it was
// recorded reports nothing rather than its own creation time. A link this transaction locked no
// order for reports nothing either — there is no row to read a moment from.
const lastChangedAtOf = (
  order: CustomerOrderEntity | undefined,
): string | null =>
  order === undefined || order.updatedAt.getTime() <= order.createdAt.getTime()
    ? null
    : order.updatedAt.toISOString();

// ADR 0002 — the Customer Order side of Arrival Confirmation. Exported from `customer-orders`' own
// use-case module so `purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command.ts`
// can call it inside the `@Transactional()` boundary *it* opens (server-architecture.md §Dependency
// direction — "services never call use cases", and here neither module opens a transaction the
// other does not already hold). This service therefore carries no `@Transactional()` of its own: it joins the
// caller's transaction through the shared context the repository reads from.
@Injectable()
export class DemandAllocationService {
  constructor(
    private readonly demandAllocationRepository: DemandAllocationRepository,
    @Optional()
    private readonly demandAllocationRuntime: DemandAllocationRuntime = defaultDemandAllocationRuntime,
  ) {}

  // sad.md §6.9 steps 5–6 — the bounds are re-checked against the rows locked by this call, never
  // against the values the caller composed against (sad.md §8). AC-18's three bounds are collected
  // across every line before any of them is enforced, so a refusal names every failing assignment
  // (spec.md §6 "Arrival atomicity") and `applyAllocations` is reached only when none failed.
  async allocate(
    warehouseId: string,
    actorId: string,
    lines: readonly DemandAllocationLineInput[],
  ): Promise<CustomerOrderEntity[]> {
    const allocatedAt = this.demandAllocationRuntime.now();

    const purchaseDraftLineLinkIds = uniq(
      lines.flatMap((line) =>
        line.allocations.map(
          (allocation) => allocation.purchaseDraftLineLinkId,
        ),
      ),
    );

    const locked =
      await this.demandAllocationRepository.lockCustomerOrdersForLinks(
        purchaseDraftLineLinkIds,
        warehouseId,
      );
    const orderByLinkId = new Map(
      locked.map(({ purchaseDraftLineLinkId, order }) => [
        purchaseDraftLineLinkId,
        order,
      ]),
    );

    const violations = this.collectViolations(lines, orderByLinkId);
    assert(
      violations.length === 0,
      demandAllocationOutOfBoundsError(violations),
    );

    const outstandingByOrderId = new Map(
      locked.map(({ order }) => [order.id, order.outstandingQuantity]),
    );

    const allocations = lines.flatMap((line) =>
      line.allocations.map((allocation) => {
        const order = orderByLinkId.get(allocation.purchaseDraftLineLinkId);
        // `collectViolations` already refused any assignment whose link resolved to nothing, so
        // `order` is defined by the time this runs.
        const customerOrderId = order!.id;
        const remaining = outstandingByOrderId.get(customerOrderId) ?? 0;
        outstandingByOrderId.set(
          customerOrderId,
          remaining - allocation.allocatedQuantity,
        );

        return {
          purchaseDraftLineLinkId: allocation.purchaseDraftLineLinkId,
          purchaseDraftLineId: line.purchaseDraftLineId,
          customerOrderId,
          allocatedQuantity: allocation.allocatedQuantity,
          allocatedByUserId: actorId,
          createdAt: allocatedAt,
        };
      }),
    );

    // AC-17a — an order assigned its whole Outstanding Quantity is marked Fulfilled; one assigned
    // part of it keeps counting for the remainder.
    const distinctOrderIds = uniq(locked.map(({ order }) => order.id));
    const orderUpdates: CustomerOrderAllocationUpdate[] = distinctOrderIds.map(
      (customerOrderId) => {
        const outstandingQuantity =
          outstandingByOrderId.get(customerOrderId) ?? 0;

        return {
          id: customerOrderId,
          outstandingQuantity,
          state: outstandingQuantity > 0 ? 'unfulfilled' : 'fulfilled',
        };
      },
    );

    return this.demandAllocationRepository.applyAllocations({
      allocations,
      orderUpdates,
    });
  }

  // AC-18 — checked in this order per line: the line-wide bound first, then, for each of its
  // assignments, whether the named Customer Order is still Unfulfilled before whether the
  // assignment exceeds what it is still waiting for. A cancelled or already-Fulfilled order's
  // Outstanding Quantity is not a meaningful floor, so that bound is reported instead of a
  // possibly-stale outstanding-quantity one.
  //
  // "assigns to one Customer Order more than it is still waiting for" is a bound on the **order
  // across the whole confirmation**, not on one assignment. One draft may hold two lines for one
  // Item both linked to the same order (`purchase_draft_lines` carries no unique on
  // `(purchase_draft_id, item_id)`), so each assignment can sit inside the order's Outstanding
  // Quantity while their sum does not. Each assignment is therefore judged against the balance its
  // predecessors left, not against the locked snapshot: it is the assignment that actually breaches
  // the remainder that gets named, and the caller sees the balance it breached. Left unaggregated
  // the surplus reaches `applyAllocations`, drives `outstanding_quantity` negative and turns
  // `chk_customer_orders_outstanding_bounds` into an untyped failure instead of this refusal.
  // A breaching assignment does not consume the remainder, so one overshoot cannot cascade into
  // false violations against the assignments that follow it.
  private collectViolations(
    lines: readonly DemandAllocationLineInput[],
    orderByLinkId: ReadonlyMap<string, CustomerOrderEntity>,
  ): AllocationBoundViolation[] {
    const violations: AllocationBoundViolation[] = [];
    // What each Customer Order is still waiting for as the confirmation is walked, seeded from the
    // rows this transaction locked and drawn down by each assignment accepted against it.
    const remainingByOrderId = new Map<string, number>();

    for (const line of lines) {
      const allocatedQuantity = line.allocations.reduce(
        (sum, allocation) => sum + allocation.allocatedQuantity,
        0,
      );
      if (
        exceedsAssignableQuantity(allocatedQuantity, line.assignableQuantity)
      ) {
        violations.push({
          purchaseDraftLineId: line.purchaseDraftLineId,
          rule: 'allocations_exceed_accepted_quantity',
          receivedQuantity: line.assignableQuantity + line.rejectedQuantity,
          rejectedQuantity: line.rejectedQuantity,
          acceptedQuantity: line.assignableQuantity,
          allocatedQuantity,
        });
      }

      for (const allocation of line.allocations) {
        const order = orderByLinkId.get(allocation.purchaseDraftLineLinkId);
        // A link this transaction did not lock a Customer Order for — of another Warehouse, or
        // naming an order that no longer exists — is refused the same non-enumerating way a
        // cancelled one is.
        const state = order?.state ?? 'cancelled';

        if (!isUnfulfilled(state)) {
          violations.push({
            purchaseDraftLineLinkId: allocation.purchaseDraftLineLinkId,
            rule: 'customer_order_not_unfulfilled',
            customerOrderState: state,
            customerOrderLastChangedAt: lastChangedAtOf(order),
          });
          continue;
        }

        const customerOrderId = order!.id;
        const outstandingQuantity =
          remainingByOrderId.get(customerOrderId) ??
          order?.outstandingQuantity ??
          0;
        if (
          exceedsOutstandingQuantity(
            allocation.allocatedQuantity,
            outstandingQuantity,
          )
        ) {
          violations.push({
            purchaseDraftLineLinkId: allocation.purchaseDraftLineLinkId,
            rule: 'exceeds_outstanding_quantity',
            outstandingQuantity,
            allocatedQuantity: allocation.allocatedQuantity,
          });
          continue;
        }

        remainingByOrderId.set(
          customerOrderId,
          outstandingQuantity - allocation.allocatedQuantity,
        );
      }
    }

    return violations;
  }
}
