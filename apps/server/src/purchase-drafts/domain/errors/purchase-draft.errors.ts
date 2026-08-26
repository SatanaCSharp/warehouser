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

// sad.md §6.11 (T13) — closure resolves the draft only in Ready for Ordering; a draft not in that
// state refuses with the generic transition-state code. openapi.yaml
// `PurchaseDraftTransitionConflict` `invalidState` example carries no `details`.
export const purchaseDraftInvalidStateError = (): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_INVALID_STATE);
