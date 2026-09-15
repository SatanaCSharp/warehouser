// `purchase-drafts/domain/errors/purchase-draft.errors.ts` does not exist yet (T12) — this is the
// RED for the named error factories server-error-handling.md §3 requires: close to their
// assertion, `Error` suffix, accepting every value required to construct the error. Codes and
// `details` shapes mirror `openapi.yaml`'s `PurchaseDraftTargetUnavailable`,
// `InvalidPurchaseDraftInput` and `PurchaseDraftWriteConflict` response examples exactly (AC-11,
// AC-13, AC-15).
import {
  ErrorCode,
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import {
  conditionOnNothingReceivedViolation,
  descriptionRequiredViolation,
  descriptionTooLongViolation,
  duplicateRejectionReasonViolation,
  metContradictsRejectionViolation,
  notApplicableOnInstructedLineViolation,
  noteTooLongViolation,
  purchaseDraftArrivalAlreadyConfirmedError,
  purchaseDraftArrivalNoLinesError,
  purchaseDraftArrivalRepeatedLineError,
  purchaseDraftArrivalUnknownLineError,
  purchaseDraftConcurrentChangeError,
  purchaseDraftConditionSplitInvalidError,
  purchaseDraftDeliveryAddressDisagreementError,
  purchaseDraftDiscardUnavailableError,
  purchaseDraftDispositionNotReversibleError,
  purchaseDraftEmptyError,
  purchaseDraftEndingAlreadyRecordedError,
  purchaseDraftEndingConditionInputError,
  purchaseDraftEndingModeMismatchError,
  purchaseDraftFrozenError,
  purchaseDraftInvalidDeliveryDestinationError,
  purchaseDraftInvalidStateError,
  purchaseDraftPreReceiptConformanceInvalidError,
  purchaseDraftRejectionCapabilityRequiredError,
  purchaseDraftTargetUnavailableError,
  purchaseDraftUnknownDispositionError,
  purchaseDraftUnknownPackagingTypeError,
  purchaseDraftWarehouseDeliveryAddressRequiredError,
  quantityOutOfRangeViolation,
  rejectionsExceedReceivedViolation,
  sourceMismatchViolation,
  unknownRejectionReasonViolation,
  verdictOnUninstructedLineViolation,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  DeliveryMode,
  EndingKind,
} from 'purchase-drafts/domain/value-objects/delivery-mode';
import {
  PreReceiptConformanceVerdict,
  REJECTION_DISPOSITIONS,
  RejectionDisposition,
  RejectionSource,
} from 'purchase-drafts/domain/value-objects/line-condition';
import { describe, expect, it } from 'vitest';

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

// T7 — the arrival-inspection refusals. Codes are the four `packages/shared-types` gained for this
// feature plus the reused `purchase_drafts.invalid_input`, one per sad.md §6 refusal branch
// (contracts/api-sync-report.md §2). `details` shapes mirror `openapi.yaml`'s
// `InvalidLineEndingConditionInput`, `RejectionAmendmentConflict` and
// `PurchaseDraftLineEndingForbidden` response examples exactly.
//
// The violation factories below are a separate surface from the error factories deliberately:
// sad.md §6.1 steps 5–6 require the member's whole submission judged in one pass, so **collecting**
// the violations is T8's, and each rule contributes one entry rather than one refusal.
describe('arrival-inspection refusal codes', () => {
  const NEW_CODES = [
    ErrorCode.PURCHASE_DRAFTS_REJECTION_CAPABILITY_REQUIRED,
    ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID,
    ErrorCode.PURCHASE_DRAFTS_PRE_RECEIPT_CONFORMANCE_INVALID,
    ErrorCode.PURCHASE_DRAFTS_DISPOSITION_NOT_REVERSIBLE,
  ];

  // contracts/api-sync-report.md §2 — the four codes this feature adds, and no fifth. Each is
  // exported from `packages/shared-types` under the `module.error_name` convention.
  it('declares the four codes this feature adds, each distinct', () => {
    expect(NEW_CODES).toEqual([
      'purchase_drafts.rejection_capability_required',
      'purchase_drafts.condition_split_invalid',
      'purchase_drafts.pre_receipt_conformance_invalid',
      'purchase_drafts.disposition_not_reversible',
    ]);
    expect(new Set(NEW_CODES).size).toBe(NEW_CODES.length);
  });
});

describe('arrival-inspection error factories', () => {
  // AC-01a/ADR 0001 — a submission that refuses needs the refusing capability, and the refusal
  // names it so the surface can say which one. It names **no** Rejection: no Reason, description,
  // quantity or Disposition appears in a denial payload (openapi.yaml
  // `rejectionCapabilityRequired`: `details: { requiredPermissionId: "REJECTIONS:CREATE" }`).
  it('builds an ApplicationError naming the capability that refuses goods', () => {
    const error = purchaseDraftRejectionCapabilityRequiredError();

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_REJECTION_CAPABILITY_REQUIRED,
    });
    expect(error.details).toEqual({
      requiredPermissionId: PermissionId.REJECTIONS_CREATE,
    });
  });

  // AC-02, AC-06, AC-07, AC-09, AC-25 — one code for the whole Condition Split branch, carrying
  // every violation collected in one pass together with the two figures the member is correcting
  // (openapi.yaml `conditionSplitViolations`).
  it('builds an ApplicationError carrying every Condition Split violation at once', () => {
    const violations = [
      rejectionsExceedReceivedViolation(100, 118),
      duplicateRejectionReasonViolation('damaged_in_transit'),
    ];

    const error = purchaseDraftConditionSplitInvalidError({
      receivedQuantity: 100,
      rejectedQuantity: 118,
      violations,
    });

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID,
    });
    expect(error.details).toEqual({
      receivedQuantity: 100,
      rejectedQuantity: 118,
      violations,
    });
  });

  // AC-16, AC-17, AC-17a — the Conformance branch, judged against the same locked line. It carries
  // the violations alone: no quantity is in question (openapi.yaml `conformanceViolations`).
  it('builds an ApplicationError carrying every Pre-receipt Conformance violation at once', () => {
    const violations = [
      metContradictsRejectionViolation('packaging_not_as_instructed'),
    ];

    const error = purchaseDraftPreReceiptConformanceInvalidError(violations);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_PRE_RECEIPT_CONFORMANCE_INVALID,
    });
    expect(error.details).toEqual({ violations });
  });

  // AC-03, AC-14, AC-15b, AC-04a — the payload's own bounds, refused under the reused
  // `purchase_drafts.invalid_input` rather than under either condition code, exactly as
  // contracts/api-sync-report.md §4 maps the branch (openapi.yaml `payloadShape`).
  it('builds an ApplicationError carrying the payload’s own violations', () => {
    const violations = [
      quantityOutOfRangeViolation('rejections.0.quantity'),
      descriptionTooLongViolation('rejections.1.description'),
    ];

    const error = purchaseDraftEndingConditionInputError(violations);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
    });
    expect(error.details).toEqual({ violations });
  });

  // AC-19 — "the system tells the member which dispositions are available". The refusal carries the
  // offered set and nothing else (openapi.yaml `unknownDisposition`).
  it('builds an ApplicationError naming the Dispositions the system offers', () => {
    const error = purchaseDraftUnknownDispositionError(REJECTION_DISPOSITIONS);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
    });
    expect(error.details).toEqual({
      availableDispositions: [
        'undecided',
        'refused_at_delivery',
        'held_for_return',
        'scrapped_on_site',
      ],
    });
  });

  // AC-18a — "a disposition once decided may be corrected to another decision but never returned to
  // undecided". `details.currentDisposition` names the decision standing so the surface can drop
  // `undecided` from the menu rather than show it disabled (sad.md §6.4 step 1). It names no
  // Reason, description or quantity (openapi.yaml `RejectionAmendmentConflict`).
  it('builds an ApplicationError naming the Disposition that stands', () => {
    const error = purchaseDraftDispositionNotReversibleError(
      RejectionDisposition.HeldForReturn,
    );

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DISPOSITION_NOT_REVERSIBLE,
    });
    expect(error.details).toEqual({ currentDisposition: 'held_for_return' });
  });
});

