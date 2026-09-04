import type {
  PurchaseDraftDetail,
  PurchaseDraftLine,
  PurchaseDraftLineIdentified,
  PurchaseDraftLineLinkIdentified,
  PurchaseDraftLineLinkRedacted,
  PurchaseDraftLineListEntry,
  PurchaseDraftLineRedacted,
  PurchaseDraftSummary,
} from '@warehouser/contracts/purchase-drafts';
import type {
  PurchaseDraftLineLinkIdentifiedWithDrift,
  PurchaseDraftLineLinkRedactedWithDrift,
} from 'purchase-drafts/usecases/queries/drift-signals';
import type { PurchaseDraftLineListEntryWithDrift } from 'purchase-drafts/usecases/queries/list-purchase-draft-lines.query';
import type {
  PurchaseDraftDetailWithDrift,
  PurchaseDraftLineIdentifiedWithDrift,
  PurchaseDraftLineWithDrift,
} from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import { identifiesCustomer } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import type { PurchaseDraftSummaryRead } from 'shared/domain/repositories/purchase-draft-read.repository';

// openapi.yaml `PurchaseDraftSummary`/`PurchaseDraftDetail`/`PurchaseDraftLineListEntry` — the
// transport form of the three purchase-draft projections, each in the shapes AC-09a models as
// `oneOf` (ADR 0001).
//
// **Every property is named rather than spread**, for the reason `DemandController` and T18's note
// on this file's predecessor both give: a spread satisfies the contract type without excess-property
// checking, so an identity field added to the read later would travel straight through a mapper into
// a response that has no Permission for it, although every form of the contract is
// `additionalProperties: false`. Naming the properties is what makes that impossible, and here it
// also carries the confidentiality boundary — the redacted branches below cannot name `customer`,
// `customerName`, `customerDestination` or either side of the address comparison, because the
// redacted projection types have no such property to read.
//
// The application boundary returns instants as `Date`; the contract carries every summary instant as
// a date-time. `expectedArrivalDate`, `capturedNeededBy` and `neededBy` are already calendar dates
// and travel untouched.

export const toSummaryResponse = (
  summary: PurchaseDraftSummaryRead,
): PurchaseDraftSummary => ({
  id: summary.id,
  reference: summary.reference,
  state: summary.state as PurchaseDraftSummary['state'],
  expectedArrivalDate: summary.expectedArrivalDate,
  lineCount: summary.lineCount,
  hasDriftSignal: summary.hasDriftSignal,
  hasDirectToCustomerAddressDrift: summary.hasDirectToCustomerAddressDrift,
  closureReason: summary.closureReason,
  createdByUserId: summary.createdByUserId,
  createdAt: summary.createdAt.toISOString(),
  readiedByUserId: summary.readiedByUserId,
  readiedAt: summary.readiedAt?.toISOString() ?? null,
  closedByUserId: summary.closedByUserId,
  closedAt: summary.closedAt?.toISOString() ?? null,
  arrivalConfirmedByUserId: summary.arrivalConfirmedByUserId,
  arrivalConfirmedAt: summary.arrivalConfirmedAt?.toISOString() ?? null,
  discardedByUserId: summary.discardedByUserId,
  discardedAt: summary.discardedAt?.toISOString() ?? null,
});

// openapi.yaml `PurchaseDraftLineLinkRedacted` — `driftSignals` is here rather than in the
// identified half deliberately: **that** an address drift exists is a fact about the draft, not
// customer identity, and withholding it would tell an entitled member less than AC-18a promises.
const toRedactedLinkResponse = (
  link: PurchaseDraftLineLinkRedactedWithDrift,
): PurchaseDraftLineLinkRedacted => ({
  id: link.id,
  customerOrderId: link.customerOrderId,
  statedQuantity: link.statedQuantity,
  snapshot:
    link.snapshot === null
      ? null
      : {
          capturedQuantity: link.snapshot.capturedQuantity,
          capturedNeededBy: link.snapshot.capturedNeededBy,
          capturedState: link.snapshot
            .capturedState as PurchaseDraftLineLinkRedacted['current']['state'],
        },
  current: {
    quantity: link.current.quantity,
    neededBy: link.current.neededBy,
    state: link.current
      .state as PurchaseDraftLineLinkRedacted['current']['state'],
    outstandingQuantity: link.current.outstandingQuantity,
    lastChangedAt: link.current.lastChangedAt,
  },
  driftSignals:
    link.driftSignals as PurchaseDraftLineLinkRedacted['driftSignals'],
  allocation: link.allocation,
});

