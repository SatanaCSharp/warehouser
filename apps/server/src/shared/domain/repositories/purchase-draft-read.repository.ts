import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
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
  // AC-18 — the Delivery Address the linked Customer Order was going to at the freeze. The
  // identifier is **the comparison key**: Address Drift is the identity question "is this order
  // going to a different Delivery Address than the one frozen for it", so correcting a typo in an
  // address that was never redirected reports nothing. The text is the frozen statement the
  // member is shown beside the address the demand now expects. Both `null` for a link to a
  // Customer Order recorded by typed name, which names no address at all (AC-11a,
  // data-model.md `purchase_draft_demand_snapshots`).
  readonly capturedDeliveryAddressId: string | null;
  readonly capturedDeliveryAddressText: string | null;
}

// openapi.yaml `CustomerOrderDestination` — where the linked Customer Order is going **now**,
// dereferenced from the Delivery Address it names. `isMain` and `deactivatedAt` report *why* it is
// this address: the Customer's current Main one, one the member stated instead, or one made
// Inactive while the order keeps naming it (AC-06a, sad.md §6.6 step 6).
export interface CustomerOrderDestinationRead {
  readonly deliveryAddressId: string;
  readonly addressText: string;
  readonly accessNotes: string | null;
  readonly isMain: boolean;
  readonly deactivatedAt: string | null;
}

// openapi.yaml `LinkedCustomerOrderState` — the other half of the drift comparison, read fresh
// every time.
export interface LinkedCustomerOrderStateRead {
  readonly quantity: number;
  readonly neededBy: string;
  readonly state: string;
  readonly outstandingQuantity: number;
  readonly lastChangedAt: string | null;
  // The live half of the AC-18 comparison, read fresh on every read and stored nowhere. `null`
  // for an order recorded by typed name.
  readonly deliveryAddress: CustomerOrderDestinationRead | null;
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
  // AC-13/AC-22 — how this line's own goods travel, which is what places it in one half of the
  // by-line read or the other.
  readonly deliveryMode: string;
  // data-model.md `purchase_draft_lines` — the live reference. It stays populated on a frozen
  // direct line: it is what the by-line read and the ownership check use, and nothing reads it as
  // the frozen statement.
  readonly customerDeliveryAddressId: string | null;
  // AC-16/AC-17 — the delivery statement captured at Ready for Ordering, as values rather than a
  // reference, so no later edit in place can travel into what the supplier was told. This read
  // returns them and writes nothing.
  readonly frozenDeliveryAddressText: string | null;
  readonly frozenAccessNotes: string | null;
  readonly frozenCustomerName: string | null;
  readonly links: readonly PurchaseDraftLineLinkRead[];
}

// openapi.yaml `PurchaseDraftLineListEntry` — one line of the by-line read, carrying the draft it
// belongs to so the view reads without a second request (AC-22).
export interface PurchaseDraftLineListEntryRead {
  readonly purchaseDraftId: string;
  readonly purchaseDraftReference: string;
  readonly purchaseDraftState: string;
  readonly expectedArrivalDate: string | null;
  readonly line: PurchaseDraftLineRead;
}

// The by-line read's optional narrowing (openapi.yaml `listPurchaseDraftLines`).
export interface PurchaseDraftLineFilters {
  readonly deliveryMode?: string;
  readonly state?: string;
}

