import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

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
