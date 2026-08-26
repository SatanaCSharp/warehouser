import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { DataSource, EntityManager } from 'typeorm';

export interface CreateDraftLineLinkPersistenceInput {
  readonly id: string;
  readonly customerOrderId: string;
  readonly statedQuantity: number;
}

export interface CreateDraftLinePersistenceInput {
  readonly id: string;
  readonly itemId: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
  readonly links?: readonly CreateDraftLineLinkPersistenceInput[];
}

export interface CreateDraftPersistenceInput {
  readonly id: string;
  readonly warehouseId: string;
  readonly expectedArrivalDate: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly lines: readonly CreateDraftLinePersistenceInput[];
}

export interface AddLinePersistenceInput {
  readonly id: string;
  readonly purchaseDraftId: string;
  readonly warehouseId: string;
  readonly itemId: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
}

export interface UpdateLinePersistenceInput {
  readonly itemId?: string;
  readonly orderedQuantity?: number;
  readonly packagingTypeId?: string | null;
  readonly valueAddingNote?: string | null;
}

/** What a guarded assembly write did. `openapi.yaml` gives every line and link route both a 404
 * (`PurchaseDraftTargetUnavailable`) and a 409 (`PurchaseDraftWriteConflict`), so the two reasons a
 * write can affect no row have to stay distinguishable here: the draft no longer resolves in the
 * `draft` state, or the line/link named is not one of that draft's. A bare boolean collapses them
 * and forces the service to guess which refusal the member is owed. */
export type AssemblyWriteOutcome =
  'applied' | 'draft-frozen' | 'target-missing';

export interface AddLinkPersistenceInput {
  readonly id: string;
  readonly purchaseDraftLineId: string;
  readonly purchaseDraftId: string;
  readonly warehouseId: string;
  readonly customerOrderId: string;
  readonly statedQuantity: number;
}

// The guard every assembly write shares: it resolves the draft **only in the `draft` state**, in
// this `UPDATE`'s own `WHERE` clause, and reports whether it did — never a preceding read the
// caller then decides from. A module-level function, not a repository method, per
// creating-a-server-repository.md ("Repository classes must not contain private methods").
const guardDraftMutable = async (
  manager: EntityManager,
  purchaseDraftId: string,
  touchedAt: Date,
): Promise<boolean> => {
  const guarded = await manager
    .getRepository(PurchaseDraftEntity)
    .update({ id: purchaseDraftId, state: 'draft' }, { updatedAt: touchedAt });

  return guarded.affected === 1;
};

// AC-10/AC-10a/AC-11a/AC-12/AC-15 — the assembly write path. Every guarded write's precondition —
// "the draft still resolves in the `draft` state" — is embedded in a write's own `WHERE` clause
// (`purchase_drafts` `UPDATE … WHERE id = … AND state = 'draft'`) rather than decided from a
// preceding read, so a draft seeded directly at another state affects zero rows rather than being
// half-applied (data-model.md "Concurrency, locks and transactions", sad.md §6.6). It returns
// `boolean` rather than throwing, mirroring `ManagerTransferRepository.assignRole` and
// `RoleLifecycleRepository.updateMemberRole` — the typed refusal is the service's job
// (server-error-handling.md §3). Cross-Warehouse Items and Customer Orders are refused by
// `fk_purchase_draft_lines_item`/`fk_purchase_draft_line_links_customer_order`'s composite
// `(…, warehouse_id)` references, which this repository lets propagate rather than re-checking
// (AC-11).
@Injectable()
export class PurchaseDraftAssemblyRepository {
  constructor(private readonly dataSource: DataSource) {}