// openapi.yaml `PurchaseDraftSummary`, minus `driftSignals` (a use-case-derived name never stored
// here) — `hasDriftSignal` is the one summary field this repository does derive, because it is a
// plain boolean projection of the same value comparison, not a named signal.
export interface PurchaseDraftSummaryRead {
  readonly id: string;
  readonly reference: string;
  readonly state: string;
  readonly expectedArrivalDate: string | null;
  readonly lineCount: number;
  readonly hasDriftSignal: boolean;
  // AC-18a — a **Direct to Customer** line of this draft is linked to a Customer Order now going
  // elsewhere. Reported on the list itself, where the member sees it without opening anything,
  // because goods are travelling to an address nobody now expects them at; the same disagreement
  // on a Via Warehouse line is reported only when the draft is opened, since everything on such a
  // line lands at one dock either way. A separate flag from `hasDriftSignal` for exactly that
  // reason (openapi.yaml `PurchaseDraftSummary`).
  readonly hasDirectToCustomerAddressDrift: boolean;
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
  readonly reference: string;
  readonly state: string;
  readonly expectedArrivalDate: string | null;
  readonly lineCount: number;
  readonly hasDriftSignal: boolean;
  readonly hasDirectToCustomerAddressDrift: boolean;
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

interface LineListEntryRawRow {
  readonly purchaseDraftId: string;
  readonly purchaseDraftReference: string;
  readonly purchaseDraftState: string;
  readonly expectedArrivalDate: string | null;
  readonly line: PurchaseDraftLineRead;
}

// openapi.yaml `expectedArrivalDate` is a calendar `date`, and both reads below project it through
// `getRawMany`/`getRawOne`, which bypass the entity's `@Column('date')` mapping: the pg driver
// hands back a JS `Date` built at midnight in the *server's* timezone, which serializes as the
// previous calendar day anywhere east of UTC (`2026-09-25` leaves as `2026-09-24T22:00:00.000Z` at
// UTC+2) and is refused by the contract's `z.string().date()`. Casting in SQL keeps the
// Warehouse-neutral calendar day the column actually holds, whatever the server's clock is set to
// — the idiom `consolidated-demand.repository.ts` already uses for `MIN(demand.neededBy)::text`.
// The parentheses are load-bearing: TypeORM only rewrites `alias.property` when it is terminated by
// one of ` =),`, so `draft.expectedArrivalDate::text` would reach PostgreSQL untranslated.
// Written once here and used by both methods, so neither can regress on its own.
const EXPECTED_ARRIVAL_DATE_SELECT = '(draft.expectedArrivalDate)::text';

// openapi.yaml `LinkedCustomerOrderState.lastChangedAt` — when the linked Customer Order last
// moved, which is what dates a Drift Signal (`Cancelled on 24 Aug`, design frame `F0SpRx.png`,
// AC-16). `updated_at` is written by every path that moves the row — the amendment, the
// cancellation and the Allocation recompute all set it — and is left equal to `created_at` by the
// insert, so "has not been changed since it was recorded" is exactly `updated_at = created_at` and
// is reported as `null` rather than as a change that never happened.
//
// Unlike `expectedArrivalDate` above this needs no `::text` cast — it is a `timestamptz`, not a
// `date`, so no calendar day can shift under the server's timezone. It does need `to_char` for the
// same reason `allocation.createdAt` below does: embedded inside `json_build_object` it bypasses
// the pg driver's Date decoding, and PostgreSQL would otherwise render it with the session's own
// UTC offset, which `z.string().datetime()` refuses.
const LAST_CHANGED_AT_SELECT = `CASE WHEN demand.updatedAt > demand.createdAt THEN to_char(demand.updatedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE NULL END`;

// AC-18 — Address Drift as a **value comparison**: the captured comparison key against the key the
// Customer Order names now. `IS DISTINCT FROM` rather than `<>` because either side is legitimately
// `NULL` for an order recorded by typed name, and `NULL` on both sides is agreement rather than
// drift (AC-11a). Nothing here is stored and nothing repairs it, which is what makes a redirection
// visible on the very next read and makes the report stop the moment the order is redirected back
// (AC-18a, spec.md §6 "Address-drift freshness"). The comparison is on the identifier and never on
// the text, so correcting a typo in an address that was never redirected reports nothing
// (data-model.md `purchase_draft_demand_snapshots`). Written once and used by all three EXISTS
// subqueries below.
const ADDRESS_DRIFT_CONDITION =
  'snapshot.capturedCustomerDeliveryAddressId IS DISTINCT FROM demand.customerDeliveryAddressId';

// AC-18a — the disagreement above, narrowed to the lines shipping **Direct to Customer**. That is
// the case reported on the draft list itself; the same disagreement on a Via Warehouse line is
// reported only when the draft is opened, because everything on such a line lands at one dock
// either way. Correlated to `draft.id`, exactly as `hasDriftSignalSubquery` is.
const hasDirectToCustomerAddressDriftSubquery = (
  manager: EntityManager,
): string =>
  manager
    .createQueryBuilder()
    .select('1')
    .from(PurchaseDraftLineLinkEntity, 'link')
    .innerJoin(
      PurchaseDraftLineEntity,
      'line',
      'line.id = link.purchaseDraftLineId',
    )
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
    .where('link.purchaseDraftId = draft.id')
    .andWhere("line.deliveryMode = 'direct_to_customer'")
    .andWhere(ADDRESS_DRIFT_CONDITION)
    .getQuery();

// AC-16/AC-16a — whether any of this draft's Demand Snapshot rows differs from the Customer Order
// it names now, under **exactly** the five named Drift Signal conditions (openapi.yaml
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
      `((demand.state = 'cancelled' AND snapshot.capturedState <> 'cancelled') OR demand.quantity <> snapshot.capturedQuantity OR demand.neededBy <> snapshot.capturedNeededBy OR (demand.state = 'fulfilled' AND snapshot.capturedState <> 'fulfilled' AND allocation.purchaseDraftLineLinkId IS NULL) OR ${ADDRESS_DRIFT_CONDITION})`,
    )
    .getQuery();

