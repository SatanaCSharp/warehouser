import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';

// AC-07/AC-07a — creation of a second Item with a SKU already used in the same Warehouse is
// blocked, naming the Item that already holds it. openapi.yaml `ItemWriteConflict` `skuTaken`
// example: `details: { itemId, sku }`.
export const itemSkuTakenError = (
  existingItemId: string,
  sku: string,
): ApplicationError =>
  new ApplicationError(ErrorCode.ITEMS_SKU_TAKEN, {
    itemId: existingItemId,
    sku,
  });

// AC-06c — a SKU stops being correctable once a Customer Order or a Purchase Draft Line names the
// Item. openapi.yaml `ItemWriteConflict` `skuFixed` example carries no `details`.
export const itemSkuFixedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ITEMS_SKU_FIXED);

// openapi.yaml `ItemUnavailable` — one non-enumerating outcome for a foreign-Warehouse, missing,
// or (where the operation records a new reference) Inactive Item target; discloses nothing
// further.
export const itemTargetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ITEMS_TARGET_UNAVAILABLE);

// AC-09 — a negative or fractional count is refused in plain language, changing nothing.
// openapi.yaml `InvalidOnHandAdjustment` `negativeOrFractional` example:
// `details: { field: "countedQuantity", rule: "non_negative_integer" }`.
export const itemInvalidOnHandQuantityError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ITEMS_INVALID_ON_HAND_QUANTITY, {
    field: 'countedQuantity',
    rule: 'non_negative_integer',
  });

// AC-09a — every change to On-hand Quantity is recorded with its reason, so an adjustment without
// one is refused. openapi.yaml `InvalidOnHandAdjustment` `reasonMissing` example:
// `details: { field: "reason" }`.
export const itemAdjustmentReasonRequiredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ITEMS_ADJUSTMENT_REASON_REQUIRED, {
    field: 'reason',
  });
