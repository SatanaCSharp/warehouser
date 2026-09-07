import { Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import uniq from 'lodash/uniq';
import type { DisagreeingDeliveryLink } from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  purchaseDraftFrozenError,
  purchaseDraftTargetUnavailableError,
  purchaseDraftUnknownPackagingTypeError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import { isKnownPackagingType } from 'purchase-drafts/domain/predicates/purchase-draft-assembly.predicates';
import { DeliveryMode } from 'purchase-drafts/domain/value-objects/delivery-mode';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { PackagingTypeCatalogueRepository } from 'shared/domain/repositories/packaging-type-catalogue.repository';
import type {
  AssemblyWriteOutcome,
  LinkedOrderDestination,
  PurchaseDraftWriteScope,
} from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { isSelectableItem } from 'shared/predicates/item-availability.predicates';

// The two ways a guarded assembly write can affect no row, mapped to the two refusals openapi.yaml
// documents for these routes: 409 `PurchaseDraftWriteConflict` when the draft is no longer in the
// `draft` state, 404 `PurchaseDraftTargetUnavailable` when the line or link named is not one of
// that draft's. The state guard itself is never re-checked in a command — it lives in the write's
// own `WHERE` clause, so a draft frozen between a check and the write still affects zero rows
// (AC-15, sad.md §6.6).
//
// A module-level function rather than a method of the service below, and deliberately: it reads
// nothing and injects nothing, so making a command take the service just to reach it would couple
// the four commands that only map an outcome to three repositories they never touch. The service is
// for the checks that genuinely need collaborators (server-architecture.md §Services).
export const assertApplied = (outcome: AssemblyWriteOutcome): void => {
  assert(outcome !== 'draft-frozen', purchaseDraftFrozenError());
  assert(outcome !== 'target-missing', purchaseDraftTargetUnavailableError());
};

// Drops keys the member did not state, keeping an explicit `null` (which clears that half) while
// discarding `undefined` (which means "leave it alone"). `{ ...changes }` alone would forward every
// absent key as `undefined` and TypeORM would write it as `NULL`. Stateless for the same reason
// `assertApplied` is.
export const pickStated = <T extends object>(changes: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

/** Where the Customer Order a link names is going, as the locked row holds it. `null` is an order
 * recorded by typed name, which is going to no Delivery Address at all. */
export interface CustomerOrderDestination {
  readonly customerDeliveryAddressId: string | null;
}

/** Where a line's goods travel: the mode, and the Customer Delivery Address when the mode is one
 * that names one. Both halves together, because neither means anything without the other
 * (`chk_purchase_draft_lines_delivery_mode_address`). */
export interface LineDeliveryDestination {
  readonly deliveryMode: DeliveryMode;
  readonly customerDeliveryAddressId: string | null;
}

// The address a Direct to Customer line ships to, or `null` when no agreement applies to the line at
// all. A Via Warehouse line's goods land at one dock and any customer can be served from them
// (AC-15b), so "which address must the demand agree with?" has no answer for it — and `null` is that
// answer, which is what stops the read below from being issued for such a line.
const directDeliveryAddress = (
  destination: LineDeliveryDestination,
): string | null =>
  destination.deliveryMode === DeliveryMode.DirectToCustomer
    ? destination.customerDeliveryAddressId
    : null;

// The rule itself, as a pure function over the addresses (server-error-handling.md §1): a link
// disagrees when the Customer Order it names is going anywhere other than where the line ships —
// another Customer's address, another address of the same Customer, or nowhere at all, which is a
// Customer Order recorded by typed name. Stated once here and enforced at both moments the
// agreement is required, so the two can never drift apart (AC-15, AC-15a).
export const disagreeingDeliveryLinks = (
  lineDeliveryAddressId: string,
  linkedOrders: readonly LinkedOrderDestination[],
): DisagreeingDeliveryLink[] =>
  linkedOrders
    .filter(
      (linked) =>
        linked.customerOrderDeliveryAddressId !== lineDeliveryAddressId,
    )
    .map((linked) => ({ ...linked, lineDeliveryAddressId }));

// The checks the assembly commands share that need collaborators of their own. Extracted because
// more than one use case needs each of them, not because a use case wanted somewhere to forward to:
// every command below still owns its own rules, its own writes and its own `@Transactional()`
// boundary, and calls this service only for the conditions it shares with its siblings
// (server-architecture.md §Services, §Use cases).
//
// AC-11 is why two of them exist at all: a line naming an Item, and a link naming a Customer Order,
// of another Warehouse are refused on the same non-enumerating terms wherever they appear, reusing
// `ItemCatalogueRepository.findById` and
// `CustomerOrderLifecycleRepository.lockOrderWithAllocatedTotal` rather than duplicating either rule
// per command. AC-13 is why the third does: the catalogue is read once per request, however many
// lines name a Packaging Type.
//
// This service opens no transaction of its own. It runs inside the boundary its calling command
// declares, which is what puts its locking read on that command's lock order (sad.md §8).
//
// Each collaborator is injected as its concrete repository, not a `Pick<Repository, 'method'>`
// structural subset: `emitDecoratorMetadata` erases a mapped/utility type to `Object`, which Nest's
// DI container cannot resolve, so narrowing the injection-site type here would abort module boot —
// see `usecase.module.di.spec.ts`.
@Injectable()
export class PurchaseDraftAssemblyService {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
    private readonly packagingTypeCatalogueRepository: PackagingTypeCatalogueRepository,
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
  ) {}

  // AC-15/AC-15a — the one question the agreement is: *which of this line's links name a Delivery
  // Address other than the line's?* One read with two callers — the link command asks it about the
  // link it is about to make, the line revision about the links the line already has — because the
  // agreement is required **continuously** rather than only at the moment a link was made, and a
  // rule checked at two moments from two copies is a rule that drifts (spec.md §6 "Direct-line
  // agreement"). T16's freeze is the third moment and asks the same question of the same method.
  //
  // `prospectiveLinks` is what makes one read serve both: a link that is not recorded yet is not in
  // the store to be read, so the caller hands it in and it is judged by the same rule as every
  // stored one. Refusing before the write is what makes AC-15's "records nothing of it" a property
  // of the command rather than of a rollback.
  //
  // AC-15b — a Via Warehouse line asks nothing: no address has to agree with anything, so no read is
  // issued at all and links to orders bound for several different addresses are all recorded.
  async findDisagreeingLinks(
    scope: PurchaseDraftWriteScope,
    purchaseDraftLineId: string,
    destination: LineDeliveryDestination,
    prospectiveLinks: readonly LinkedOrderDestination[] = [],
  ): Promise<DisagreeingDeliveryLink[]> {
    const lineDeliveryAddressId = directDeliveryAddress(destination);
    if (lineDeliveryAddressId === null) {
      return [];
    }

    const linkedOrders =
      await this.assemblyRepository.findLinkedOrderDestinations(
        scope,
        purchaseDraftLineId,
      );

    return disagreeingDeliveryLinks(lineDeliveryAddressId, [
      ...linkedOrders,
      ...prospectiveLinks,
    ]);
  }

  // AC-11/AC-06d — the named Item is resolved within the acting Warehouse **and only while it is
  // still active**; one belonging to another Warehouse, one that has been deactivated and one that
  // does not exist are all refused on the same non-enumerating terms, so the refusal never
  // discloses which of the three it was (spec.md §6.1).
  //
  // Deactivation reaches this check because every caller states an `itemId` it is about to record
  // as a new reference. A line that already names an Item deactivated afterwards is untouched —
  // `RevisePurchaseDraftLineCommand` only calls this when the member restates `itemId`, so
  // re-quantifying such a line, changing its Pre-receipt Requirement, linking it or removing it all
  // keep working, exactly as AC-06d requires.
  async assertItemAvailable(
    currentUser: AccessCurrentUser,
    itemId: string,
  ): Promise<void> {
    const item = await this.itemCatalogueRepository.findById(itemId);
    assert(
      isSelectableItem(item, currentUser.warehouseId),
      purchaseDraftTargetUnavailableError(),
    );
  }

  // AC-11 — the same same-Warehouse rule for a link's Customer Order. The resolved order is returned
  // rather than discarded: AC-15 has to know the address that order is going to, and reading it a
  // second time would decide the agreement against a row this transaction did not lock.
  async assertCustomerOrderAvailable(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
  ): Promise<CustomerOrderDestination> {
    const locked =
      await this.customerOrderLifecycleRepository.lockOrderWithAllocatedTotal(
        customerOrderId,
        currentUser.warehouseId,
      );
    assert(
      locked !== null && locked.order.warehouseId === currentUser.warehouseId,
      purchaseDraftTargetUnavailableError(),
    );

    return locked.order;
  }

  // AC-13 — every requested Packaging Type is checked against the catalogue once, naming every
  // entry the catalogue offers when one falls outside it. `null` clears the half rather than naming
  // a type, and `undefined` states nothing at all, so neither is checked against the catalogue —
  // which also means a request naming no Packaging Type never reads the catalogue.
  async assertPackagingTypesKnown(
    packagingTypeIds: readonly (string | null | undefined)[],
  ): Promise<void> {
    const requested = uniq(
      packagingTypeIds.filter(
        (id): id is string => id !== undefined && id !== null,
      ),
    );
    if (requested.length === 0) {
      return;
    }

    const catalogue =
      await this.packagingTypeCatalogueRepository.listPackagingTypes();
    const catalogueIds = catalogue.map((entry) => entry.id);
    for (const packagingTypeId of requested) {
      assert(
        isKnownPackagingType(packagingTypeId, catalogueIds),
        purchaseDraftUnknownPackagingTypeError(catalogueIds),
      );
    }
  }
}