// AC-18 — where the linked Customer Order is going **now**, dereferenced from the Delivery Address
// it names. `deactivatedAt` needs `to_char` for the same reason `allocation.createdAt` does:
// embedded inside `json_build_object` it bypasses the pg driver's Date decoding, and PostgreSQL
// would otherwise render it with the session's own UTC offset, which `z.string().datetime()`
// refuses. `NULL` in, `NULL` out — an order recorded by typed name names no address at all.
const CURRENT_DELIVERY_ADDRESS_SELECT = `CASE WHEN destination.id IS NULL THEN NULL ELSE json_build_object('deliveryAddressId', destination.id, 'addressText', destination.addressText, 'accessNotes', destination.accessNotes, 'isMain', destination.isMain, 'deactivatedAt', to_char(destination.deactivatedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END`;

// The per-link projection, correlated to the outer `line` alias: the Demand Snapshot captured at
// the freeze beside the Customer Order as it stands now, both sides of the AC-18 address
// comparison included, and never a categorized Drift Signal — naming one is the use case's
// business decision above this repository (creating-a-server-repository.md).
//
// Received arrival timestamps are normalized to UTC ISO 8601 (`...Z`) here because they are
// embedded as text inside `json_build_object`, which bypasses the pg driver's own Date decoding —
// every other timestamp on this read travels as a plain column and is decoded (and later
// serialized) the same way.
const linksSubquery = (manager: EntityManager): string =>
  manager
    .createQueryBuilder()
    .select(
      `COALESCE(json_agg(json_build_object('id', link.id, 'customerOrderId', link.customerOrderId, 'customerName', demand.customerName, 'statedQuantity', link.statedQuantity, 'snapshot', CASE WHEN snapshot.purchaseDraftLineLinkId IS NULL THEN NULL ELSE json_build_object('capturedQuantity', snapshot.capturedQuantity, 'capturedNeededBy', snapshot.capturedNeededBy, 'capturedState', snapshot.capturedState, 'capturedDeliveryAddressId', snapshot.capturedCustomerDeliveryAddressId, 'capturedDeliveryAddressText', snapshot.capturedDeliveryAddressText) END, 'current', json_build_object('quantity', demand.quantity, 'neededBy', demand.neededBy, 'state', demand.state, 'outstandingQuantity', demand.outstandingQuantity, 'lastChangedAt', ${LAST_CHANGED_AT_SELECT}, 'deliveryAddress', ${CURRENT_DELIVERY_ADDRESS_SELECT}), 'allocation', CASE WHEN allocation.purchaseDraftLineLinkId IS NULL THEN NULL ELSE json_build_object('allocatedQuantity', allocation.allocatedQuantity, 'allocatedByUserId', allocation.allocatedByUserId, 'createdAt', to_char(allocation.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END) ORDER BY link.createdAt, link.id), '[]'::json)`,
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
      CustomerDeliveryAddressEntity,
      'destination',
      'destination.id = demand.customerDeliveryAddressId',
    )
    .leftJoin(
      ArrivalAllocationEntity,
      'allocation',
      'allocation.purchaseDraftLineLinkId = link.id',
    )
    .where('link.purchaseDraftLineId = line.id')
    .getQuery();

