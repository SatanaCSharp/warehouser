import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { DataSource, EntityManager } from 'typeorm';

// openapi.yaml `DemandSnapshotEntry` — captured once at the freeze, `null` for a link that carries
// no snapshot at all (a draft never frozen).
export interface DemandSnapshotRead {
  readonly capturedQuantity: number;
  readonly capturedNeededBy: string;
  readonly capturedState: string;
}

// openapi.yaml `LinkedCustomerOrderState` — the other half of the drift comparison, read fresh
// every time.
export interface LinkedCustomerOrderStateRead {
  readonly quantity: number;
  readonly neededBy: string;
  readonly state: string;
  readonly outstandingQuantity: number;
}

// openapi.yaml `ArrivalAllocation`.
export interface ArrivalAllocationRead {
  readonly allocatedQuantity: number;
  readonly allocatedByUserId: string;
  readonly createdAt: string;
}

// The raw per-link comparison inputs. Naming a categorized Drift Signal from `snapshot`/`current`
// is a business decision that belongs to the use case above this repository
// (creating-a-server-repository.md "business decisions belong to the owning feature"), so this
// repository hands the two values back side by side and nothing else.
export interface PurchaseDraftLineLinkRead {
  readonly id: string;
  readonly customerOrderId: string;
  readonly customerName: string;
  readonly statedQuantity: number;
  readonly snapshot: DemandSnapshotRead | null;
  readonly current: LinkedCustomerOrderStateRead;
  readonly allocation: ArrivalAllocationRead | null;
}

// openapi.yaml `PurchaseDraftLine`.
export interface PurchaseDraftLineRead {
  readonly id: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly itemDescription: string;
  readonly unitOfMeasure: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId: string | null;
  readonly valueAddingNote: string | null;
  readonly receivedQuantity: number | null;
  readonly links: readonly PurchaseDraftLineLinkRead[];
}

// openapi.yaml `PurchaseDraftSummary`, minus `driftSignals` (a use-case-derived name never stored
// here) — `hasDriftSignal` is the one summary field this repository does derive, because it is a
// plain boolean projection of the same value comparison, not a named signal.
export interface PurchaseDraftSummaryRead {
  readonly id: string;
  readonly state: string;
  readonly expectedArrivalDate: string | null;
  readonly lineCount: number;
  readonly hasDriftSignal: boolean;
  readonly closureReason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly readiedByUserId: string | null;
  readonly readiedAt: Date | null;
  readonly closedByUserId: string | null;
  readonly closedAt: Date | null;
  readonly arrivalConfirmedByUserId: string | null;
  readonly arrivalConfirmedAt: Date | null;
  readonly discardedByUserId: string | null;
  readonly discardedAt: Date | null;
}

// openapi.yaml `PurchaseDraftDetail`.
export interface PurchaseDraftDetailRead extends PurchaseDraftSummaryRead {
  readonly lines: readonly PurchaseDraftLineRead[];
}

interface DraftSummaryRawRow {
  readonly id: string;
  readonly state: string;
  readonly expectedArrivalDate: string | null;
  readonly lineCount: number;
  readonly hasDriftSignal: boolean;
  readonly closureReason: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly readiedByUserId: string | null;
  readonly readiedAt: Date | null;
  readonly closedByUserId: string | null;
  readonly closedAt: Date | null;
  readonly arrivalConfirmedByUserId: string | null;
  readonly arrivalConfirmedAt: Date | null;
  readonly discardedByUserId: string | null;
  readonly discardedAt: Date | null;
}

interface DraftDetailRawRow extends Omit<DraftSummaryRawRow, 'lineCount'> {
  readonly lines: readonly PurchaseDraftLineRead[];
}

