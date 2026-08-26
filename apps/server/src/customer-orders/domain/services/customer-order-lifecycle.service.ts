import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import {
  customerOrderInvalidInputError,
  customerOrderInvalidStateError,
  customerOrderItemUnavailableError,
  customerOrderNeededByInPastError,
  customerOrderQuantityBelowAllocatedError,
  customerOrderTargetUnavailableError,
} from 'customer-orders/domain/errors/customer-order.errors';
import type { CustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import { toCustomerOrder } from 'customer-orders/domain/mappers/customer-order.mapper';
import {
  canAmendCustomerOrder,
  canCancelCustomerOrder,
  isCalendarDate,
  isCancellationReason,
  isCustomerName,
  isDemandQuantity,
  isNeededByStillAhead,
  isQuantityAtOrAboveAllocated,
} from 'customer-orders/domain/predicates/customer-order.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import type { CustomerOrderState } from 'shared/domain/entities/customer-order.entity';
import type { LockedCustomerOrderRead } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';

export interface CustomerOrderLifecycleRuntime {
  readonly customerOrderId: () => string;
  readonly now: () => Date;
}

const defaultCustomerOrderLifecycleRuntime: CustomerOrderLifecycleRuntime = {
  customerOrderId: randomUUID,
  now: () => new Date(),
};

export interface RecordCustomerOrderInput {
  readonly itemId: string;
  readonly customerName: string;
  readonly quantity: number;
  readonly neededBy: string;
}

export interface AmendCustomerOrderInput {
  readonly quantity?: number;
  readonly neededBy?: string;
}

export interface CancelCustomerOrderInput {
  readonly cancellationReason: string;
}

// `customer_orders.needed_by` is a calendar date, so "has this date passed" is answered against a
// calendar date too. UTC is the reference: the product has no per-Warehouse time zone yet, and a
// single reference keeps two members in different zones from disagreeing about whether the same
// order is late.
const calendarDateOf = (instant: Date): string =>
  instant.toISOString().slice(0, 10);

// AC-01/AC-02/AC-02a/AC-03/AC-19/AC-19a/AC-19b — the rules of the demand half of the loop
// (sad.md §6.4, §6.10). Every bound is re-checked against rows locked in the same transaction
// rather than against the values the member composed against (sad.md §8), which is why the
// amendment and the cancellation both resolve their order through the one locking read.
@Injectable()
export class CustomerOrderLifecycleService {
  constructor(
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
    @Optional()
    private readonly customerOrderLifecycleRuntime: CustomerOrderLifecycleRuntime = defaultCustomerOrderLifecycleRuntime,
  ) {}

  @Transactional()
  async record(
    currentUser: AccessCurrentUser,
    input: RecordCustomerOrderInput,
  ): Promise<CustomerOrder> {
    const recordedAt = this.customerOrderLifecycleRuntime.now();

    // AC-02/AC-02a — each refusal names the value it will not accept, and all of them are decided
    // before any persistence is consulted, so "changes nothing" is a property of the flow rather
    // than of a rollback.
    assert(
      isCustomerName(input.customerName),
      customerOrderInvalidInputError('customerName', 'trimmed_non_empty'),
    );
    assert(
      isDemandQuantity(input.quantity),
      customerOrderInvalidInputError('quantity', 'positive_integer'),
    );
    this.assertNeededByStillAhead(input.neededBy, recordedAt);

    // AC-03 — the named Item is resolved **within the acting Warehouse**. An Item of another
    // Warehouse resolves to nothing and is refused exactly as a missing one is. An Inactive Item is
    // no longer offered and is refused on the same non-enumerating terms, because this operation
    // records a *new* reference to it (openapi.yaml `ItemUnavailable`, CONTEXT.md §Invariants).
    const item = await this.itemCatalogueRepository.findById(input.itemId);
    assert(
      item !== null &&
        item.warehouseId === currentUser.warehouseId &&
        item.deactivatedAt === null,
      customerOrderItemUnavailableError(),
    );

    // AC-01 — Unfulfilled, waiting for everything it asked for. Stored trimmed, as
    // `chk_customer_orders_customer_name_stored_trimmed` requires.
    const recorded =
      await this.customerOrderLifecycleRepository.createCustomerOrder({
        id: this.customerOrderLifecycleRuntime.customerOrderId(),
        warehouseId: currentUser.warehouseId,
        itemId: input.itemId,
        customerName: input.customerName.trim(),
        quantity: input.quantity,
        outstandingQuantity: input.quantity,
        neededBy: input.neededBy,
        state: 'unfulfilled',
        recordedByUserId: currentUser.userId,
        recordedAt,
      });

    return toCustomerOrder(recorded);
  }

  @Transactional()
  async amend(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
    input: AmendCustomerOrderInput,
  ): Promise<CustomerOrder> {
    const amendedAt = this.customerOrderLifecycleRuntime.now();

    if (input.quantity !== undefined) {
      assert(
        isDemandQuantity(input.quantity),
        customerOrderInvalidInputError('quantity', 'positive_integer'),
      );
    }
    if (input.neededBy !== undefined) {
      this.assertNeededByStillAhead(input.neededBy, amendedAt);
    }

    const locked = await this.lockAmendableOrder(
      currentUser,
      customerOrderId,
      canAmendCustomerOrder,
    );

    // AC-19b — the floor is the total already allocated to this order, read from the locked row in
    // this same transaction. Below it the change is blocked and the order is left exactly as it
    // was, because those goods sit in the Transit Zone under that customer's name.
    const quantity = input.quantity ?? locked.order.quantity;
    assert(
      isQuantityAtOrAboveAllocated(quantity, locked.allocatedQuantity),
      customerOrderQuantityBelowAllocatedError(
        locked.allocatedQuantity,
        quantity,
      ),
    );

    // AC-19 — the Outstanding Quantity is recalculated on every amendment, and a Fulfilled order
    // whose quantity was raised counts as Unfulfilled again so it returns to the consolidated
    // demand. The subtraction cannot go below zero because the floor above already refused that
    // case: the figure is never silently clamped (data-model.md §"Constraints the model
    // deliberately does not express").
    const outstandingQuantity = quantity - locked.allocatedQuantity;
    const state: CustomerOrderState =
      outstandingQuantity > 0 ? 'unfulfilled' : 'fulfilled';

    const amended =
      await this.customerOrderLifecycleRepository.amendCustomerOrder(
        customerOrderId,
        {
          quantity,
          outstandingQuantity,
          neededBy: input.neededBy ?? locked.order.neededBy,
          state,
          amendedAt,
        },
      );

    // Nothing is written to any linked frozen draft: its next read compares its Demand Snapshot
    // against these new values and reports the Drift Signal (sad.md §6.8, AC-16, AC-19).
    return toCustomerOrder(amended);
  }

  @Transactional()
  async cancel(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
    input: CancelCustomerOrderInput,
  ): Promise<CustomerOrder> {
    const cancelledAt = this.customerOrderLifecycleRuntime.now();

    assert(
      isCancellationReason(input.cancellationReason),
      customerOrderInvalidInputError('cancellationReason', 'trimmed_non_empty'),
    );

    // The cancellation resolves its order through the same locking read the amendment uses, so both
    // take the lock order sad.md §6.10 shares with the arrival flow — "which is where the two flows
    // meet on these rows".
    await this.lockAmendableOrder(
      currentUser,
      customerOrderId,
      canCancelCustomerOrder,
    );

    // AC-19a — the reason, the acting member and the time arrive together
    // (`chk_customer_orders_cancellation_attribution`). Stored trimmed, as
    // `chk_customer_orders_cancellation_reason_stored_trimmed` requires, and stored as text: the
    // reason is rendered as text and never as markup or a link (spec.md §6.1).
    const cancelled =
      await this.customerOrderLifecycleRepository.cancelCustomerOrder(
        customerOrderId,
        {
          cancellationReason: input.cancellationReason.trim(),
          cancelledByUserId: currentUser.userId,
          cancelledAt,
        },
      );

    return toCustomerOrder(cancelled);
  }

  // AC-02a/AC-19 — one condition, two callers: a customer cannot be recorded as waiting for a date
  // in the past, and an amendment cannot move the date to one.
  private assertNeededByStillAhead(neededBy: string, at: Date): void {
    assert(
      isCalendarDate(neededBy),
      customerOrderInvalidInputError('neededBy', 'calendar_date'),
    );
    assert(
      isNeededByStillAhead(neededBy, calendarDateOf(at)),
      customerOrderNeededByInPastError(),
    );
  }

  // openapi.yaml `CustomerOrderUnavailable` — an order of another Warehouse and one that does not
  // exist are one non-enumerating outcome, because the locked read is scoped to the acting
  // Warehouse. `invalidState` — a cancelled order is not amended or cancelled again.
  private async lockAmendableOrder(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
    isLegalFrom: (state: CustomerOrderState) => boolean,
  ): Promise<LockedCustomerOrderRead> {
    const locked =
      await this.customerOrderLifecycleRepository.lockOrderWithAllocatedTotal(
        customerOrderId,
        currentUser.warehouseId,
      );
    assert(locked !== null, customerOrderTargetUnavailableError());
    assert(isLegalFrom(locked.order.state), customerOrderInvalidStateError());

    return locked;
  }
}
