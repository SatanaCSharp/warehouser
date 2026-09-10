import {
  ErrorCode,
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { MAX_PROSE_LENGTH } from 'purchase-drafts/domain/predicates/purchase-draft-condition.predicates.js';
import type {
  DeliveryMode,
  EndingKind,
} from 'purchase-drafts/domain/value-objects/delivery-mode.js';
import {
  PreReceiptConformanceVerdict,
  type RejectionDisposition,
  type RejectionSource,
} from 'purchase-drafts/domain/value-objects/line-condition.js';

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

// ---------------------------------------------------------------------------------------------
// Arrival inspection — the Condition Split, the Pre-receipt Conformance and a Rejection's
// Disposition (T7).
//
// Two surfaces, deliberately separate. A **violation** states one rule of sad.md §6.1 steps 5–6 and
// carries that rule's own identifiers and figures; an **error** carries every violation collected in
// one pass under one stable code. sad.md §6.1 requires the member's whole submission judged at once
// — a member at a dock correcting one figure at a time is the failure mode the array shape exists to
// prevent — so collecting the entries belongs to the ending command and each rule contributes one
// entry rather than one refusal.
//
// No violation entry ever carries a customer name, an address or a Rejection's prose: identifiers
// and figures only, which are meaningless to an actor who cannot already read the record
// (spec.md §6.1, sad.md §8 security review scope).

// The violation vocabulary openapi.yaml's `details.violations[]` examples fix, named per branch so
// the error factories below state which entries they may carry instead of taking `unknown[]`. T8
// collects them; contracts/api-sync-report.md §2 marks the vocabulary medium-confidence, and
// `note_too_long` (AC-15b) and `condition_on_nothing_received` (AC-04a) are named here because no
// artifact fixes them.
export type ConditionSplitViolation = ReturnType<
  | typeof rejectionsExceedReceivedViolation
  | typeof unknownRejectionReasonViolation
  | typeof descriptionRequiredViolation
  | typeof duplicateRejectionReasonViolation
  | typeof sourceMismatchViolation
  | typeof verdictRequiredWithRejectionsViolation
>;

export type PreReceiptConformanceViolation = ReturnType<
  | typeof metContradictsRejectionViolation
  | typeof notApplicableOnInstructedLineViolation
  | typeof verdictOnUninstructedLineViolation
>;

export type EndingConditionInputViolation = ReturnType<
  | typeof quantityOutOfRangeViolation
  | typeof descriptionTooLongViolation
  | typeof descriptionEmptyViolation
  | typeof descriptionNotTrimmedViolation
  | typeof noteTooLongViolation
  | typeof noteEmptyViolation
  | typeof noteNotTrimmedViolation
  | typeof noteNotAdmittedByVerdictViolation
  | typeof conditionOnNothingReceivedViolation
>;

// AC-02 — the refusal names both figures. `rejectionReasonId` is `null` because the rule is about
// the line's whole Condition Split rather than about any one refusal, which is what keeps every
// entry in `details.violations` readable as one shape.
export const rejectionsExceedReceivedViolation = (
  receivedQuantity: number,
  rejectedQuantity: number,
) => ({
  rule: 'rejections_exceed_received',
  rejectionReasonId: null,
  receivedQuantity,
  rejectedQuantity,
});

// AC-06 — the refusal names the Reasons the catalogue **does** offer, which is the whole point of
// the criterion: the member is told what is available and that the team maintains the list. The
// catalogue is passed in so the entry carries whatever it held at that moment rather than a list
// frozen into code, and it deliberately returns nothing else (sad.md §8).
export const unknownRejectionReasonViolation = (
  rejectionReasonId: string,
  availableRejectionReasonIds: readonly string[],
) => ({
  rule: 'unknown_rejection_reason',
  rejectionReasonId,
  availableRejectionReasonIds,
});

// AC-07 — the entry names the Reason the catalogue marks as requiring prose, and carries no prose of
// its own.
export const descriptionRequiredViolation = (rejectionReasonId: string) => ({
  rule: 'description_required',
  rejectionReasonId,
});

// code-review-back-end-2026-09-09.md, blocking finding 4 — the entry names the refused total the
// member must either withdraw or state a verdict beside. `rejectionReasonId` is `null` because the
// rule is about the line's whole Condition Split rather than about any one refusal, as
// `rejections_exceed_received` above.
export const verdictRequiredWithRejectionsViolation = (
  rejectedQuantity: number,
) => ({
  rule: 'verdict_required_with_rejections',
  rejectionReasonId: null,
  rejectedQuantity,
});

// AC-09 — the entry names the Reason repeated on the line.
export const duplicateRejectionReasonViolation = (
  rejectionReasonId: string,
) => ({
  rule: 'duplicate_rejection_reason',
  rejectionReasonId,
});

// AC-25 and its mirror (sad.md §6.2) — one entry states both directions: how the line's goods
// travelled, the Source submitted, and the Source that mode requires, so the member is told which of
// their two statements to change.
export const sourceMismatchViolation = (mismatch: {
  rejectionReasonId: string;
  deliveryMode: DeliveryMode;
  submittedSource: RejectionSource;
  requiredSource: RejectionSource;
}) => ({
  rule: 'source_mismatch',
  rejectionReasonId: mismatch.rejectionReasonId,
  deliveryMode: mismatch.deliveryMode,
  submittedSource: mismatch.submittedSource,
  requiredSource: mismatch.requiredSource,
});

// AC-16 — the entry names the verdict and the refusal that contradicts it.
export const metContradictsRejectionViolation = (
  rejectionReasonId: string,
) => ({
  rule: 'met_contradicts_rejection',
  verdict: PreReceiptConformanceVerdict.Met,
  rejectionReasonId,
});

// AC-17a — the entry names what the line was frozen carrying, so the member sees why Not applicable
// was refused. The Value-adding Note is reported as **whether** there was one, never as its wording
// (openapi.yaml `frozenValueAddingNote: true`).
export const notApplicableOnInstructedLineViolation = (
  frozenPackagingTypeId: string | null,
  frozenValueAddingNote: string | null,
) => ({
  rule: 'not_applicable_on_instructed_line',
  verdict: PreReceiptConformanceVerdict.NotApplicable,
  frozenPackagingTypeId,
  frozenValueAddingNote: frozenValueAddingNote !== null,
});

// AC-17 — the mirror: a verdict on a line frozen carrying neither, which the entry says outright
// rather than leaving the member to infer it.
export const verdictOnUninstructedLineViolation = (
  verdict: PreReceiptConformanceVerdict,
) => ({
  rule: 'verdict_on_uninstructed_line',
  verdict,
  frozenPackagingTypeId: null,
  frozenValueAddingNote: false,
});

// AC-03 — the payload's own bound, bound to the property that carried it.
export const quantityOutOfRangeViolation = (path: string) => ({
  rule: 'quantity_out_of_range',
  path,
});

// AC-14 — the entry states the bound, in characters, so the member is told the limit rather than
// only that it was passed.
export const descriptionTooLongViolation = (path: string) => ({
  rule: 'description_too_long',
  path,
  maxLength: MAX_PROSE_LENGTH,
});

// AC-14 (post-review) — `chk_purchase_draft_line_rejections_description_stored_trimmed` refuses a
// blank-after-trim description as an unnamed 500; this is the named refusal that reaches it first.
export const descriptionEmptyViolation = (path: string) => ({
  rule: 'description_empty',
  path,
});

// AC-14 (post-review) — the sibling half of the same constraint: stored untrimmed, never merely
// blank (`description <> btrim(description)`).
export const descriptionNotTrimmedViolation = (path: string) => ({
  rule: 'description_not_trimmed',
  path,
});

// AC-15b — the Conformance note's own bound. A distinct rule from AC-14's so the refusal names the
// note rather than a description the member never wrote.
export const noteTooLongViolation = (path: string) => ({
  rule: 'note_too_long',
  path,
  maxLength: MAX_PROSE_LENGTH,
});

// AC-15b (post-review) — the note half of `chk_purchase_draft_lines_conformance_note_shape`'s
// `note <> ''`, named before the constraint can turn a blank-after-trim note into an unnamed 500.
export const noteEmptyViolation = (path: string) => ({
  rule: 'note_empty',
  path,
});

// AC-15b (post-review) — the same constraint's `note = btrim(note)` half.
export const noteNotTrimmedViolation = (path: string) => ({
  rule: 'note_not_trimmed',
  path,
});

// AC-15/AC-15a (post-review) — `PreReceiptConformanceWithoutNoteCreate`
// (`@warehouser/contracts`) admits a note only beside `not_met`; a note beside `met` or
// `not_applicable` would otherwise persist silently rather than being refused. Named here, at the
// payload-shape layer, because it is a property of the request rather than a judgement against the
// frozen line — `verdict_on_uninstructed_line` and its neighbours stay `PreReceiptConformanceViolation`s
// unaffected by this one.
export const noteNotAdmittedByVerdictViolation = (
  verdict: PreReceiptConformanceVerdict,
) => ({
  rule: 'note_not_admitted_by_verdict',
  verdict,
});

// AC-04a — a line where nothing was received records neither judgement, and the refusal says so
// rather than letting `chk_purchase_draft_lines_conformance_requires_ending` produce an unnamed
// constraint violation the global filter can only report as a 500.
export const conditionOnNothingReceivedViolation = (path: string) => ({
  rule: 'condition_on_nothing_received',
  path,
});

// AC-01a/ADR 0001 — a submission that refuses goods needs the refusing capability, and the refusal
// names it so the surface can say which one. It names **no** Rejection: no Reason, description,
// quantity or Disposition appears in a denial payload. openapi.yaml `PurchaseDraftLineEndingForbidden`
// `rejectionCapabilityRequired` example: `details: { requiredPermissionId: "REJECTIONS:CREATE" }`.
export const purchaseDraftRejectionCapabilityRequiredError =
  (): ApplicationError =>
    new ApplicationError(
      ErrorCode.PURCHASE_DRAFTS_REJECTION_CAPABILITY_REQUIRED,
      { requiredPermissionId: PermissionId.REJECTIONS_CREATE },
    );

// AC-02, AC-06, AC-07, AC-09, AC-25 — one code for the whole Condition Split branch, carrying every
// violation collected in one pass together with the two figures the member is correcting
// (openapi.yaml `conditionSplitViolations`). One code rather than one per criterion because
// contracts/api-sync-report.md §2 maps the branch, not the rule.
export const purchaseDraftConditionSplitInvalidError = (split: {
  receivedQuantity: number;
  rejectedQuantity: number;
  violations: readonly ConditionSplitViolation[];
}): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID, {
    receivedQuantity: split.receivedQuantity,
    rejectedQuantity: split.rejectedQuantity,
    violations: split.violations,
  });