// AC-16/AC-16a — whether any of this draft's Demand Snapshot rows differs from the Customer Order
// it names now, under **exactly** the four named Drift Signal conditions (openapi.yaml
// `DriftSignalKind`) — never a broader "any value differs" test, so this flag can never disagree
// with a link's own `driftSignals` (e.g. a Customer Order moving from Fulfilled back to
// Unfulfilled is not a named signal and must not raise this flag either). `became_fulfilled` is
// suppressed when the link already carries an Allocation, because that means *this* draft's own
// Arrival Confirmation fulfilled the order, not a different draft's — the discriminator openapi.yaml
// requires. Shared as a module-level function (not a repository method) between `listDrafts` and
// `readDraft` so the definition is written once (creating-a-server-repository.md "Repository
// classes must not contain private methods").
const hasDriftSignalSubquery = (manager: EntityManager): string =>
  manager
    .createQueryBuilder()
    .select('1')
    .from(PurchaseDraftLineLinkEntity, 'link')
    .innerJoin(
      DemandSnapshotEntryEntity,
      'snapshot',
      'snapshot.purchaseDraftLineLinkId = link.id',
    )
    .innerJoin(
      CustomerOrderEntity,
      'demand',
      'demand.id = link.customerOrderId',
    )
    .leftJoin(
      ArrivalAllocationEntity,
      'allocation',
      'allocation.purchaseDraftLineLinkId = link.id',
    )
    .where('link.purchaseDraftId = draft.id')
    .andWhere(
      "((demand.state = 'cancelled' AND snapshot.capturedState <> 'cancelled') OR demand.quantity <> snapshot.capturedQuantity OR demand.neededBy <> snapshot.capturedNeededBy OR (demand.state = 'fulfilled' AND snapshot.capturedState <> 'fulfilled' AND allocation.purchaseDraftLineLinkId IS NULL))",
    )
    .getQuery();

// AC-16/AC-21a — the Demand Snapshot joined against the Customer Orders as they stand now, each
// method a single purpose-built query (sad.md §4 "Derived on read, one query, never materialized";
// sad.md §6.8; data-model.md "Repository boundaries"). Every aggregate — the per-draft line count,
// the per-draft "carries a Drift Signal" flag, the per-line links, and the per-link
// snapshot/current/allocation — is computed with its own correlated subquery, following
// `ConsolidatedDemandRepository`'s (T10) non-fan-out shape, so nesting several one-to-many
// relationships (draft -> lines -> links) never multiplies a row.
@Injectable()
export class PurchaseDraftReadRepository {
  constructor(private readonly dataSource: DataSource) {}

  // AC-16a — the Warehouse's drafts with per-draft drift presence and state, ordered by creation
  // time descending (openapi.yaml). A draft that carries no snapshot at all (never frozen) never
  // reports a Drift Signal.
  async listDrafts(
    warehouseId: string,
    state?: string,
  ): Promise<PurchaseDraftSummaryRead[]> {
    const manager = getEntityManager(this.dataSource);

    const lineCount = manager
      .createQueryBuilder()
      .select('COUNT(*)::int')
      .from(PurchaseDraftLineEntity, 'line')
      .where('line.purchaseDraftId = draft.id')
      .getQuery();

    const hasDriftSignal = hasDriftSignalSubquery(manager);

    let query = manager
      .getRepository(PurchaseDraftEntity)
      .createQueryBuilder('draft')
      .select('draft.id', 'id')
      .addSelect('draft.state', 'state')
      .addSelect('draft.expectedArrivalDate', 'expectedArrivalDate')
      .addSelect('draft.closureReason', 'closureReason')
      .addSelect('draft.createdByUserId', 'createdByUserId')
      .addSelect('draft.createdAt', 'createdAt')
      .addSelect('draft.readiedByUserId', 'readiedByUserId')
      .addSelect('draft.readiedAt', 'readiedAt')
      .addSelect('draft.closedByUserId', 'closedByUserId')
      .addSelect('draft.closedAt', 'closedAt')
      .addSelect('draft.arrivalConfirmedByUserId', 'arrivalConfirmedByUserId')
      .addSelect('draft.arrivalConfirmedAt', 'arrivalConfirmedAt')
      .addSelect('draft.discardedByUserId', 'discardedByUserId')
      .addSelect('draft.discardedAt', 'discardedAt')
      .addSelect(`(${lineCount})`, 'lineCount')
      .addSelect(`EXISTS (${hasDriftSignal})`, 'hasDriftSignal')
      .where('draft.warehouseId = :warehouseId', { warehouseId })
      .orderBy('draft.createdAt', 'DESC')
      .addOrderBy('draft.id', 'DESC');

    if (state !== undefined) {
      query = query.andWhere('draft.state = :state', { state });
    }

    const rows = await query.getRawMany<DraftSummaryRawRow>();

    return rows.map((row) => ({
      ...row,
      lineCount: Number(row.lineCount),
      hasDriftSignal: Boolean(row.hasDriftSignal),
    }));
  }