// openapi.yaml `PurchaseDraftLine`, as one JSON object over the outer `line`/`item` aliases —
// carrying its Delivery Mode and the delivery statement frozen at Ready for Ordering. Written once
// and used by **both** the opened draft and the by-line read, so the two can never project one
// line differently (AC-22).
const lineJsonObject = (manager: EntityManager): string =>
  `json_build_object('id', line.id, 'itemId', line.itemId, 'itemSku', item.sku, 'itemDescription', item.description, 'unitOfMeasure', item.unitOfMeasure, 'orderedQuantity', line.orderedQuantity, 'packagingTypeId', line.packagingTypeId, 'valueAddingNote', line.valueAddingNote, 'receivedQuantity', line.receivedQuantity, 'deliveryMode', line.deliveryMode, 'customerDeliveryAddressId', line.customerDeliveryAddressId, 'frozenDeliveryAddressText', line.frozenDeliveryAddressText, 'frozenAccessNotes', line.frozenAccessNotes, 'frozenCustomerName', line.frozenCustomerName, 'links', (${linksSubquery(manager)}))`;

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
    const hasDirectDrift = hasDirectToCustomerAddressDriftSubquery(manager);

    let query = manager
      .getRepository(PurchaseDraftEntity)
      .createQueryBuilder('draft')
      .select('draft.id', 'id')
      .addSelect('draft.reference', 'reference')
      .addSelect('draft.state', 'state')
      .addSelect(EXPECTED_ARRIVAL_DATE_SELECT, 'expectedArrivalDate')
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
      .addSelect(
        `EXISTS (${hasDirectDrift})`,
        'hasDirectToCustomerAddressDrift',
      )
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
      hasDirectToCustomerAddressDrift: Boolean(
        row.hasDirectToCustomerAddressDrift,
      ),
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

    const lines = manager
      .createQueryBuilder()
      .select(
        `COALESCE(json_agg(${lineJsonObject(manager)} ORDER BY line.createdAt, line.id), '[]'::json)`,
      )
      .from(PurchaseDraftLineEntity, 'line')
      .innerJoin(ItemEntity, 'item', 'item.id = line.itemId')
      .where('line.purchaseDraftId = draft.id')
      .getQuery();

    const hasDriftSignal = hasDriftSignalSubquery(manager);
    const hasDirectDrift = hasDirectToCustomerAddressDriftSubquery(manager);

    const row = await manager
      .getRepository(PurchaseDraftEntity)
      .createQueryBuilder('draft')
      .select('draft.id', 'id')
      .addSelect('draft.reference', 'reference')
      .addSelect('draft.state', 'state')
      .addSelect(EXPECTED_ARRIVAL_DATE_SELECT, 'expectedArrivalDate')
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
      .addSelect(
        `EXISTS (${hasDirectDrift})`,
        'hasDirectToCustomerAddressDrift',
      )
      .where('draft.id = :purchaseDraftId', { purchaseDraftId })
      .andWhere('draft.warehouseId = :warehouseId', { warehouseId })
      .getRawOne<DraftDetailRawRow>();

    if (row === undefined) {
      return null;
    }

    return {
      ...row,
      hasDriftSignal: Boolean(row.hasDriftSignal),
      hasDirectToCustomerAddressDrift: Boolean(
        row.hasDirectToCustomerAddressDrift,
      ),
      lineCount: row.lines.length,
    };
  }

  // AC-22 — the by-line split: the lines of the acting Warehouse's drafts, each carrying the draft
  // it belongs to and **its own** Delivery Mode, which is what places it in the half landing at the
  // Warehouse's own Delivery Address or the half shipping Direct to Customer. A line of a draft
  // holding both modes therefore lands in whichever half its own mode places it, with no per-draft
  // decision anywhere. The split itself is a projection over rows this read has already fetched:
  // `idx_purchase_drafts_warehouse_state_created` bounds it to one Warehouse and
  // `idx_purchase_draft_lines_draft_id` reaches their lines, which is why data-model.md
  // deliberately adds no `(warehouse_id, delivery_mode)` index.
  //
  // Scoped through the **draft's** Warehouse, the same ownership the other two reads use.
  async listLines(
    warehouseId: string,
    filters: PurchaseDraftLineFilters = {},
  ): Promise<PurchaseDraftLineListEntryRead[]> {
    const manager = getEntityManager(this.dataSource);

    let query = manager
      .createQueryBuilder()
      .select('draft.id', 'purchaseDraftId')
      .addSelect('draft.reference', 'purchaseDraftReference')
      .addSelect('draft.state', 'purchaseDraftState')
      .addSelect(EXPECTED_ARRIVAL_DATE_SELECT, 'expectedArrivalDate')
      .addSelect(lineJsonObject(manager), 'line')
      .from(PurchaseDraftLineEntity, 'line')
      .innerJoin(
        PurchaseDraftEntity,
        'draft',
        'draft.id = line.purchaseDraftId',
      )
      .innerJoin(ItemEntity, 'item', 'item.id = line.itemId')
      .where('draft.warehouseId = :warehouseId', { warehouseId })
      // openapi.yaml — Delivery Mode, then draft reference, then the line's own position. Every
      // line of a draft is written with the same timestamp
      // (`purchase-draft-assembly.repository.ts` "assemble"), so `line.id` breaks that tie
      // deterministically.
      .orderBy('line.deliveryMode', 'ASC')
      .addOrderBy('draft.reference', 'ASC')
      .addOrderBy('line.createdAt', 'ASC')
      .addOrderBy('line.id', 'ASC');

    if (filters.deliveryMode !== undefined) {
      query = query.andWhere('line.deliveryMode = :deliveryMode', {
        deliveryMode: filters.deliveryMode,
      });
    }

    if (filters.state !== undefined) {
      query = query.andWhere('draft.state = :state', { state: filters.state });
    }

    return query.getRawMany<LineListEntryRawRow>();
  }
}
