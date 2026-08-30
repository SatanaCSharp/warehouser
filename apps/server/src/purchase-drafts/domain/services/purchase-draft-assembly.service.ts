import { Injectable } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import uniq from 'lodash/uniq';
import {
  purchaseDraftFrozenError,
  purchaseDraftTargetUnavailableError,
  purchaseDraftUnknownPackagingTypeError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import { isKnownPackagingType } from 'purchase-drafts/domain/predicates/purchase-draft-assembly.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { PackagingTypeCatalogueRepository } from 'shared/domain/repositories/packaging-type-catalogue.repository';
import type { AssemblyWriteOutcome } from 'shared/domain/repositories/purchase-draft-assembly.repository';

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
  ) {}

  // AC-11 — the named Item is resolved within the acting Warehouse; one belonging to another
  // resolves to nothing and is refused exactly as a missing one is.
  async assertItemAvailable(
    currentUser: AccessCurrentUser,
    itemId: string,
  ): Promise<void> {
    const item = await this.itemCatalogueRepository.findById(itemId);
    assert(
      item !== null && item.warehouseId === currentUser.warehouseId,
      purchaseDraftTargetUnavailableError(),
    );
  }

  // AC-11 — the same same-Warehouse rule for a link's Customer Order.
  async assertCustomerOrderAvailable(
    currentUser: AccessCurrentUser,
    customerOrderId: string,
  ): Promise<void> {
    const locked =
      await this.customerOrderLifecycleRepository.lockOrderWithAllocatedTotal(
        customerOrderId,
        currentUser.warehouseId,
      );
    assert(
      locked !== null && locked.order.warehouseId === currentUser.warehouseId,
      purchaseDraftTargetUnavailableError(),
    );
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