// AC-16, AC-17, AC-17a — the Conformance branch, judged against the same locked line. It carries the
// violations alone: no quantity is in question (openapi.yaml `conformanceViolations`).
export const purchaseDraftPreReceiptConformanceInvalidError = (
  violations: readonly PreReceiptConformanceViolation[],
): ApplicationError =>
  new ApplicationError(
    ErrorCode.PURCHASE_DRAFTS_PRE_RECEIPT_CONFORMANCE_INVALID,
    { violations },
  );

// AC-03, AC-14, AC-15b, AC-04a — the payload's own bounds, refused under the reused
// `purchase_drafts.invalid_input` rather than under either condition code, exactly as
// contracts/api-sync-report.md §4 maps the branch (openapi.yaml `payloadShape`). Where sad.md §6.1
// step 5 places these in the condition branches, the contract governs.
export const purchaseDraftEndingConditionInputError = (
  violations: readonly EndingConditionInputViolation[],
): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT, {
    violations,
  });

// AC-19 — "the system tells the member which dispositions are available". The refusal carries the
// offered set and nothing else (openapi.yaml `unknownDisposition`).
export const purchaseDraftUnknownDispositionError = (
  availableDispositions: readonly RejectionDisposition[],
): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT, {
    availableDispositions,
  });

// AC-18a — a Disposition once decided may be corrected to another decision but never returned to
// Undecided. `details.currentDisposition` names the decision standing so the surface can drop
// `undecided` from the menu rather than show it disabled (sad.md §6.4 step 1). It names no Reason,
// description or quantity (openapi.yaml `RejectionAmendmentConflict`).
export const purchaseDraftDispositionNotReversibleError = (
  currentDisposition: RejectionDisposition,
): ApplicationError =>
  new ApplicationError(ErrorCode.PURCHASE_DRAFTS_DISPOSITION_NOT_REVERSIBLE, {
    currentDisposition,
  });