  // AC-16/AC-21a — one draft with its lines, links, Pre-receipt Requirements, per-link drift
  // detail, received quantities and Allocations, in one round trip. A Closed draft (whichever
  // route closed it) is returned exactly as an open draft is; this read never writes anything.
  // Scoped to the acting Warehouse: a draft that belongs to another Warehouse reads as `null`.
  async readDraft(
    purchaseDraftId: string,
    warehouseId: string,
  ): Promise<PurchaseDraftDetailRead | null> {
    const manager = getEntityManager(this.dataSource);

    // Received arrival timestamps are normalized to UTC ISO 8601 (`...Z`) here because they are
    // embedded as text inside `json_build_object`, which bypasses the pg driver's own Date
    // decoding — every other timestamp on this read travels as a plain column and is decoded
    // (and later serialized) the same way.
    const links = manager
      .createQueryBuilder()
      .select(
        `COALESCE(json_agg(json_build_object('id', link.id, 'customerOrderId', link.customerOrderId, 'customerName', demand.customerName, 'statedQuantity', link.statedQuantity, 'snapshot', CASE WHEN snapshot.purchaseDraftLineLinkId IS NULL THEN NULL ELSE json_build_object('capturedQuantity', snapshot.capturedQuantity, 'capturedNeededBy', snapshot.capturedNeededBy, 'capturedState', snapshot.capturedState) END, 'current', json_build_object('quantity', demand.quantity, 'neededBy', demand.neededBy, 'state', demand.state, 'outstandingQuantity', demand.outstandingQuantity), 'allocation', CASE WHEN allocation.purchaseDraftLineLinkId IS NULL THEN NULL ELSE json_build_object('allocatedQuantity', allocation.allocatedQuantity, 'allocatedByUserId', allocation.allocatedByUserId, 'createdAt', to_char(allocation.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END) ORDER BY link.createdAt, link.id), '[]'::json)`,
      )
      .from(PurchaseDraftLineLinkEntity, 'link')
      .innerJoin(
        CustomerOrderEntity,
        'demand',
        'demand.id = link.customerOrderId',
      )
      .leftJoin(
        DemandSnapshotEntryEntity,
        'snapshot',
        'snapshot.purchaseDraftLineLinkId = link.id',
      )
      .leftJoin(
        ArrivalAllocationEntity,
        'allocation',
        'allocation.purchaseDraftLineLinkId = link.id',
      )
      .where('link.purchaseDraftLineId = line.id')
      .getQuery();

    // Every line of a draft is written with the same timestamp
    // (`purchase-draft-assembly.repository.ts` "assemble"), so `line.createdAt` alone does not
    // give a stable order; `line.id` breaks the tie deterministically.
    const lines = manager
      .createQueryBuilder()
      .select(
        `COALESCE(json_agg(json_build_object('id', line.id, 'itemId', line.itemId, 'itemSku', item.sku, 'itemDescription', item.description, 'unitOfMeasure', item.unitOfMeasure, 'orderedQuantity', line.orderedQuantity, 'packagingTypeId', line.packagingTypeId, 'valueAddingNote', line.valueAddingNote, 'receivedQuantity', line.receivedQuantity, 'links', (${links})) ORDER BY line.createdAt, line.id), '[]'::json)`,
      )
      .from(PurchaseDraftLineEntity, 'line')
      .innerJoin(ItemEntity, 'item', 'item.id = line.itemId')
      .where('line.purchaseDraftId = draft.id')
      .getQuery();

    const hasDriftSignal = hasDriftSignalSubquery(manager);

    const row = await manager
      .getRepository(PurchaseDraftEntity)
      .createQueryBuilder('draft')
      .select('draft.id', 'id')
      .addSelect('draft.state', 'state')
      .addSelect('draft.expectedArrivalDate', 'expectedArrivalDate')
      .addSelect('draft.closureReason', 'closureReason')
      .addSelect('draft.createdByUserId', 'createdByUserId')
      .addSelect('draft.createdAt', 'createdAt')
      .addSelect('draft.readiedByUserId', 'readiedByUserId')
      .addSelect('draft.readiedAt', 'readiedAt')
      .addSelect('draft.closedByUserId', 'closedByUserId')
      .addSelect('draft.closedAt', 'closedAt')
      .addSelect('draft.arrivalConfirmedByUserId', 'arrivalConfirmedByUserId')
      .addSelect('draft.arrivalConfirmedAt', 'arrivalConfirmedAt')
      .addSelect('draft.discardedByUserId', 'discardedByUserId')
      .addSelect('draft.discardedAt', 'discardedAt')
      .addSelect(`(${lines})`, 'lines')
      .addSelect(`EXISTS (${hasDriftSignal})`, 'hasDriftSignal')
      .where('draft.id = :purchaseDraftId', { purchaseDraftId })
      .andWhere('draft.warehouseId = :warehouseId', { warehouseId })
      .getRawOne<DraftDetailRawRow>();

    if (row === undefined) {
      return null;
    }

    return {
      ...row,
      hasDriftSignal: Boolean(row.hasDriftSignal),
      lineCount: row.lines.length,
    };
  }
}
