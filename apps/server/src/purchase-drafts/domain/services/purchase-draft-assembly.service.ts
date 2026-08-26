import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { assert } from '@warehouser/utils/asserts';
import uniq from 'lodash/uniq';
import {
  purchaseDraftTargetUnavailableError,
  purchaseDraftUnknownPackagingTypeError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import { isKnownPackagingType } from 'purchase-drafts/domain/predicates/purchase-draft-assembly.predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import type { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import type { CustomerOrderLifecycleRepository } from 'shared/domain/repositories/customer-order-lifecycle.repository';
import type { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import type { PackagingTypeCatalogueRepository } from 'shared/domain/repositories/packaging-type-catalogue.repository';
import type {
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

// Only the single method each collaborator actually calls, so this service depends on the
// narrowest capability it uses rather than the whole shared repository (the same shape its unit
// spec's repository doubles provide).
type ItemLookup = Pick<ItemCatalogueRepository, 'findById'>;
type CustomerOrderLock = Pick<
  CustomerOrderLifecycleRepository,
  'lockOrderWithAllocatedTotal'
>;
type PackagingTypeCatalogue = Pick<
  PackagingTypeCatalogueRepository,
  'listPackagingTypes'
>;
type AssemblyWrite = Pick<PurchaseDraftAssemblyRepository, 'createDraft'>;

// AC-10/AC-11/AC-11a/AC-12/AC-13 — assembling a draft. A line naming an Item, and a link naming a
// Customer Order, of another Warehouse are both refused on the same non-enumerating terms (AC-11),
// reusing `ItemCatalogueRepository.findById` and
// `CustomerOrderLifecycleRepository.lockOrderWithAllocatedTotal` rather than duplicating either
// rule. Coverage — whether links overlap or fail to sum to their line's quantity — is the member's
// decision and is passed through unadjusted (AC-11a). Per-line Pre-receipt Requirements (Packaging
// Type, Value-adding Note) are recorded independently of every other line's (AC-12).
@Injectable()
export class PurchaseDraftAssemblyService {
  constructor(
    private readonly assemblyRepository: AssemblyWrite,
    private readonly itemCatalogueRepository: ItemLookup,
    private readonly customerOrderLifecycleRepository: CustomerOrderLock,
    private readonly packagingTypeCatalogueRepository: PackagingTypeCatalogue,
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
}
