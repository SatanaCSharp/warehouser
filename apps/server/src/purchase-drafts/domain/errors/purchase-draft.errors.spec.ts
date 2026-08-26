// `purchase-drafts/domain/errors/purchase-draft.errors.ts` does not exist yet (T12) — this is the
// RED for the named error factories server-error-handling.md §3 requires: close to their
// assertion, `Error` suffix, accepting every value required to construct the error. Codes and
// `details` shapes mirror `openapi.yaml`'s `PurchaseDraftTargetUnavailable`,
// `InvalidPurchaseDraftInput` and `PurchaseDraftWriteConflict` response examples exactly (AC-11,
// AC-13, AC-15).
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import {
  purchaseDraftConcurrentChangeError,
  purchaseDraftDiscardUnavailableError,
  purchaseDraftEmptyError,
  purchaseDraftFrozenError,
  purchaseDraftInvalidStateError,
  purchaseDraftTargetUnavailableError,
  purchaseDraftUnknownPackagingTypeError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';

describe('purchase-draft domain error factories', () => {
  // AC-11 — one non-enumerating outcome for an Item or a Customer Order of another Warehouse and
  // for one that does not exist, naming the same-Warehouse rule. openapi.yaml
  // `PurchaseDraftTargetUnavailable` `crossWarehouseTarget` example carries no `details`.
  it('builds a non-enumerating ApplicationError for a cross-Warehouse target', () => {
    const error = purchaseDraftTargetUnavailableError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(error.details).toBeUndefined();
  });

  // AC-13 — the refusal names which Packaging Types the catalogue offers. openapi.yaml
  // `InvalidPurchaseDraftInput` `unknownPackagingType` example:
  // `details: { field: "packagingTypeId", packagingTypeIds: [...] }`.
  it('builds an ApplicationError naming the Packaging Types the catalogue offers', () => {
    const packagingTypeIds = [
      'loose_items',
      'cartons',
      'pallets',
      'cable_coil',
    ];

    const error = purchaseDraftUnknownPackagingTypeError(packagingTypeIds);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_UNKNOWN_PACKAGING_TYPE,
      details: { field: 'packagingTypeId', packagingTypeIds },
    });
  });

  // AC-15/AC-10a — a draft that no longer resolves in the `draft` state refuses the write; the
  // reason is the state guard, not a validation failure. openapi.yaml `PurchaseDraftWriteConflict`
  // `frozen` example carries no `details`.
  it('builds an ApplicationError for a draft that is no longer in the draft state', () => {
    const error = purchaseDraftFrozenError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN,
    });
    expect(error.details).toBeUndefined();
  });

  // AC-14a (T13) — a draft holding no lines cannot be moved to Ready for Ordering. openapi.yaml
  // `PurchaseDraftTransitionConflict` `emptyDraft` example carries no `details`.
  it('builds an ApplicationError for a draft that holds no lines', () => {
    const error = purchaseDraftEmptyError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_EMPTY,
    });
    expect(error.details).toBeUndefined();
  });

  // AC-24a (T13) — a draft that has been made ready is closed with a reason rather than
  // discarded. openapi.yaml `PurchaseDraftWriteConflict` `discardAfterReady` example carries no
  // `details`.
  it('builds an ApplicationError for a discard attempt against a draft that has been made ready', () => {
    const error = purchaseDraftDiscardUnavailableError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DISCARD_UNAVAILABLE,
    });
    expect(error.details).toBeUndefined();
  });

  // sad.md §8/§6.7 (T13) — the second of two concurrent freezes affects no row and is refused
  // rather than merged. openapi.yaml `PurchaseDraftTransitionConflict` `concurrentTransition`
  // example carries no `details`.
  it('builds an ApplicationError for the loser of two concurrent transitions', () => {
    const error = purchaseDraftConcurrentChangeError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_CONCURRENT_CHANGE,
    });
    expect(error.details).toBeUndefined();
  });

  // sad.md §6.11 (T13) — closure resolves the draft only in Ready for Ordering; a draft not in
  // that state refuses with the generic transition-state code. openapi.yaml
  // `PurchaseDraftTransitionConflict` `invalidState` example carries no `details`.
  it('builds an ApplicationError for a transition attempted from the wrong state', () => {
    const error = purchaseDraftInvalidStateError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_STATE,
    });
    expect(error.details).toBeUndefined();
  });
});
