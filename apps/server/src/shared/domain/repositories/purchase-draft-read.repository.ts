import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import {
  DataSource,
  EntityManager,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';

// AC-09a/ADR 0001 — every read of a Purchase Draft is served in one of two forms, and the choice is
// made by the actor's observed `CUSTOMERS:WATCH` rather than by the surface. The redacted form is
// **not** the identified one with the identity fields set to `null`: this repository issues a query
// that does not select those columns at all, so a redaction failure is a missing SQL expression
// rather than a forgotten `delete` (server-request-authorization.md § "Consume the observed set in
// the projection").
//
// Everything below is therefore stated as a shared `*Redacted*` shape plus an `*Identified*` shape
// that extends it. TypeScript then enforces the same boundary the SQL does: a redacted row has no
// `customer` property to read, so a mapper that meant to withhold identity cannot carry it.

// openapi.yaml `DemandSnapshotEntryRedacted` — the demand captured at the freeze, without the
// Delivery Address it was going to. `null` for a link that carries no snapshot at all (a draft
// never frozen).
export interface DemandSnapshotRedactedRead {
  readonly capturedQuantity: number;
  readonly capturedNeededBy: string;
  readonly capturedState: string;
}

// openapi.yaml `DemandSnapshotEntryIdentified` — the same capture with the Delivery Address the
// linked Customer Order was going to at the freeze. The identifier is **the comparison key**:
// Address Drift is the identity question "is this order going to a different Delivery Address than
// the one frozen for it", so correcting a typo in an address that was never redirected reports
// nothing. The text is the frozen statement the member is shown beside the address the demand now
// expects. Both `null` for a link to a Customer Order recorded by typed name, which names no
// address at all (AC-11a, data-model.md `purchase_draft_demand_snapshots`).
export interface DemandSnapshotIdentifiedRead extends DemandSnapshotRedactedRead {
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

// openapi.yaml `LinkedCustomerOrderStateRedacted` — the other half of the drift comparison, read
// fresh every time, without the order's destination.
export interface LinkedCustomerOrderStateRedactedRead {
  readonly quantity: number;
  readonly neededBy: string;
  readonly state: string;
  readonly outstandingQuantity: number;
  readonly lastChangedAt: string | null;
}

// openapi.yaml `LinkedCustomerOrderStateIdentified` — the same values with the address the demand
// now expects, read fresh on every read and stored nowhere. `null` for an order recorded by typed
// name.
export interface LinkedCustomerOrderStateIdentifiedRead extends LinkedCustomerOrderStateRedactedRead {
  readonly deliveryAddress: CustomerOrderDestinationRead | null;
}

// openapi.yaml `EndingAllocation` (`ordering`'s `ArrivalAllocation`).
export interface ArrivalAllocationRead {
  readonly allocatedQuantity: number;
  readonly allocatedByUserId: string;
  readonly createdAt: string;
}

// openapi.yaml `CustomerRef` — the Customer a linked order names, by identifier and **current**
// name, read live so correcting a Customer's name changes every link that names it (AC-03b).
export interface CustomerRefRead {
  readonly id: string;
  readonly name: string;
}

// The raw per-link comparison inputs an actor may read without `CUSTOMERS:WATCH`. Naming a
// categorized Drift Signal from `snapshot`/`current` is a business decision that belongs to the use
// case above this repository (creating-a-server-repository.md "business decisions belong to the
// owning feature"), so this repository hands the values back side by side and nothing else.
export interface PurchaseDraftLineLinkRedactedRead {
  readonly id: string;
  readonly customerOrderId: string;
  readonly statedQuantity: number;
  readonly snapshot: DemandSnapshotRedactedRead | null;
  readonly current: LinkedCustomerOrderStateRedactedRead;
  readonly allocation: ArrivalAllocationRead | null;
  // AC-18/AC-09a — **whether** the captured Delivery Address and the one this order names now
  // disagree, as a boolean computed in SQL rather than as the two identifiers compared in
  // application memory. It is what lets the redacted projection keep `delivery_address_changed`
  // while selecting neither address: that a drift exists is a fact about the draft, not customer
  // identity, and withholding it would tell an entitled member less than AC-18a promises
  // (openapi.yaml `PurchaseDraftLineLinkRedacted`).
  //
  // It is a comparison and not a named signal: which Drift Signals a link carries stays the use
  // case's decision, and this repository only reports that the two keys are distinct.
  readonly addressDrift: boolean;
}

// openapi.yaml `PurchaseDraftLineLinkIdentified` — the same link with the customer it names and
// both sides of the address comparison. **Exactly one** of `customer` and `customerName` is
// non-null: an order naming a Customer reads that name live, one recorded by typed name names no
// Customer at all (`chk_customer_orders_customer_identity`, AC-11a).
export interface PurchaseDraftLineLinkIdentifiedRead extends PurchaseDraftLineLinkRedactedRead {
  readonly customer: CustomerRefRead | null;
  readonly customerName: string | null;
  readonly snapshot: DemandSnapshotIdentifiedRead | null;
  readonly current: LinkedCustomerOrderStateIdentifiedRead;
}

// openapi.yaml `LineWarehouseDestination` — where a **Via Warehouse** line's goods travel. The
// operator's own premises data, so it is present on **both** forms of a line and never withheld: a
// member who prepares the dock may hold no Workspace Role at all and no customer-read Permission
// either (AC-10, sad.md §7).
export interface LineWarehouseDestinationRead {
  readonly addressText: string | null;
  readonly accessNotes: string | null;
  readonly frozen: boolean;
}

// openapi.yaml `LineCustomerDestination` — where a **Direct to Customer** line's goods travel.
// Customer identity, and therefore selected only by the identified read (AC-09a).
export interface LineCustomerDestinationRead {
  readonly customerDeliveryAddressId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly addressText: string;
  readonly accessNotes: string | null;
  readonly frozen: boolean;
}

// openapi.yaml `PurchaseDraftLineRejection` — one quantity of a line's arrival the Warehouse
// refused. The Reason travels as its **identifier** and nothing copies the catalogue's wording:
// `rejection_reasons` is extended only and no entry is ever reworded, so AC-23a holds by
// construction rather than by a frozen column, and this read joins the catalogue not at all
// (tasks/purchase-draft-read-repository-condition.md "A Rejection carries its Reason identifier;
// nothing copies the Reason's wording"). The response's `rejectionReasonLabel` is resolved above
// this repository from `RejectionReasonCatalogueRepository.listRejectionReasons()`, ten rows of
// reference data — joining it here would buy nothing and cost the per-line aggregation a join.
//
// `raisedAt` is the row's `created_at`, which **is** the raising time; there is no separate column
// (data-model.md `purchase_draft_line_rejections`).
export interface PurchaseDraftLineRejectionRead {
  readonly id: string;
  readonly rejectionReasonId: string;
  readonly quantity: number;
  readonly source: string;
  readonly description: string | null;
  readonly disposition: string;
  readonly raisedByUserId: string;
  readonly raisedAt: string;
  readonly amendedByUserId: string | null;
  readonly amendedAt: string | null;
}

// openapi.yaml `PreReceiptConformance` — the supplier's frozen instruction judged, recorded once
// with the line's ending. `null` on a line where nothing was received (AC-04a) and on every ending
// recorded before this release, which was left untouched and never backfilled (sad.md §7). It is
// **not** gated on the cause-reading Permission: a verdict is a judgement about the supplier's
// instruction, not a Rejection's cause, and `not_met` arises with or without a Rejection, so no
// refusal count can be inferred from it (openapi.yaml `PreReceiptConformance`).
export interface PreReceiptConformanceRead {
  readonly verdict: string;
  readonly note: string | null;
}

// openapi.yaml `PurchaseDraftLineEnding` crossed with `LineConditionCauseWithheld` — the ending as
// one shape rather than as the raw columns, so a caller cannot read a quantity without the
// attribution that makes it meaningful.
//
// The two condition figures are **derived and never stored**: `rejectedQuantity` is `SUM(quantity)`
// over the line's Rejections and `acceptedQuantity` is `ending_quantity − COALESCE(that sum, 0)`,
// both computed inside the correlated per-line aggregation this read already builds rather than in
// a second query (sad.md §6.3, data-model.md § "Derived quantities: Accepted and Rejected"). Not
// materializing them is what makes spec.md §6.1's "Refusal as a route around the Allocation bound"
// structural: a stored column is a column some future write path can set.
//
// The absent case needs no branch — a pre-release ending has no Rejections, the `COALESCE` sums to
// zero, and the Accepted Quantity equals the Received Quantity. The discriminator between "no
// Condition Split was ever recorded" and "one was recorded and refused nothing" is
// `preReceiptConformance` being `null`, never the empty Rejections both cases share; naming what
// that means in the response is the use case's business decision above this repository.
export interface PurchaseDraftLineEndingCauseWithheldRead {
  readonly kind: string;
  readonly quantity: number;
  readonly recordedByUserId: string;
  readonly recordedAt: string;
  readonly acceptedQuantity: number;
  readonly rejectedQuantity: number;
  readonly preReceiptConformance: PreReceiptConformanceRead | null;
}

// openapi.yaml `LineConditionWithCause` — the same ending with every refused quantity beside its
// Reason, description, Source and Disposition, ordered by Reason identifier (AC-21).
export interface PurchaseDraftLineEndingWithCauseRead extends PurchaseDraftLineEndingCauseWithheldRead {
  readonly rejections: readonly PurchaseDraftLineRejectionRead[];
}

// AC-22 — the two forms as a union rather than as one shape with an emptied array: in the withheld
// form `rejections` is **absent as a property**, because the query does not select the columns
// carrying it at all. TypeScript then enforces the same boundary the SQL does — a caller cannot
// read `rejections` without first narrowing to the form that asked for it, so a withheld projection
// cannot leak a cause it never fetched.
export type PurchaseDraftLineEndingRead =
  | PurchaseDraftLineEndingCauseWithheldRead
  | PurchaseDraftLineEndingWithCauseRead;

// AC-22/sad.md §6.3 — which of the two condition forms the query builds, chosen by the actor's
// observed `REJECTIONS:WATCH` and never by the surface. Crossed with the `identified`/`redacted`
// choice this repository already makes, it is what gives the line its **four** legal shapes; the
// two withholdings are independent, so a member who prepares the dock reads the whole condition
// without holding any customer-reading Permission.
//
// `cause_withheld` is built by **not selecting** the withheld columns — the same rule the redacted
// identity projection follows — so a redaction failure is a missing SQL expression rather than a
// forgotten `delete`. Nothing is fetched and then removed, and no count, badge or placeholder
// survives to be probed (spec.md §6.1, sad.md §4).
export type RejectionCauseProjection = 'with_cause' | 'cause_withheld';

// openapi.yaml `PurchaseDraftLineRedacted`.
export interface PurchaseDraftLineRedactedRead {
  readonly id: string;
  readonly itemId: string;
  readonly itemSku: string;
  readonly itemDescription: string;
  readonly unitOfMeasure: string;
  readonly orderedQuantity: number;
  readonly packagingTypeId: string | null;
  readonly valueAddingNote: string | null;
  // AC-19/openapi.yaml `PurchaseDraftLineEnding` — how this line ended, or `null` while it has none.
  // The four columns arrive together or not at all
  // (`chk_purchase_draft_lines_ending_attribution`), so the object is built from
  // `ending_recorded_at` alone deciding whether there is one.
  readonly ending: PurchaseDraftLineEndingRead | null;
  // AC-13/AC-22 — how this line's own goods travel, which is what places it in one half of the
  // by-line read or the other.
  readonly deliveryMode: string;
  // AC-10/AC-16/AC-17 — the destination as one shape rather than as the raw columns: read live from
  // the Warehouse record while the draft is in `draft`, and the values **captured at Ready for
  // Ordering** afterwards, with `frozen` saying which. `null` on a Direct to Customer line.
  readonly warehouseDestination: LineWarehouseDestinationRead | null;
  readonly links: readonly PurchaseDraftLineLinkRedactedRead[];
}

// openapi.yaml `PurchaseDraftLineIdentified` — the same line with the Customer destination it ships
// to and its identified links.
export interface PurchaseDraftLineIdentifiedRead extends PurchaseDraftLineRedactedRead {
  // `null` on a Via Warehouse line. Exactly one of the two destination properties is non-null,
  // which is `chk_purchase_draft_lines_delivery_mode_address` read back.
  readonly customerDestination: LineCustomerDestinationRead | null;
  readonly links: readonly PurchaseDraftLineLinkIdentifiedRead[];
}

// openapi.yaml `PurchaseDraftLineListEntry` — one line of the by-line read, carrying the draft it
// belongs to so the view reads without a second request (AC-22).
export interface PurchaseDraftLineListEntryRedactedRead {
  readonly purchaseDraftId: string;
  readonly purchaseDraftReference: string;
  readonly purchaseDraftState: string;
  readonly expectedArrivalDate: string | null;
  readonly line: PurchaseDraftLineRedactedRead;
}

export interface PurchaseDraftLineListEntryIdentifiedRead extends PurchaseDraftLineListEntryRedactedRead {
  readonly line: PurchaseDraftLineIdentifiedRead;
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

// openapi.yaml `PurchaseDraftDetail`, in the two forms AC-09a models.
export interface PurchaseDraftDetailRedactedRead extends PurchaseDraftSummaryRead {
  readonly lines: readonly PurchaseDraftLineRedactedRead[];
}

export interface PurchaseDraftDetailIdentifiedRead extends PurchaseDraftDetailRedactedRead {
  readonly lines: readonly PurchaseDraftLineIdentifiedRead[];
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

interface DraftDetailRawRow<TLine> extends Omit<
  DraftSummaryRawRow,
  'lineCount'
> {
  readonly lines: readonly TLine[];
}

interface LineListEntryRawRow<TLine> {
  readonly purchaseDraftId: string;
  readonly purchaseDraftReference: string;
  readonly purchaseDraftState: string;
  readonly expectedArrivalDate: string | null;
  readonly line: TLine;
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

// Every `timestamptz` this file embeds as text inside `json_build_object` has to be rendered here
// rather than left to the pg driver: inside the JSON builder the value never reaches the driver's
// Date decoding, and PostgreSQL renders it with the session's own UTC offset
// (`2026-09-04T15:09:25.589+00:00`), which `z.string().datetime()` refuses — it accepts the `Z`
// form alone. A timestamp that travels as a plain column is decoded and serialized by the driver
// and needs none of this.
//
// It is one named helper rather than the literal repeated at each site because the literal *was*
// repeated, and the by-line read's `ending.recordedAt` is the one site that was written without it
// — which failed the whole read for any Warehouse holding an ended line (AC-19, AC-22).
const utcIsoText = (column: string): string =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// openapi.yaml `LinkedCustomerOrderState.lastChangedAt` — when the linked Customer Order last
// moved, which is what dates a Drift Signal (`Cancelled on 24 Aug`, design frame `F0SpRx.png`,
// AC-16). `updated_at` is written by every path that moves the row — the amendment, the
// cancellation and the Allocation recompute all set it — and is left equal to `created_at` by the
// insert, so "has not been changed since it was recorded" is exactly `updated_at = created_at` and
// is reported as `null` rather than as a change that never happened.
//
// Unlike `expectedArrivalDate` above this needs no `::text` cast — it is a `timestamptz`, not a
// `date`, so no calendar day can shift under the server's timezone. It goes through `utcIsoText`
// because it is embedded inside `json_build_object`.
const LAST_CHANGED_AT_SELECT = `CASE WHEN demand.updatedAt > demand.createdAt THEN ${utcIsoText('demand.updatedAt')} ELSE NULL END`;

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
// it names. `deactivatedAt` goes through `utcIsoText` because it is embedded inside
// `json_build_object`. `NULL` in, `NULL` out — an order recorded by typed name names no address at
// all.
const CURRENT_DELIVERY_ADDRESS_SELECT = `CASE WHEN destination.id IS NULL THEN NULL ELSE json_build_object('deliveryAddressId', destination.id, 'addressText', destination.addressText, 'accessNotes', destination.accessNotes, 'isMain', destination.isMain, 'deactivatedAt', ${utcIsoText('destination.deactivatedAt')}) END`;

// AC-18/AC-09a — whether the Delivery Address captured for this link and the one its Customer Order
// names now disagree, as a **boolean** rather than as the two identifiers. It is what lets the
// redacted projection keep reporting `delivery_address_changed` while selecting neither address:
// the same `IS DISTINCT FROM` the two draft-level flags use, so the link, the opened draft and the
// list can never disagree about one link. `NULL` on both sides is agreement rather than drift,
// which is the typed-name case (AC-11a).
const ADDRESS_DRIFT_SELECT = `(${ADDRESS_DRIFT_CONDITION})`;

// AC-09a — the customer a linked order names, selected **only** by the identified projection.
const LINK_CUSTOMER_SELECT = `CASE WHEN linkCustomer.id IS NULL THEN NULL ELSE json_build_object('id', linkCustomer.id, 'name', linkCustomer.name) END`;

// The per-link projection, correlated to the outer `line` alias: the Demand Snapshot captured at
// the freeze beside the Customer Order as it stands now, and never a categorized Drift Signal —
// naming one is the use case's business decision above this repository
// (creating-a-server-repository.md).
//
// `identified` decides which columns are **selected**, never which are filtered afterwards: the
// redacted query names no customer, no typed name and neither side of the address comparison, so a
// redaction failure here is a missing SQL expression rather than a forgotten `delete`
// (server-request-authorization.md § "Consume the observed set in the projection", ADR 0001). Both
// forms carry `addressDrift`, because *that* a drift exists is a fact about the draft rather than
// customer identity (openapi.yaml `PurchaseDraftLineLinkRedacted`).
//
// Timestamps go through `utcIsoText` because they are embedded as text inside `json_build_object`
// — every other timestamp on this read travels as a plain column and is decoded (and later
// serialized) by the driver.
const linksSubquery = (manager: EntityManager, identified: boolean): string => {
  const identity = identified
    ? `'customer', ${LINK_CUSTOMER_SELECT}, 'customerName', demand.customerName, `
    : '';
  const capturedAddress = identified
    ? `, 'capturedDeliveryAddressId', snapshot.capturedCustomerDeliveryAddressId, 'capturedDeliveryAddressText', snapshot.capturedDeliveryAddressText`
    : '';
  const currentAddress = identified
    ? `, 'deliveryAddress', ${CURRENT_DELIVERY_ADDRESS_SELECT}`
    : '';

  const query = manager
    .createQueryBuilder()
    .select(
      `COALESCE(json_agg(json_build_object('id', link.id, 'customerOrderId', link.customerOrderId, ${identity}'statedQuantity', link.statedQuantity, 'snapshot', CASE WHEN snapshot.purchaseDraftLineLinkId IS NULL THEN NULL ELSE json_build_object('capturedQuantity', snapshot.capturedQuantity, 'capturedNeededBy', snapshot.capturedNeededBy, 'capturedState', snapshot.capturedState${capturedAddress}) END, 'current', json_build_object('quantity', demand.quantity, 'neededBy', demand.neededBy, 'state', demand.state, 'outstandingQuantity', demand.outstandingQuantity, 'lastChangedAt', ${LAST_CHANGED_AT_SELECT}${currentAddress}), 'addressDrift', ${ADDRESS_DRIFT_SELECT}, 'allocation', CASE WHEN allocation.purchaseDraftLineLinkId IS NULL THEN NULL ELSE json_build_object('allocatedQuantity', allocation.allocatedQuantity, 'allocatedByUserId', allocation.allocatedByUserId, 'createdAt', ${utcIsoText('allocation.createdAt')}) END) ORDER BY link.createdAt, link.id), '[]'::json)`,
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
    .where('link.purchaseDraftLineId = line.id');

  // The two joins that reach customer identity are added **only** for the identified form, so the
  // redacted query does not even visit the rows it must not disclose.
  return identified
    ? query
        .leftJoin(
          CustomerDeliveryAddressEntity,
          'destination',
          'destination.id = demand.customerDeliveryAddressId',
        )
        .leftJoin(
          CustomerEntity,
          'linkCustomer',
          'linkCustomer.id = demand.customerId',
        )
        .getQuery()
    : query.getQuery();
};

// AC-21/data-model.md § "Derived quantities" — the line's total across every Rejection on it,
// `SUM(quantity)` and `0` when there are none, as a **correlated** subquery on the outer `line`
// alias rather than a join: a line's Rejections are a second one-to-many beneath a line that
// already aggregates its links, and joined rather than correlated each would multiply the other
// (two links and two Rejections would report a Rejected Quantity of 16 rather than 8). Correlated
// on `line.id` it reaches `uq_purchase_draft_line_rejections_line_reason`, whose leading column is
// the line — the index data-model.md § Indexes adds for exactly this read.
//
// Selected by **both** condition forms: that a refusal happened stays visible wherever presented
// and accepted differ, because the protection is over the cause and never over the fact (AC-22).
const rejectedQuantitySubquery = (manager: EntityManager): string =>
  manager
    .createQueryBuilder()
    .select('COALESCE(SUM(rejection.quantity), 0)::int')
    .from(PurchaseDraftLineRejectionEntity, 'rejection')
    .where('rejection.purchaseDraftLineId = line.id')
    .getQuery();

// openapi.yaml `LineConditionWithCause.rejections` — every Rejection on the line, at most one per
// Reason (`uq_purchase_draft_line_rejections_line_reason`), ordered by Reason identifier. Selected
// **only** by the cause-bearing form, so the withheld query never names a Reason, a description, a
// Disposition or an amendment at all (AC-22).
//
// `created_at` is projected as `raisedAt` because it **is** the raising time, and both timestamps go
// through `utcIsoText` because they are embedded as text inside `json_build_object`.
const rejectionsSubquery = (manager: EntityManager): string =>
  manager
    .createQueryBuilder()
    .select(
      `COALESCE(json_agg(json_build_object('id', rejection.id, 'rejectionReasonId', rejection.rejectionReasonId, 'quantity', rejection.quantity, 'source', rejection.source, 'description', rejection.description, 'disposition', rejection.disposition, 'raisedByUserId', rejection.raisedByUserId, 'raisedAt', ${utcIsoText('rejection.createdAt')}, 'amendedByUserId', rejection.amendedByUserId, 'amendedAt', ${utcIsoText('rejection.amendedAt')}) ORDER BY rejection.rejectionReasonId), '[]'::json)`,
    )
    .from(PurchaseDraftLineRejectionEntity, 'rejection')
    .where('rejection.purchaseDraftLineId = line.id')
    .getQuery();

// openapi.yaml `PreReceiptConformance` — the verdict and its note as one object, built from the
// verdict alone deciding whether there is one. `NULL` is the discriminator data-model.md § Derived
// quantities names: it separates "no Condition Split was ever recorded" — a pre-release ending, or
// a line where nothing was received — from "one was recorded and refused nothing", which the empty
// Rejections both share cannot.
const PRE_RECEIPT_CONFORMANCE_SELECT = `CASE WHEN line.preReceiptConformance IS NULL THEN NULL ELSE json_build_object('verdict', line.preReceiptConformance, 'note', line.preReceiptConformanceNote) END`;

// openapi.yaml `LineWarehouseDestination` — where a Via Warehouse line's goods travel, as one
// object rather than as the raw columns. The Warehouse's own address is read **live** while the
// line carries no frozen statement, and the values captured at Ready for Ordering afterwards;
// `frozen` says which, and `frozen_delivery_address_text` is the discriminator because the freeze
// writes the three frozen columns together or not at all (AC-16, AC-17).
//
// Both halves are chosen by the *same* condition rather than by `COALESCE` per property: a frozen
// line whose access notes were `NULL` at the freeze must read back as `NULL`, not fall through to
// whatever the Warehouse records now — that fall-through would be exactly the later edit AC-17
// forbids travelling into a frozen statement.
const WAREHOUSE_DESTINATION_SELECT = `CASE WHEN line.deliveryMode <> 'via_warehouse' THEN NULL ELSE json_build_object('addressText', CASE WHEN line.frozenDeliveryAddressText IS NULL THEN lineWarehouse.deliveryAddressText ELSE line.frozenDeliveryAddressText END, 'accessNotes', CASE WHEN line.frozenDeliveryAddressText IS NULL THEN lineWarehouse.deliveryAccessNotes ELSE line.frozenAccessNotes END, 'frozen', line.frozenDeliveryAddressText IS NOT NULL) END`;

// openapi.yaml `LineCustomerDestination` — where a Direct to Customer line's goods travel, on the
// same live-or-frozen rule. `customerDeliveryAddressId` stays the live reference even on a frozen
// line: it is what the by-line read and the ownership check use, and nothing reads it as the frozen
// statement (data-model.md `purchase_draft_lines`).
const CUSTOMER_DESTINATION_SELECT = `CASE WHEN line.deliveryMode <> 'direct_to_customer' THEN NULL ELSE json_build_object('customerDeliveryAddressId', line.customerDeliveryAddressId, 'customerId', lineCustomer.id, 'customerName', CASE WHEN line.frozenCustomerName IS NULL THEN lineCustomer.name ELSE line.frozenCustomerName END, 'addressText', CASE WHEN line.frozenDeliveryAddressText IS NULL THEN lineAddress.addressText ELSE line.frozenDeliveryAddressText END, 'accessNotes', CASE WHEN line.frozenDeliveryAddressText IS NULL THEN lineAddress.accessNotes ELSE line.frozenAccessNotes END, 'frozen', line.frozenDeliveryAddressText IS NOT NULL) END`;

// openapi.yaml `PurchaseDraftLine`, as one JSON object over the outer `line`/`item` aliases.
// Written once and used by **both** the opened draft and the by-line read, so the two can never
// project one line differently (AC-22), and parameterized by the observed Permission rather than by
// the surface, so the two can never redact one line differently either (ADR 0001).
//
// `warehouseDestination` is in the common half deliberately: the Warehouse's own address and access
// notes are the operator's premises data, read under `PURCHASE_DRAFTS:WATCH` alone (AC-10).
//
// `withCause` is the second, independent narrowing (AC-22): like `identified` it decides which
// columns are **selected**, never which are filtered afterwards, so the withheld form's SQL names
// no Reason, description, Disposition or amendment at all. The condition figures and the
// Pre-receipt Conformance stay in the common half — the verdict is a judgement about the supplier's
// instruction rather than a Rejection's cause, and one total refused figure is what AC-22 keeps.
//
// The whole condition is built here, inside the aggregation that already assembles the line's links
// and drift, so the account and the links reach the caller in one round trip (sad.md §6.3).
const lineJsonObject = (
  manager: EntityManager,
  identified: boolean,
  withCause: boolean,
): string => {
  const customerDestination = identified
    ? `, 'customerDestination', ${CUSTOMER_DESTINATION_SELECT}`
    : '';
  const rejectedQuantity = `(${rejectedQuantitySubquery(manager)})`;
  const rejections = withCause
    ? `, 'rejections', (${rejectionsSubquery(manager)})`
    : '';
  const condition = `'acceptedQuantity', line.endingQuantity - ${rejectedQuantity}, 'rejectedQuantity', ${rejectedQuantity}, 'preReceiptConformance', ${PRE_RECEIPT_CONFORMANCE_SELECT}${rejections}`;

  return `json_build_object('id', line.id, 'itemId', line.itemId, 'itemSku', item.sku, 'itemDescription', item.description, 'unitOfMeasure', item.unitOfMeasure, 'orderedQuantity', line.orderedQuantity, 'packagingTypeId', line.packagingTypeId, 'valueAddingNote', line.valueAddingNote, 'ending', CASE WHEN line.endingRecordedAt IS NULL THEN NULL ELSE json_build_object('kind', line.endingKind, 'quantity', line.endingQuantity, 'recordedByUserId', line.endingRecordedByUserId, 'recordedAt', ${utcIsoText('line.endingRecordedAt')}, ${condition}) END, 'deliveryMode', line.deliveryMode, 'warehouseDestination', ${WAREHOUSE_DESTINATION_SELECT}${customerDestination}, 'links', (${linksSubquery(manager, identified)}))`;
};

// The joins the two destination projections above dereference, added to whichever query builds a
// line. The Warehouse is joined for **both** forms — its own address is not customer identity — and
// the Customer and its Delivery Address only for the identified one, so the redacted query does not
// even visit the rows it must not disclose (AC-09a, AC-10).
//
// A module-level function rather than a repository method: repository classes carry no private
// methods, and both reads below need exactly the same three joins
// (creating-a-server-repository.md).
const joinLineDestinations = <T extends SelectQueryBuilder<ObjectLiteral>>(
  query: T,
  identified: boolean,
): T => {
  query.leftJoin(
    WarehouseEntity,
    'lineWarehouse',
    'lineWarehouse.id = line.warehouseId',
  );

  if (identified) {
    query.leftJoin(
      CustomerDeliveryAddressEntity,
      'lineAddress',
      'lineAddress.id = line.customerDeliveryAddressId',
    );
    query.leftJoin(
      CustomerEntity,
      'lineCustomer',
      'lineCustomer.id = lineAddress.customerId',
    );
  }

  return query;
};

// The draft header shared by `listDrafts` and both detail reads, selected once so the three can
// never disagree about a column.
const selectDraftHeader = <T extends SelectQueryBuilder<ObjectLiteral>>(
  query: T,
): T =>
  query
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
    .addSelect(
      `EXISTS (${hasDriftSignalSubquery(query.connection.manager)})`,
      'hasDriftSignal',
    )
    .addSelect(
      `EXISTS (${hasDirectToCustomerAddressDriftSubquery(query.connection.manager)})`,
      'hasDirectToCustomerAddressDrift',
    );

// One opened draft, in whichever of the two forms the observed Permission selects. Written once and
// parameterized, so the identified and redacted reads can differ only in the columns they name.
const readDraftRow = async <TLine>(
  manager: EntityManager,
  purchaseDraftId: string,
  warehouseId: string,
  identified: boolean,
  withCause: boolean,
): Promise<
  | (Omit<DraftDetailRawRow<TLine>, 'lines'> & {
      readonly lineCount: number;
      readonly lines: readonly TLine[];
    })
  | null
> => {
  const lines = joinLineDestinations(
    manager
      .createQueryBuilder()
      .select(
        `COALESCE(json_agg(${lineJsonObject(manager, identified, withCause)} ORDER BY line.createdAt, line.id), '[]'::json)`,
      )
      .from(PurchaseDraftLineEntity, 'line')
      .innerJoin(ItemEntity, 'item', 'item.id = line.itemId'),
    identified,
  )
    .where('line.purchaseDraftId = draft.id')
    .getQuery();

  const row = await selectDraftHeader(
    manager.getRepository(PurchaseDraftEntity).createQueryBuilder('draft'),
  )
    .addSelect(`(${lines})`, 'lines')
    .where('draft.id = :purchaseDraftId', { purchaseDraftId })
    .andWhere('draft.warehouseId = :warehouseId', { warehouseId })
    .getRawOne<DraftDetailRawRow<TLine>>();

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
};

// The by-line read, in whichever of the two forms the observed Permission selects.
const listLineRows = <TLine>(
  manager: EntityManager,
  warehouseId: string,
  filters: PurchaseDraftLineFilters,
  identified: boolean,
  withCause: boolean,
): Promise<LineListEntryRawRow<TLine>[]> => {
  let query = joinLineDestinations(
    manager
      .createQueryBuilder()
      .select('draft.id', 'purchaseDraftId')
      .addSelect('draft.reference', 'purchaseDraftReference')
      .addSelect('draft.state', 'purchaseDraftState')
      .addSelect(EXPECTED_ARRIVAL_DATE_SELECT, 'expectedArrivalDate')
      .addSelect(lineJsonObject(manager, identified, withCause), 'line')
      .from(PurchaseDraftLineEntity, 'line')
      .innerJoin(
        PurchaseDraftEntity,
        'draft',
        'draft.id = line.purchaseDraftId',
      )
      .innerJoin(ItemEntity, 'item', 'item.id = line.itemId'),
    identified,
  )
    .where('draft.warehouseId = :warehouseId', { warehouseId })
    // openapi.yaml — Delivery Mode, then draft reference, then the line's own position. Every line
    // of a draft is written with the same timestamp (`purchase-draft-assembly.repository.ts`
    // "assemble"), so `line.id` breaks that tie deterministically.
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

  return query.getRawMany<LineListEntryRawRow<TLine>>();
};

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

  // AC-16/AC-21a/AC-09a — one draft with its lines, links, Pre-receipt Requirements, per-line
  // destination, per-link drift comparison and Allocations, in one round trip, **without** customer
  // identity. A Closed draft (whichever route closed it) is returned exactly as an open draft is;
  // this read never writes anything. Scoped to the acting Warehouse: a draft that belongs to
  // another Warehouse reads as `null`, exactly as a missing one does.
  //
  // Two methods rather than one with a flag, following `CustomerOrderLifecycleRepository`'s (T13)
  // precedent: the redacted read is a *different query*, and naming it separately is what makes
  // "the redacted form selects no identity column" checkable at the call site.
  //
  // `cause` is the second, independent narrowing (AC-22, sad.md §6.3). It stays a parameter rather
  // than becoming four more named methods because it multiplies against `identified` rather than
  // replacing it — the line has four legal shapes, and eight methods would name the cross product
  // instead of the choice. It is a projection selector all the same: `cause_withheld` issues a
  // query that names no Reason, description, Disposition or amendment at all, so the withheld form
  // is built by not selecting those columns and never by fetching and deleting them.
  readRedactedDraft(
    purchaseDraftId: string,
    warehouseId: string,
    cause: RejectionCauseProjection = 'with_cause',
  ): Promise<PurchaseDraftDetailRedactedRead | null> {
    return readDraftRow<PurchaseDraftLineRedactedRead>(
      getEntityManager(this.dataSource),
      purchaseDraftId,
      warehouseId,
      false,
      cause === 'with_cause',
    );
  }

  // The same draft for an actor holding the observed `CUSTOMERS:WATCH`: the customer each link
  // names, the destination a Direct to Customer line ships to, and both sides of the AC-18 address
  // comparison (ADR 0001).
  readIdentifiedDraft(
    purchaseDraftId: string,
    warehouseId: string,
    cause: RejectionCauseProjection = 'with_cause',
  ): Promise<PurchaseDraftDetailIdentifiedRead | null> {
    return readDraftRow<PurchaseDraftLineIdentifiedRead>(
      getEntityManager(this.dataSource),
      purchaseDraftId,
      warehouseId,
      true,
      cause === 'with_cause',
    );
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
  // Scoped through the **draft's** Warehouse, the same ownership the other reads use.
  listRedactedLines(
    warehouseId: string,
    filters: PurchaseDraftLineFilters = {},
    cause: RejectionCauseProjection = 'with_cause',
  ): Promise<PurchaseDraftLineListEntryRedactedRead[]> {
    return listLineRows<PurchaseDraftLineRedactedRead>(
      getEntityManager(this.dataSource),
      warehouseId,
      filters,
      false,
      cause === 'with_cause',
    );
  }

  listIdentifiedLines(
    warehouseId: string,
    filters: PurchaseDraftLineFilters = {},
    cause: RejectionCauseProjection = 'with_cause',
  ): Promise<PurchaseDraftLineListEntryIdentifiedRead[]> {
    return listLineRows<PurchaseDraftLineIdentifiedRead>(
      getEntityManager(this.dataSource),
      warehouseId,
      filters,
      true,
      cause === 'with_cause',
    );
  }
}