  // The draft, its lines and their links are recorded together in the Draft state (AC-10). Nothing
  // here reconciles a link's stated quantity against its line, the Customer Order or any other link
  // (AC-11a); every value is recorded exactly as composed.
  async createDraft(
    input: CreateDraftPersistenceInput,
  ): Promise<PurchaseDraftEntity> {
    const manager = getEntityManager(this.dataSource);

    const draft: PurchaseDraftEntity = {
      id: input.id,
      warehouseId: input.warehouseId,
      state: 'draft',
      expectedArrivalDate: input.expectedArrivalDate,
      createdByUserId: input.createdByUserId,
      readiedByUserId: null,
      readiedAt: null,
      closedByUserId: null,
      closedAt: null,
      closureReason: null,
      arrivalConfirmedByUserId: null,
      arrivalConfirmedAt: null,
      discardedByUserId: null,
      discardedAt: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    await manager.getRepository(PurchaseDraftEntity).insert(draft);

    for (const line of input.lines) {
      const lineRow: PurchaseDraftLineEntity = {
        id: line.id,
        purchaseDraftId: draft.id,
        warehouseId: input.warehouseId,
        itemId: line.itemId,
        orderedQuantity: line.orderedQuantity,
        packagingTypeId: line.packagingTypeId ?? null,
        valueAddingNote: line.valueAddingNote ?? null,
        receivedQuantity: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };
      await manager.getRepository(PurchaseDraftLineEntity).insert(lineRow);

      for (const link of line.links ?? []) {
        const linkRow: PurchaseDraftLineLinkEntity = {
          id: link.id,
          purchaseDraftLineId: line.id,
          purchaseDraftId: draft.id,
          warehouseId: input.warehouseId,
          customerOrderId: link.customerOrderId,
          statedQuantity: link.statedQuantity,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        };
        await manager
          .getRepository(PurchaseDraftLineLinkEntity)
          .insert(linkRow);
      }
    }

    return draft;
  }

  async addLine(input: AddLinePersistenceInput): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(
      manager,
      input.purchaseDraftId,
      now,
    );
    if (!guarded) {
      return 'draft-frozen';
    }

    await manager.getRepository(PurchaseDraftLineEntity).insert({
      id: input.id,
      purchaseDraftId: input.purchaseDraftId,
      warehouseId: input.warehouseId,
      itemId: input.itemId,
      orderedQuantity: input.orderedQuantity,
      packagingTypeId: input.packagingTypeId ?? null,
      valueAddingNote: input.valueAddingNote ?? null,
      receivedQuantity: null,
      createdAt: now,
      updatedAt: now,
    });

    return 'applied';
  }

  async updateLine(
    purchaseDraftId: string,
    lineId: string,
    changes: UpdateLinePersistenceInput,
  ): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(manager, purchaseDraftId, now);
    if (!guarded) {
      return 'draft-frozen';
    }

    const updated = await manager
      .getRepository(PurchaseDraftLineEntity)
      .update({ id: lineId, purchaseDraftId }, { ...changes, updatedAt: now });

    return updated.affected === 1 ? 'applied' : 'target-missing';
  }

  async removeLine(
    purchaseDraftId: string,
    lineId: string,
  ): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(manager, purchaseDraftId, now);
    if (!guarded) {
      return 'draft-frozen';
    }

    const deleted = await manager
      .getRepository(PurchaseDraftLineEntity)
      .delete({ id: lineId, purchaseDraftId });

    return deleted.affected === 1 ? 'applied' : 'target-missing';
  }

  async addLink(input: AddLinkPersistenceInput): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(
      manager,
      input.purchaseDraftId,
      now,
    );
    if (!guarded) {
      return 'draft-frozen';
    }

    await manager.getRepository(PurchaseDraftLineLinkEntity).insert({
      id: input.id,
      purchaseDraftLineId: input.purchaseDraftLineId,
      purchaseDraftId: input.purchaseDraftId,
      warehouseId: input.warehouseId,
      customerOrderId: input.customerOrderId,
      statedQuantity: input.statedQuantity,
      createdAt: now,
      updatedAt: now,
    });

    return 'applied';
  }

  async updateLink(
    purchaseDraftId: string,
    linkId: string,
    statedQuantity: number,
  ): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(manager, purchaseDraftId, now);
    if (!guarded) {
      return 'draft-frozen';
    }

    const updated = await manager
      .getRepository(PurchaseDraftLineLinkEntity)
      .update(
        { id: linkId, purchaseDraftId },
        { statedQuantity, updatedAt: now },
      );

    return updated.affected === 1 ? 'applied' : 'target-missing';
  }

  async removeLink(
    purchaseDraftId: string,
    linkId: string,
  ): Promise<AssemblyWriteOutcome> {
    const manager = getEntityManager(this.dataSource);
    const now = new Date();

    const guarded = await guardDraftMutable(manager, purchaseDraftId, now);
    if (!guarded) {
      return 'draft-frozen';
    }

    const deleted = await manager
      .getRepository(PurchaseDraftLineLinkEntity)
      .delete({ id: linkId, purchaseDraftId });

    return deleted.affected === 1 ? 'applied' : 'target-missing';
  }

  findLines(purchaseDraftId: string): Promise<PurchaseDraftLineEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(PurchaseDraftLineEntity)
      .find({ where: { purchaseDraftId }, order: { createdAt: 'ASC' } });
  }

  findLinks(
    purchaseDraftLineId: string,
  ): Promise<PurchaseDraftLineLinkEntity[]> {
    return getEntityManager(this.dataSource)
      .getRepository(PurchaseDraftLineLinkEntity)
      .find({
        where: { purchaseDraftLineId },
        order: { createdAt: 'ASC' },
      });
  }
}
