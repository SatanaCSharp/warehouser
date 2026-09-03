// `purchase-drafts/domain/errors/purchase-draft.errors.ts` does not exist yet (T12) — this is the
// RED for the named error factories server-error-handling.md §3 requires: close to their
// assertion, `Error` suffix, accepting every value required to construct the error. Codes and
// `details` shapes mirror `openapi.yaml`'s `PurchaseDraftTargetUnavailable`,
// `InvalidPurchaseDraftInput` and `PurchaseDraftWriteConflict` response examples exactly (AC-11,
// AC-13, AC-15).
import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import {
  purchaseDraftArrivalAlreadyConfirmedError,
  purchaseDraftArrivalNoLinesError,
  purchaseDraftArrivalRepeatedLineError,
  purchaseDraftArrivalUnknownLineError,
  purchaseDraftConcurrentChangeError,
  purchaseDraftDeliveryAddressDisagreementError,
  purchaseDraftDiscardUnavailableError,
  purchaseDraftEmptyError,
  purchaseDraftEndingAlreadyRecordedError,
  purchaseDraftEndingModeMismatchError,
  purchaseDraftFrozenError,
  purchaseDraftInvalidDeliveryDestinationError,
  purchaseDraftInvalidStateError,
  purchaseDraftTargetUnavailableError,
  purchaseDraftUnknownPackagingTypeError,
  purchaseDraftWarehouseDeliveryAddressRequiredError,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  DeliveryMode,
  EndingKind,
} from 'purchase-drafts/domain/value-objects/delivery-mode';

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

  // T15/AC-17b (sad.md §8) — a pre-read that already finds the draft outside Ready for Ordering
  // never reaches the guarded write. openapi.yaml `ArrivalConfirmationConflict` `alreadyConfirmed`
  // example carries no `details`.
  it('builds a non-enumerating ApplicationError for a second confirmation', () => {
    const error = purchaseDraftArrivalAlreadyConfirmedError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ARRIVAL_ALREADY_CONFIRMED,
    });
    expect(error.details).toBeUndefined();
  });

  // T15/AC-15 — the confirmation named a line that is not a line of the draft being confirmed.
  // openapi.yaml `InvalidPurchaseDraftInput` fixes the `details: { field, rule }` shape.
  it('builds an ApplicationError naming the lines a confirmation may not reach', () => {
    const offending = ['00000000-0000-4000-8000-0000000004ab'];
    const error = purchaseDraftArrivalUnknownLineError(offending);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
    });
    expect(error.details).toEqual({
      field: 'lines[].purchaseDraftLineId',
      rule: 'line_of_this_draft',
      purchaseDraftLineIds: offending,
    });
  });

  // spec.md §6.1 "Cross-Warehouse demand reach" / "Customer disclosure through denial" — the whole
  // non-enumeration claim of this write path, asserted directly rather than inferred from two
  // integration cases. The factory has no way to distinguish the three situations because it is
  // never told which one occurred: the caller decides membership of *this* draft's lines, so a
  // line of another Warehouse, a line of another draft, and a line that does not exist at all
  // produce a byte-identical refusal. A member cannot probe for what exists elsewhere.
  it('refuses identically whether the line is foreign, another draft, or nonexistent', () => {
    const foreignWarehouseLine = '00000000-0000-4000-8000-0000000004ab';
    const anotherDraftLine = '00000000-0000-4000-8000-0000000004cd';
    const nonexistentLine = '00000000-0000-4000-8000-0000000004ef';

    const refusals = [
      foreignWarehouseLine,
      anotherDraftLine,
      nonexistentLine,
    ].map((id) => {
      const error = purchaseDraftArrivalUnknownLineError([id]);
      return JSON.stringify({ code: error.code, details: error.details });
    });

    // Identical but for the caller's own submitted identifier, which discloses nothing it did not
    // already supply.
    const normalised = refusals.map((refusal) =>
      refusal
        .replace(foreignWarehouseLine, '<id>')
        .replace(anotherDraftLine, '<id>')
        .replace(nonexistentLine, '<id>'),
    );
    expect(new Set(normalised).size).toBe(1);
  });

  // T15/AC-18 — one line named twice would split the per-line bound across two entries.
  it('builds an ApplicationError for a repeated line', () => {
    const error = purchaseDraftArrivalRepeatedLineError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
    });
    expect(error.details).toEqual({
      field: 'lines[].purchaseDraftLineId',
      rule: 'one_entry_per_line',
    });
  });

  // T15/AC-17 — openapi.yaml `ArrivalConfirmation.lines` carries `minItems: 1`; this is the domain
  // invariant behind that transport-tier guard.
  it('builds an ApplicationError for a confirmation stating no lines', () => {
    const error = purchaseDraftArrivalNoLinesError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
    });
    expect(error.details).toEqual({
      field: 'lines',
      rule: 'at_least_one_line',
    });
  });
});

