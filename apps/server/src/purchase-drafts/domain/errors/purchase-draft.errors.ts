import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type {
  DeliveryMode,
  EndingKind,
} from 'purchase-drafts/domain/value-objects/delivery-mode';

// AC-11 — one non-enumerating outcome for an Item or a Customer Order of another Warehouse and for
// one that does not exist, naming the same-Warehouse rule. openapi.yaml
// `PurchaseDraftTargetUnavailable` `crossWarehouseTarget` example carries no `details`.
export const purchaseDraftTargetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE);

// AC-13 — the refusal names which Packaging Types the catalogue offers. openapi.yaml
// `InvalidPurchaseDraftInput` `unknownPackagingType` example:
// `details: { field: "packagingTypeId", packagingTypeIds: [...] }`.
export const purchaseDraftUnknownPackagingTypeError = (
  packagingTypeIds: readonly string[],
): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_UNKNOWN_PACKAGING_TYPE, {
    field: 'packagingTypeId',
    packagingTypeIds,
  });

// AC-15/AC-10a — a draft that no longer resolves in the `draft` state refuses the write; the reason
// is the state guard, not a validation failure. openapi.yaml `PurchaseDraftWriteConflict` `frozen`
// example carries no `details`.
export const purchaseDraftFrozenError = (): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN);

// AC-14a (T13) — a draft holding no lines cannot be moved to Ready for Ordering. openapi.yaml
// `PurchaseDraftTransitionConflict` `emptyDraft` example carries no `details`.
export const purchaseDraftEmptyError = (): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_DRAFT_EMPTY);

// AC-24a (T13) — a draft that has been made ready is closed with a reason rather than discarded.
// openapi.yaml `PurchaseDraftWriteConflict` `discardAfterReady` example carries no `details`.
export const purchaseDraftDiscardUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_DISCARD_UNAVAILABLE);

// sad.md §8/§6.7 (T13) — the second of two concurrent freezes affects no row and is refused rather
// than merged. openapi.yaml `PurchaseDraftTransitionConflict` `concurrentTransition` example
// carries no `details`.
export const purchaseDraftConcurrentChangeError = (): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_CONCURRENT_CHANGE);

// T15/AC-17b (sad.md §8) — a pre-read that already finds the draft outside Ready for Ordering
// (already Closed by an arrival, closed with a reason, or discarded) never reaches the guarded
// write. Distinct from `purchaseDraftConcurrentChangeError`, reserved for a pre-read that found the
// draft legal but whose guarded write still lost the race. openapi.yaml `ArrivalConfirmationConflict`
// `alreadyConfirmed` example carries no `details`.
export const purchaseDraftArrivalAlreadyConfirmedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_ARRIVAL_ALREADY_CONFIRMED);

// sad.md §6.11 (T13) — closure resolves the draft only in Ready for Ordering; a draft not in that
// state refuses with the generic transition-state code. openapi.yaml
// `PurchaseDraftTransitionConflict` `invalidState` example carries no `details`.
export const purchaseDraftInvalidStateError = (): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_INVALID_STATE);

// T15 review/AC-15/AC-18 — the confirmation payload named a line that is not a line of the draft
// being confirmed, or named one line twice. Both are payload faults rather than state conflicts, so
// both refuse with the documented 400 (openapi.yaml `InvalidPurchaseDraftInput`, whose
// `invalidQuantity` example fixes the `details: { field, rule }` shape).
//
// The refusal is deliberately identical whether the line belongs to another Warehouse, to another
// draft of this Warehouse, or does not exist at all: the check is membership of *this* draft's
// lines, so it discloses nothing about what exists elsewhere (spec.md §6.1 "Cross-Warehouse demand
// reach", "Customer disclosure through denial"). Echoing the offending identifiers back is safe
// because they are the caller's own submitted values.
export const purchaseDraftArrivalUnknownLineError = (
  purchaseDraftLineIds: readonly string[],
): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT, {
    field: 'lines[].purchaseDraftLineId',
    rule: 'line_of_this_draft',
    purchaseDraftLineIds,
  });

export const purchaseDraftArrivalRepeatedLineError = (): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT, {
    field: 'lines[].purchaseDraftLineId',
    rule: 'one_entry_per_line',
  });

// AC-17/openapi.yaml `ArrivalConfirmation.lines` `minItems: 1` — a confirmation that states nothing
// arrived at all is not a confirmation. Refuses with the documented 400 rather than closing a draft
// that records nothing.
export const purchaseDraftArrivalNoLinesError = (): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT, {
    field: 'lines',
    rule: 'at_least_one_line',
  });

// AC-14 — a Direct to Customer line names a customer's address; goods shipped to the member's own
// site are travelling Via Warehouse. The refusal is bound to the destination field the design
// handoff highlights (`IcUGb`) and names no address, because the Warehouse's own has no identifier
// to name. openapi.yaml `PurchaseDraftLineWriteConflict` `warehouseAddressOnDirectLine` example:
// `details: { field: "customerDeliveryAddressId" }`.
export const purchaseDraftInvalidDeliveryDestinationError =
  (): ApplicationError =>
    new ApplicationError(
      ErrorCode.PURCHASE_DRAFTS_INVALID_DELIVERY_DESTINATION,
      {
        field: 'customerDeliveryAddressId',
      },
    );

