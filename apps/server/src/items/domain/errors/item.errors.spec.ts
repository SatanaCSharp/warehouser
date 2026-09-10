// T5 — `items/domain/errors/item.errors.ts` does not exist yet. This is the legitimate RED for the
// named error factories server-error-handling.md §3 requires: close to their assertion, `Error`
// suffix, accepting every value required to construct the error. Codes and `details` shapes mirror
// `openapi.yaml`'s `ItemWriteConflict`/`ItemUnavailable` response examples exactly (AC-06c, AC-07).
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import {
  itemAdjustmentReasonRequiredError,
  itemInvalidOnHandQuantityError,
  itemSkuFixedError,
  itemSkuTakenError,
  itemTargetUnavailableError,
} from 'items/domain/errors/item.errors.js';
import { describe, expect, it } from 'vitest';

describe('item domain error factories', () => {
  // AC-07 — creation is blocked and the response names the Item that already holds the SKU.
  // openapi.yaml `ItemWriteConflict` `skuTaken` example: `details: { itemId, sku }`.
  it('builds an ApplicationError naming the Item that already holds the SKU', () => {
    const existingItemId = '00000000-0000-4000-8000-000000000101';
    const sku = 'TEST-SKU-0001';

    const error = itemSkuTakenError(existingItemId, sku);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.ITEMS_SKU_TAKEN,
      details: { itemId: existingItemId, sku },
    });
  });

  // AC-06c — a SKU stops being correctable once demand or a draft names the Item.
  // openapi.yaml `ItemWriteConflict` `skuFixed` example carries no `details`.
  it('builds an ApplicationError for a SKU that has stopped being correctable', () => {
    const error = itemSkuFixedError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({ code: ErrorCode.ITEMS_SKU_FIXED });
    expect(error.details).toBeUndefined();
  });

  // openapi.yaml `ItemUnavailable` — one non-enumerating outcome for a foreign-Warehouse, missing,
  // or (where the operation records a new reference) Inactive Item; discloses nothing further.
  it('builds a non-enumerating ApplicationError for an unavailable Item target', () => {
    const error = itemTargetUnavailableError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({ code: ErrorCode.ITEMS_TARGET_UNAVAILABLE });
    expect(error.details).toBeUndefined();
  });
});

// T6 — `itemInvalidOnHandQuantityError` and `itemAdjustmentReasonRequiredError` do not exist yet.
// This is the legitimate RED for AC-09/AC-09a's error half: the two codes and their `details`
// shapes are copied from `openapi.yaml`'s `InvalidOnHandAdjustment` response examples, which the
// REST surface (T7) will answer with verbatim.
describe('on-hand adjustment error factories', () => {
  // AC-09 — openapi.yaml `InvalidOnHandAdjustment` `negativeOrFractional` example:
  // `details: { field: "countedQuantity", rule: "non_negative_integer" }`.
  it('builds an ApplicationError naming the counted figure it will not accept', () => {
    const error = itemInvalidOnHandQuantityError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.ITEMS_INVALID_ON_HAND_QUANTITY,
      details: { field: 'countedQuantity', rule: 'non_negative_integer' },
    });
  });

  // AC-09a — openapi.yaml `InvalidOnHandAdjustment` `reasonMissing` example:
  // `details: { field: "reason" }`.
  it('builds an ApplicationError naming the missing reason', () => {
    const error = itemAdjustmentReasonRequiredError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.ITEMS_ADJUSTMENT_REASON_REQUIRED,
      details: { field: 'reason' },
    });
  });
});
