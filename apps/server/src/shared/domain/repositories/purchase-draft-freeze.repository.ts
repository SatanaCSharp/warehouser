import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { DataSource } from 'typeorm';

export interface PurchaseDraftHeaderRead {
  readonly warehouseId: string;
  readonly state: string;
}

export interface FreezePersistenceInput {
  readonly purchaseDraftId: string;
  readonly readiedByUserId: string;
  readonly readiedAt: Date;
}

export interface ClosePersistenceInput {
  readonly purchaseDraftId: string;
  readonly closedByUserId: string;
  readonly closedAt: Date;
  readonly closureReason: string;
}

export interface DiscardPersistenceInput {
  readonly purchaseDraftId: string;
  readonly discardedByUserId: string;
  readonly discardedAt: Date;
}

interface DemandSnapshotRawRow {
  readonly linkId: string;
  readonly lineId: string;
  readonly orderId: string;
  readonly quantity: number;
  readonly neededBy: string;
  readonly state: string;
}

// AC-14/AC-14a/AC-21/AC-24/AC-24a — the freeze, closure and discard transitions, kept on one
// repository because each is one guarded conditional `UPDATE … WHERE state = …` against the same
// `purchase_drafts` row, mirroring `CustomerOrderLifecycleRepository`'s multi-method shape
// (creating-a-server-repository.md). Every guard lives in the write's own `WHERE` clause exactly as
// `PurchaseDraftAssemblyRepository` established (T12): a call against a draft that no longer
// resolves in the state a transition is legal from affects zero rows and returns `false`, never a
// half-applied change. The typed refusal — and the pre-read that tells `invalid_state` apart from
// `concurrent_change` — is the owning service's job (server-error-handling.md §3).
@Injectable()
export class PurchaseDraftFreezeRepository {
  constructor(private readonly dataSource: DataSource) {}

  findDraftHeader(
    purchaseDraftId: string,
  ): Promise<PurchaseDraftHeaderRead | null> {
    return getEntityManager(this.dataSource)
      .getRepository(PurchaseDraftEntity)
      .findOne({
        where: { id: purchaseDraftId },
        select: ['warehouseId', 'state'],
      });
  }

  // AC-14/sad.md §6.7 — the guarded transition to Ready for Ordering, and the one Demand Snapshot
  // row per link, quantity/needed-by/state exactly as they then stand, written in the same
  // transaction. A draft that no longer resolves in the `draft` state affects zero rows and no
  // snapshot row is written at all.
  async freeze(input: FreezePersistenceInput): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);

    const guarded = await manager.getRepository(PurchaseDraftEntity).update(
      { id: input.purchaseDraftId, state: 'draft' },
      {
        state: 'ready_for_ordering',
        readiedByUserId: input.readiedByUserId,
        readiedAt: input.readiedAt,
        updatedAt: input.readiedAt,
      },
    );

    if (guarded.affected !== 1) {
      return false;
    }

    const demand = await manager
      .createQueryBuilder(PurchaseDraftLineLinkEntity, 'link')
      .innerJoin(
        PurchaseDraftLineEntity,
        'line',
        'line.id = link.purchaseDraftLineId',
      )
      .innerJoin(
        CustomerOrderEntity,
        'order',
        'order.id = link.customerOrderId',
      )
      .where('line.purchaseDraftId = :purchaseDraftId', {
        purchaseDraftId: input.purchaseDraftId,
      })
      .select('link.id', 'linkId')
      .addSelect('link.purchaseDraftLineId', 'lineId')
      .addSelect('order.id', 'orderId')
      .addSelect('order.quantity', 'quantity')
      .addSelect('order.neededBy', 'neededBy')
      .addSelect('order.state', 'state')
      .getRawMany<DemandSnapshotRawRow>();

    for (const row of demand) {
      await manager.getRepository(DemandSnapshotEntryEntity).insert({
        purchaseDraftLineLinkId: row.linkId,
        purchaseDraftLineId: row.lineId,
        customerOrderId: row.orderId,
        capturedQuantity: Number(row.quantity),
        capturedNeededBy: row.neededBy,
        capturedState: row.state,
        createdAt: input.readiedAt,
      });
    }

    return true;
  }

  // AC-21/sad.md §6.11 — closure resolves the draft only in Ready for Ordering; the frozen
  // contents stay readable and no linked Customer Order row is touched by this write.
  async close(input: ClosePersistenceInput): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);

    const guarded = await manager.getRepository(PurchaseDraftEntity).update(
      { id: input.purchaseDraftId, state: 'ready_for_ordering' },
      {
        state: 'closed',
        closedByUserId: input.closedByUserId,
        closedAt: input.closedAt,
        closureReason: input.closureReason,
        updatedAt: input.closedAt,
      },
    );

    return guarded.affected === 1;
  }

  // AC-24/AC-24a — discard resolves the draft only in the `draft` state and leaves every linked
  // Customer Order untouched; a draft already made ready affects zero rows.
  async discard(input: DiscardPersistenceInput): Promise<boolean> {
    const manager = getEntityManager(this.dataSource);

    const guarded = await manager.getRepository(PurchaseDraftEntity).update(
      { id: input.purchaseDraftId, state: 'draft' },
      {
        state: 'discarded',
        discardedByUserId: input.discardedByUserId,
        discardedAt: input.discardedAt,
        updatedAt: input.discardedAt,
      },
    );

    return guarded.affected === 1;
  }
}