// The violation vocabulary openapi.yaml's `details.violations[]` examples fix. Each is one rule of
// sad.md §6.1 steps 5–6, carrying the identifiers and figures that rule is about and nothing more:
// no violation entry ever carries a customer name, an address or a Rejection's prose (spec.md §6.1,
// sad.md §8 security review scope).
describe('arrival-inspection violation factories', () => {
  // AC-02 — the refusal names both figures. `rejectionReasonId` is `null` because the rule is about
  // the line's whole Condition Split rather than about any one refusal.
  it('states refusals totalling more than what was presented', () => {
    expect(rejectionsExceedReceivedViolation(100, 118)).toEqual({
      rule: 'rejections_exceed_received',
      rejectionReasonId: null,
      receivedQuantity: 100,
      rejectedQuantity: 118,
    });
  });

  // AC-06 — the refusal **names the Reasons the catalogue offers**, which is the whole point of the
  // criterion: the member is told what is available and that the team maintains the list. The
  // catalogue is passed in, because the entry carries whatever the catalogue held at that moment
  // rather than a list frozen into code.
  it('states an unknown Reason and carries the catalogue it offers', () => {
    const availableRejectionReasonIds = [
      'damaged_by_packing',
      'damaged_in_transit',
      'unfit_other',
    ];

    expect(
      unknownRejectionReasonViolation(
        'damaged_by_forklift',
        availableRejectionReasonIds,
      ),
    ).toEqual({
      rule: 'unknown_rejection_reason',
      rejectionReasonId: 'damaged_by_forklift',
      availableRejectionReasonIds,
    });
  });

  // AC-07 — the entry names the Reason that requires prose and carries no prose of its own.
  it('states a Reason the catalogue marks as requiring prose', () => {
    expect(descriptionRequiredViolation('soaked_through')).toEqual({
      rule: 'description_required',
      rejectionReasonId: 'soaked_through',
    });
  });

  // AC-09 — the entry names the repeated Reason.
  it('states a Reason repeated on one line', () => {
    expect(duplicateRejectionReasonViolation('damaged_in_transit')).toEqual({
      rule: 'duplicate_rejection_reason',
      rejectionReasonId: 'damaged_in_transit',
    });
  });

  // AC-25 — the entry names the line's Delivery Mode, the Source submitted and the Source that mode
  // requires, so the member is told which of their two statements to change.
  it('states a Source disagreeing with how the line’s goods travelled', () => {
    expect(
      sourceMismatchViolation({
        rejectionReasonId: 'quality_defect',
        deliveryMode: DeliveryMode.ViaWarehouse,
        submittedSource: RejectionSource.CustomerReported,
        requiredSource: RejectionSource.Inspected,
      }),
    ).toEqual({
      rule: 'source_mismatch',
      rejectionReasonId: 'quality_defect',
      deliveryMode: 'via_warehouse',
      submittedSource: 'customer_reported',
      requiredSource: 'inspected',
    });
  });

  // AC-25 mirrored (sad.md §6.2) — the same entry states the other direction, which is what keeps
  // one rule from becoming two.
  it('states an inspected Source claimed on a directly delivered line', () => {
    expect(
      sourceMismatchViolation({
        rejectionReasonId: 'quality_defect',
        deliveryMode: DeliveryMode.DirectToCustomer,
        submittedSource: RejectionSource.Inspected,
        requiredSource: RejectionSource.CustomerReported,
      }),
    ).toMatchObject({
      rule: 'source_mismatch',
      deliveryMode: 'direct_to_customer',
      submittedSource: 'inspected',
      requiredSource: 'customer_reported',
    });
  });

  // AC-16 — the entry names the verdict and the refusal that contradicts it.
  it('states a Met verdict contradicted by a refusal', () => {
    expect(
      metContradictsRejectionViolation('value_adding_note_not_applied'),
    ).toEqual({
      rule: 'met_contradicts_rejection',
      verdict: 'met',
      rejectionReasonId: 'value_adding_note_not_applied',
    });
  });

  // AC-17a — the entry names what the line was frozen with, so the member sees why Not applicable
  // was refused. The Value-adding Note is reported as **whether** there was one, never as its
  // wording (openapi.yaml `frozenValueAddingNote: true`).
  it('states Not applicable on a line frozen carrying an instruction', () => {
    expect(
      notApplicableOnInstructedLineViolation('cable_coil', 'coil to 25m runs'),
    ).toEqual({
      rule: 'not_applicable_on_instructed_line',
      verdict: 'not_applicable',
      frozenPackagingTypeId: 'cable_coil',
      frozenValueAddingNote: true,
    });
  });

  // AC-17 — the mirror: a verdict on a line frozen with neither, which the entry says outright.
  it.each([
    PreReceiptConformanceVerdict.Met,
    PreReceiptConformanceVerdict.NotMet,
  ])(
    'states the %s verdict on a line frozen with no instruction',
    (verdict) => {
      expect(verdictOnUninstructedLineViolation(verdict)).toEqual({
        rule: 'verdict_on_uninstructed_line',
        verdict,
        frozenPackagingTypeId: null,
        frozenValueAddingNote: false,
      });
    },
  );

  // AC-03 — the payload's own bound, bound to the property that carried it.
  it('states a refused quantity that is not a whole number of at least one', () => {
    expect(quantityOutOfRangeViolation('rejections.0.quantity')).toEqual({
      rule: 'quantity_out_of_range',
      path: 'rejections.0.quantity',
    });
  });

  // AC-14 — the entry states the bound, in characters, so the member is told the limit rather than
  // only that it was passed.
  it('states a description beyond one thousand characters', () => {
    expect(descriptionTooLongViolation('rejections.1.description')).toEqual({
      rule: 'description_too_long',
      path: 'rejections.1.description',
      maxLength: 1000,
    });
  });

  // AC-15b — the conformance note's own bound, a distinct rule from AC-14's so the refusal names
  // the note rather than a description the member never wrote.
  it('states a conformance note beyond one thousand characters', () => {
    expect(noteTooLongViolation('preReceiptConformance.note')).toEqual({
      rule: 'note_too_long',
      path: 'preReceiptConformance.note',
      maxLength: 1000,
    });
  });

  // AC-04a — a line where nothing was received records neither judgement, and the refusal says so
  // rather than letting `chk_purchase_draft_lines_conformance_requires_ending` produce an unnamed
  // constraint violation.
  it.each(['rejections', 'preReceiptConformance'])(
    'states %s submitted on a line where nothing was received',
    (path) => {
      expect(conditionOnNothingReceivedViolation(path)).toEqual({
        rule: 'condition_on_nothing_received',
        path,
      });
    },
  );
});
