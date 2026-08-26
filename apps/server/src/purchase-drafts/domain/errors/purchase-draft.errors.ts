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