// AC-12/sad.md §6.7 step 4 — the Customer Delivery Address a Direct to Customer line names is not
// one of this Warehouse's. It does not exist, or it belongs to a Customer of another Warehouse, and
// **both fail identically**, so the refusal never discloses that the address exists elsewhere
// (spec.md §6.1). It carries no details for exactly that reason.
//
// The code is `customers.target_unavailable` rather than a purchase-drafts one because that is the
// code openapi.yaml `PurchaseDraftTargetUnavailable` documents for this case (`addressElsewhere`
// example): the subject of the refusal is the address, and a member reading it is told the same
// thing whichever surface named the address. A second named factory in this module against a code
// declared in `packages/shared-types` is the same shape the two disagreement factories below
// already use — the code identifies the rule, the factory names the moment.
//
// Until T19 this check did not exist at all, and an unknown or cross-Warehouse address reached
// `fk_purchase_draft_lines_delivery_address`, whose `QueryFailedError` the global filter reported
// as a **500** on an operation whose contract declares no internal failure.
export const purchaseDraftLineDeliveryAddressUnavailableError =
  (): ApplicationError =>
    new ApplicationError(ErrorCode.CUSTOMERS_TARGET_UNAVAILABLE);

// AC-12/AC-06b — the named address is this Warehouse's, and Inactive. A distinct refusal from the
// one above and deliberately so: the member picked a real address of a real Customer that has since
// been withdrawn, and telling them "unavailable" would hide the one fact they can act on. There is
// no database constraint that catches this at all, which is why the check is the write path's own
// (openapi.yaml `PurchaseDraftLineDestinationConflict`, "the named Customer Delivery Address is
// Inactive").
export const purchaseDraftLineDeliveryAddressInactiveError =
  (): ApplicationError =>
    new ApplicationError(ErrorCode.CUSTOMERS_INVALID_DELIVERY_ADDRESS);

// AC-15a — a Direct to Customer line serves only the demand going to the address it ships to, and
// the agreement is required continuously rather than only when the link was made. **Every**
// disagreeing link is named and none is withdrawn: which one to drop is the member's decision.
// openapi.yaml `disagreeingLinks` example fixes the entry shape below. Every value in it is a
// record of this Warehouse's own draft, which the actor is already reading.
//
// `customerOrderDeliveryAddressId` is nullable because a Customer Order recorded by typed name goes
// to no Delivery Address at all (`chk_customer_orders_customer_identity`), and such an order cannot
// agree with a directly-shipped line: there is nowhere for the supplier to ship to. Naming it as
// `null` says exactly that, where a non-nullable field could only misreport it.
export type DisagreeingDeliveryLink = {
  purchaseDraftLineLinkId: string;
  customerOrderId: string;
  lineDeliveryAddressId: string;
  customerOrderDeliveryAddressId: string | null;
};

export const purchaseDraftDeliveryAddressDisagreementError = (
  disagreeingLinks: readonly DisagreeingDeliveryLink[],
): ApplicationError =>
  new ApplicationError(
    ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT,
    {
      disagreeingLinks,
    },
  );

// AC-15 — the same rule at the moment **one** link is made, which openapi.yaml gives its own
// `details` shape: `PurchaseDraftLinkConflict` `addressDisagreement` carries
// `{ lineDeliveryAddressId, customerOrderDeliveryAddressId }` and enumerates nothing, because a
// single link is being refused rather than a set being named. It is a second named factory against
// the same code rather than a bending of the one above: the code identifies the rule, and the two
// moments the contract documents state it about different things — one prospective link here, every
// link on the line there (AC-15a).
export const purchaseDraftLinkDeliveryAddressDisagreementError = (
  lineDeliveryAddressId: string,
  customerOrderDeliveryAddressId: string | null,
): ApplicationError =>
  new ApplicationError(
    ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT,
    {
      lineDeliveryAddressId,
      customerOrderDeliveryAddressId,
    },
  );

// AC-16a — a line coming to the warehouse cannot be frozen before the warehouse has an address to
// be delivered to. The refusal names the capability that records one, which is a Workspace
// Permission because the subject of that write is the Warehouse record itself (sad.md §7).
// openapi.yaml `PurchaseDraftReadinessConflict` `warehouseAddressRequired` example:
// `details: { requiredPermissionId: "WAREHOUSES:ADDRESS_UPDATE" }`.
export const purchaseDraftWarehouseDeliveryAddressRequiredError =
  (): ApplicationError =>
    new ApplicationError(
      ErrorCode.PURCHASE_DRAFTS_WAREHOUSE_DELIVERY_ADDRESS_REQUIRED,
      { requiredPermissionId: WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE },
    );

// AC-20 — an Arrival Confirmation against a Direct to Customer line, or a Direct Delivery against a
// Via Warehouse one, is refused naming which of the two ways that line's goods travelled. The mode
// is what the member needs in order to know which act to perform instead. openapi.yaml
// `PurchaseDraftLineEndingConflict` `modeMismatch` example: `details: { deliveryMode }`.
export const purchaseDraftEndingModeMismatchError = (
  deliveryMode: DeliveryMode,
): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_ENDING_MODE_MISMATCH, {
    deliveryMode,
  });

// AC-20a — a second ending on one line is refused, changing nothing and assigning nothing further
// to any Customer Order, and the refusal names when and by whom the first was recorded. The three
// attribution values are read from the line, whose ending columns arrive together or not at all
// (`chk_purchase_draft_lines_ending_attribution`). The instant is carried as the ISO-8601 string the
// error envelope transports. openapi.yaml `PurchaseDraftLineEndingConflict` `alreadyRecorded`
// example: `details: { endingKind, endingRecordedByUserId, endingRecordedAt }`.
export const purchaseDraftEndingAlreadyRecordedError = (ending: {
  endingKind: EndingKind;
  endingRecordedByUserId: string;
  endingRecordedAt: Date;
}): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_ENDING_ALREADY_RECORDED, {
    endingKind: ending.endingKind,
    endingRecordedByUserId: ending.endingRecordedByUserId,
    endingRecordedAt: ending.endingRecordedAt.toISOString(),
  });