// openapi.yaml `PurchaseDraftLineLinkIdentified` — the same link with the customer it names and
// both sides of the AC-18 comparison: the address captured at the freeze and the one the demand now
// expects.
const toIdentifiedLinkResponse = (
  link: PurchaseDraftLineLinkIdentifiedWithDrift,
): PurchaseDraftLineLinkIdentified => ({
  ...toRedactedLinkResponse(link),
  customer: link.customer,
  customerName: link.customerName,
  snapshot:
    link.snapshot === null
      ? null
      : {
          capturedQuantity: link.snapshot.capturedQuantity,
          capturedNeededBy: link.snapshot.capturedNeededBy,
          capturedState: link.snapshot
            .capturedState as PurchaseDraftLineLinkIdentified['current']['state'],
          capturedDeliveryAddressId: link.snapshot.capturedDeliveryAddressId,
          capturedDeliveryAddressText:
            link.snapshot.capturedDeliveryAddressText,
        },
  current: {
    quantity: link.current.quantity,
    neededBy: link.current.neededBy,
    state: link.current
      .state as PurchaseDraftLineLinkIdentified['current']['state'],
    outstandingQuantity: link.current.outstandingQuantity,
    lastChangedAt: link.current.lastChangedAt,
    deliveryAddress:
      link.current.deliveryAddress === null
        ? null
        : {
            deliveryAddressId: link.current.deliveryAddress.deliveryAddressId,
            addressText: link.current.deliveryAddress.addressText,
            accessNotes: link.current.deliveryAddress.accessNotes,
            isMain: link.current.deliveryAddress.isMain,
            deactivatedAt: link.current.deliveryAddress.deactivatedAt,
          },
  },
});

// openapi.yaml `PurchaseDraftLineRedacted` minus its links — everything a line carries whatever the
// actor may read. `warehouseDestination` is part of it and not of the identified half: the
// Warehouse's own address and access notes are the operator's premises data, read under
// `PURCHASE_DRAFTS:WATCH` alone by a member who may hold no Workspace Role at all (AC-10,
// sad.md §7).
const toLineCommonResponse = (
  line: PurchaseDraftLineWithDrift,
): Omit<PurchaseDraftLineRedacted, 'links'> => ({
  id: line.id,
  itemId: line.itemId,
  itemSku: line.itemSku,
  itemDescription: line.itemDescription,
  unitOfMeasure: line.unitOfMeasure,
  orderedQuantity: line.orderedQuantity,
  packagingTypeId: line.packagingTypeId,
  valueAddingNote: line.valueAddingNote,
  receivedQuantity: line.receivedQuantity,
  ending: line.ending as PurchaseDraftLineRedacted['ending'],
  deliveryMode: line.deliveryMode as PurchaseDraftLineRedacted['deliveryMode'],
  warehouseDestination: line.warehouseDestination,
});

const toRedactedLineResponse = (
  line: PurchaseDraftLineWithDrift,
): PurchaseDraftLineRedacted => ({
  ...toLineCommonResponse(line),
  links: line.links.map(toRedactedLinkResponse),
});

const toIdentifiedLineResponse = (
  line: PurchaseDraftLineIdentifiedWithDrift,
): PurchaseDraftLineIdentified => ({
  ...toLineCommonResponse(line),
  customerDestination: line.customerDestination,
  links: line.links.map(toIdentifiedLinkResponse),
});

export const toLineResponse = (
  line: PurchaseDraftLineWithDrift,
): PurchaseDraftLine =>
  identifiesCustomer(line)
    ? toIdentifiedLineResponse(line)
    : toRedactedLineResponse(line);

export const toDetailResponse = (
  detail: PurchaseDraftDetailWithDrift,
): PurchaseDraftDetail => ({
  ...toSummaryResponse(detail),
  lines: detail.lines.map(toLineResponse),
});

// openapi.yaml `PurchaseDraftLineListEntry` — the line carries the draft it belongs to, so the
// by-line view reads without a second request (AC-22).
export const toLineListEntryResponse = (
  entry: PurchaseDraftLineListEntryWithDrift,
): PurchaseDraftLineListEntry => ({
  purchaseDraftId: entry.purchaseDraftId,
  purchaseDraftReference: entry.purchaseDraftReference,
  purchaseDraftState:
    entry.purchaseDraftState as PurchaseDraftLineListEntry['purchaseDraftState'],
  expectedArrivalDate: entry.expectedArrivalDate,
  line: toLineResponse(entry.line),
});