// T14 — the delivery-addresses refusals. Codes and `details` shapes mirror `openapi.yaml`'s
// `PurchaseDraftLineWriteConflict`, `PurchaseDraftReadinessConflict` and
// `PurchaseDraftLineEndingConflict` response examples exactly (AC-14, AC-15a, AC-16a, AC-20,
// AC-20a).
describe('purchase-draft delivery error factories', () => {
  // AC-14 — "goods shipped to their own site are travelling Via Warehouse, so a Direct to Customer
  // line names a customer's address". openapi.yaml `PurchaseDraftLineWriteConflict`
  // `warehouseAddressOnDirectLine` example: `details: { field: "customerDeliveryAddressId" }`, the
  // destination field the design handoff binds the error to (`IcUGb`).
  it('builds an ApplicationError bound to the destination field for the Warehouse’s own address on a direct line', () => {
    const error = purchaseDraftInvalidDeliveryDestinationError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_DELIVERY_DESTINATION,
    });
    expect(error.details).toEqual({ field: 'customerDeliveryAddressId' });
  });

  // AC-15a — every disagreeing link is named and none is withdrawn, because which link to withdraw
  // is the member's decision. openapi.yaml `disagreeingLinks` example:
  // `details: { disagreeingLinks: [{ purchaseDraftLineLinkId, customerOrderId,
  // lineDeliveryAddressId, customerOrderDeliveryAddressId }] }`.
  it('builds an ApplicationError naming every disagreeing link', () => {
    const disagreeingLinks = [
      {
        purchaseDraftLineLinkId: '00000000-0000-4000-8000-000000000501',
        customerOrderId: '00000000-0000-4000-8000-000000000601',
        lineDeliveryAddressId: '00000000-0000-4000-8000-000000000301',
        customerOrderDeliveryAddressId: '00000000-0000-4000-8000-000000000302',
      },
      {
        purchaseDraftLineLinkId: '00000000-0000-4000-8000-000000000502',
        customerOrderId: '00000000-0000-4000-8000-000000000602',
        lineDeliveryAddressId: '00000000-0000-4000-8000-000000000301',
        customerOrderDeliveryAddressId: '00000000-0000-4000-8000-000000000303',
      },
    ];

    const error =
      purchaseDraftDeliveryAddressDisagreementError(disagreeingLinks);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT,
    });
    expect(error.details).toEqual({ disagreeingLinks });
  });

  // AC-16a — a line coming to the warehouse cannot be frozen before the warehouse has an address to
  // be delivered to, and the refusal names the capability that records one. openapi.yaml
  // `PurchaseDraftReadinessConflict` `warehouseAddressRequired` example:
  // `details: { requiredPermissionId: "WAREHOUSES:ADDRESS_UPDATE" }` — a Workspace Permission,
  // because the subject of that write is the Warehouse record (sad.md §7).
  it('builds an ApplicationError naming the capability that records the Warehouse’s address', () => {
    const error = purchaseDraftWarehouseDeliveryAddressRequiredError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_WAREHOUSE_DELIVERY_ADDRESS_REQUIRED,
    });
    expect(error.details).toEqual({
      requiredPermissionId: WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
    });
  });

  // AC-20 — the refusal names which of the two ways that line's goods travelled. openapi.yaml
  // `PurchaseDraftLineEndingConflict` `modeMismatch` example:
  // `details: { deliveryMode: "direct_to_customer" }`.
  it('builds an ApplicationError naming the way the line’s goods travelled', () => {
    const error = purchaseDraftEndingModeMismatchError(
      DeliveryMode.DirectToCustomer,
    );

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ENDING_MODE_MISMATCH,
    });
    expect(error.details).toEqual({ deliveryMode: 'direct_to_customer' });
  });

  it('names a Via Warehouse line as the other of the two ways', () => {
    const error = purchaseDraftEndingModeMismatchError(
      DeliveryMode.ViaWarehouse,
    );

    expect(error.details).toEqual({ deliveryMode: 'via_warehouse' });
  });

  // AC-20a — "tells the member that this line's ending is already recorded, naming when and by
  // whom". openapi.yaml `alreadyRecorded` example: `details: { endingKind,
  // endingRecordedByUserId, endingRecordedAt }`, the instant as the ISO-8601 string the envelope
  // carries.
  it('builds an ApplicationError naming when and by whom the ending was recorded', () => {
    const endingRecordedAt = new Date('2026-09-18T10:00:00.000Z');

    const error = purchaseDraftEndingAlreadyRecordedError({
      endingKind: EndingKind.Arrival,
      endingRecordedByUserId: '00000000-0000-4000-8000-000000000001',
      endingRecordedAt,
    });

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ENDING_ALREADY_RECORDED,
    });
    expect(error.details).toEqual({
      endingKind: 'arrival',
      endingRecordedByUserId: '00000000-0000-4000-8000-000000000001',
      endingRecordedAt: '2026-09-18T10:00:00.000Z',
    });
  });
});
