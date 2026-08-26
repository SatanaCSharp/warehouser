import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import uniq from 'lodash/uniq';
import {
  purchaseDraftFrozenError,
  purchaseDraftTargetUnavailableError,
  purchaseDraftUnknownPackagingTypeError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import { isKnownPackagingType } from 'purchase-drafts/domain/predicates/purchase-draft-assembly.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import type { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { PackagingTypeCatalogueRepository } from 'shared/domain/repositories/packaging-type-catalogue.repository';
import type {
  AssemblyWriteOutcome,
  CreateDraftLineLinkPersistenceInput,
  CreateDraftLinePersistenceInput,
} from 'shared/domain/repositories/purchase-draft-assembly.repository';
import { PurchaseDraftAssemblyRepository } from 'shared/domain/repositories/purchase-draft-assembly.repository';

export interface CreateDraftLineLinkInput {
  readonly customerOrderId: string;
  readonly statedQuantity: number;
}

export interface CreateDraftLineInput {
  readonly itemId: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  readonly links?: readonly CreateDraftLineLinkInput[];
}

export interface CreateDraftInput {
  readonly expectedArrivalDate?: string | null;
  readonly lines: readonly CreateDraftLineInput[];
}

export interface AddLineInput {
  readonly itemId: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
}

/** Only the halves the member actually stated. An absent key leaves that half as it was; an
 * explicit `null` clears it (openapi.yaml `PurchaseDraftLineUpdate`), which is why this cannot
 * collapse `undefined` and `null` into one "unset". */
export interface ReviseLineInput {
  readonly itemId?: string;
  readonly orderedQuantity?: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
}

export interface AddLinkInput {
  readonly customerOrderId: string;
  readonly statedQuantity: number;
}

/** The one draft-level field a member may still change while the draft is in the Draft state
 * (openapi.yaml `PurchaseDraftRevise`). An explicit `null` clears it. */
export interface ReviseDraftInput {
  readonly expectedArrivalDate?: string | null;
}

export interface PurchaseDraftAssemblyRuntime {
  readonly purchaseDraftId: () => string;
  readonly purchaseDraftLineId: () => string;
  readonly purchaseDraftLineLinkId: () => string;
  readonly now: () => Date;
}

const defaultPurchaseDraftAssemblyRuntime: PurchaseDraftAssemblyRuntime = {
  purchaseDraftId: randomUUID,
  purchaseDraftLineId: randomUUID,
  purchaseDraftLineLinkId: randomUUID,
  now: () => new Date(),
};

// Each collaborator is injected as its concrete repository, not a `Pick<Repository, 'method'>`
// structural subset. `emitDecoratorMetadata` erases a mapped/utility type to `Object`, which Nest's
// DI container cannot resolve, so narrowing the injection-site type here would abort module boot
// the moment this service is registered as a provider — see `usecase.module.di.spec.ts`. The unit
// spec still passes narrow doubles; it casts them, rather than the production type being widened to
// admit them (`creating-a-server-repository.md` — inject the specialized concrete repository).

// AC-10/AC-11/AC-11a/AC-12/AC-13 — assembling a draft. A line naming an Item, and a link naming a
// Customer Order, of another Warehouse are both refused on the same non-enumerating terms (AC-11),
// reusing `ItemCatalogueRepository.findById` and
// `CustomerOrderLifecycleRepository.lockOrderWithAllocatedTotal` rather than duplicating either
// rule. Coverage — whether links overlap or fail to sum to their line's quantity — is the member's
// decision and is passed through unadjusted (AC-11a). Per-line Pre-receipt Requirements (Packaging
// Type, Value-adding Note) are recorded independently of every other line's (AC-12).
// The two ways a guarded assembly write can affect no row, mapped to the two refusals openapi.yaml
// documents for these routes: 409 `PurchaseDraftWriteConflict` when the draft is no longer in the
// `draft` state, 404 `PurchaseDraftTargetUnavailable` when the line or link named is not one of
// that draft's. Module-level functions rather than private service methods, matching how the
// repository keeps `guardDraftMutable` out of its class.
const assertApplied = (outcome: AssemblyWriteOutcome): void => {
  assert(outcome !== 'draft-frozen', purchaseDraftFrozenError());
  assert(outcome !== 'target-missing', purchaseDraftTargetUnavailableError());
};

// Drops keys the member did not state, keeping an explicit `null` (which clears that half) while
// discarding `undefined` (which means "leave it alone"). `{ ...changes }` alone would forward every
// absent key as `undefined` and TypeORM would write it as `NULL`.
const pickStated = <T extends object>(changes: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

@Injectable()
export class PurchaseDraftAssemblyService {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
    private readonly packagingTypeCatalogueRepository: PackagingTypeCatalogueRepository,
    @Optional()
    private readonly runtime: PurchaseDraftAssemblyRuntime = defaultPurchaseDraftAssemblyRuntime,
  ) {}

  @Transactional()
  async createDraft(
    currentUser: AccessCurrentUser,
    input: CreateDraftInput,
  ): Promise<PurchaseDraftEntity> {
    const createdAt = this.runtime.now();

    // AC-13 — every requested Packaging Type is checked against the catalogue once, naming every
    // entry the catalogue offers when one falls outside it.
    const requestedPackagingTypeIds = uniq(
      input.lines
        .map((line) => line.packagingTypeId)
        .filter((id): id is string => id !== undefined && id !== null),
    );
    if (requestedPackagingTypeIds.length > 0) {
      const catalogue =
        await this.packagingTypeCatalogueRepository.listPackagingTypes();
      const catalogueIds = catalogue.map((entry) => entry.id);
      for (const packagingTypeId of requestedPackagingTypeIds) {
        assert(
          isKnownPackagingType(packagingTypeId, catalogueIds),
          purchaseDraftUnknownPackagingTypeError(catalogueIds),
        );
      }
    }

    const lines: CreateDraftLinePersistenceInput[] = [];
    for (const line of input.lines) {
      // AC-11 — the named Item is resolved within the acting Warehouse; an Item of another
      // Warehouse resolves to nothing and is refused exactly as a missing one is.
      const item = await this.itemCatalogueRepository.findById(line.itemId);
      assert(
        item !== null && item.warehouseId === currentUser.warehouseId,
        purchaseDraftTargetUnavailableError(),
      );

      const links: CreateDraftLineLinkPersistenceInput[] = [];
      for (const link of line.links ?? []) {
        // AC-11 — the same same-Warehouse rule for a link's Customer Order.
        const locked =
          await this.customerOrderLifecycleRepository.lockOrderWithAllocatedTotal(
            link.customerOrderId,
            currentUser.warehouseId,
          );
        assert(
          locked !== null &&
            locked.order.warehouseId === currentUser.warehouseId,
          purchaseDraftTargetUnavailableError(),
        );

        // AC-11a — recorded exactly as composed; nothing here reconciles it against the line, the
        // Customer Order or any other link.
        links.push({
          id: this.runtime.purchaseDraftLineLinkId(),
          customerOrderId: link.customerOrderId,
          statedQuantity: link.statedQuantity,
        });
      }

      // AC-12 — each line's Pre-receipt Requirement is recorded on that line alone.
      lines.push({
        id: this.runtime.purchaseDraftLineId(),
        itemId: line.itemId,
        orderedQuantity: line.orderedQuantity,
        packagingTypeId: line.packagingTypeId ?? null,
        valueAddingNote: line.valueAddingNote ?? null,
        links,
      });
    }

    // AC-10 — the draft is recorded in the Draft state; an Expected Arrival Date may legitimately
    // be left unstated.
    return this.assemblyRepository.createDraft({
      id: this.runtime.purchaseDraftId(),
      warehouseId: currentUser.warehouseId,
      expectedArrivalDate: input.expectedArrivalDate ?? null,
      createdByUserId: currentUser.userId,
      createdAt,
      lines,
    });
  }

  // Every assembly write below shares one shape: check the rules that are the service's to check
  // (AC-11's same-Warehouse rule, AC-13's catalogue rule), hand the write to the repository, and
  // turn the outcome it reports into the refusal openapi.yaml specifies for that route. The state
  // guard itself is never re-checked here — it lives in the write's own `WHERE` clause, so a draft
  // frozen between the check and the write still affects zero rows (AC-15, sad.md §6.6).

  // AC-10a/AC-15 — revising the draft's own Expected Arrival Date while it is still in the Draft
  // state; a draft that no longer resolves there refuses with `purchase_drafts.draft_frozen`.
  @Transactional()
  async reviseDraft(
    _currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    changes: ReviseDraftInput,
  ): Promise<void> {
    const outcome = await this.assemblyRepository.updateDraft(
      purchaseDraftId,
      pickStated(changes),
    );

    assertApplied(outcome);
  }

  @Transactional()
  async addLine(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    input: AddLineInput,
  ): Promise<void> {
    await this.assertItemAvailable(currentUser, input.itemId);
    await this.assertPackagingTypeKnown(input.packagingTypeId);

    const outcome = await this.assemblyRepository.addLine({
      id: this.runtime.purchaseDraftLineId(),
      purchaseDraftId,
      warehouseId: currentUser.warehouseId,
      itemId: input.itemId,
      orderedQuantity: input.orderedQuantity,
      packagingTypeId: input.packagingTypeId ?? null,
      valueAddingNote: input.valueAddingNote ?? null,
    });

    assertApplied(outcome);
  }

  @Transactional()
  async reviseLine(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
    changes: ReviseLineInput,
  ): Promise<void> {
    if (changes.itemId !== undefined) {
      await this.assertItemAvailable(currentUser, changes.itemId);
    }
    await this.assertPackagingTypeKnown(changes.packagingTypeId);

    // Only the stated halves are forwarded, so an absent key cannot be written as `null` and clear
    // a Pre-receipt Requirement the member never touched (AC-12).
    const outcome = await this.assemblyRepository.updateLine(
      purchaseDraftId,
      purchaseDraftLineId,
      pickStated(changes),
    );

    assertApplied(outcome);
  }

  @Transactional()
  async removeLine(
    _currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
  ): Promise<void> {
    // AC-11a — the line's links go with it and no Customer Order is written: a link claims no
    // demand, so removing one changes nothing the customer is waiting for.
    const outcome = await this.assemblyRepository.removeLine(
      purchaseDraftId,
      purchaseDraftLineId,
    );

    assertApplied(outcome);
  }

  @Transactional()
  async addLink(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineId: string,
    input: AddLinkInput,
  ): Promise<void> {
    await this.assertCustomerOrderAvailable(currentUser, input.customerOrderId);

    // AC-11a — recorded exactly as composed; nothing reconciles it against the line, the Customer
    // Order or any other link.
    const outcome = await this.assemblyRepository.addLink({
      id: this.runtime.purchaseDraftLineLinkId(),
      purchaseDraftLineId,
      purchaseDraftId,
      warehouseId: currentUser.warehouseId,
      customerOrderId: input.customerOrderId,
      statedQuantity: input.statedQuantity,
    });

    assertApplied(outcome);
  }

  @Transactional()
  async reviseLink(
    _currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineLinkId: string,
    statedQuantity: number,
  ): Promise<void> {
    const outcome = await this.assemblyRepository.updateLink(
      purchaseDraftId,
      purchaseDraftLineLinkId,
      statedQuantity,
    );

    assertApplied(outcome);
  }

  @Transactional()
  async removeLink(
    _currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    purchaseDraftLineLinkId: string,
  ): Promise<void> {
    const outcome = await this.assemblyRepository.removeLink(
      purchaseDraftId,
      purchaseDraftLineLinkId,
    );

    assertApplied(outcome);
  }

  // AC-11 — the named Item is resolved within the acting Warehouse; one belonging to another
  // resolves to nothing and is refused exactly as a missing one is.
  private async assertItemAvailable(
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
  private async assertCustomerOrderAvailable(
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

  // AC-13 — a Packaging Type outside the catalogue is refused naming every entry it offers.
  // `null` clears the half rather than naming a type, so it is not checked against the catalogue.
  private async assertPackagingTypeKnown(
    packagingTypeId: string | null | undefined,
  ): Promise<void> {
    if (packagingTypeId === undefined || packagingTypeId === null) {
      return;
    }

    const catalogue =
      await this.packagingTypeCatalogueRepository.listPackagingTypes();
    const catalogueIds = catalogue.map((entry) => entry.id);
    assert(
      isKnownPackagingType(packagingTypeId, catalogueIds),
      purchaseDraftUnknownPackagingTypeError(catalogueIds),
    );
  }
}
