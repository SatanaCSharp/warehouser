import { Injectable } from '@nestjs/common';
import { PermissionId } from '@warehouser/shared-types/enums';
import { assert } from '@warehouser/utils/asserts';
import { isEmpty, keyBy, map } from 'lodash';
import type {
  ConditionSplitViolation,
  EndingConditionInputViolation,
  PreReceiptConformanceViolation,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  conditionOnNothingReceivedViolation,
  descriptionEmptyViolation,
  descriptionNotTrimmedViolation,
  descriptionRequiredViolation,
  descriptionTooLongViolation,
  duplicateRejectionReasonViolation,
  metContradictsRejectionViolation,
  notApplicableOnInstructedLineViolation,
  noteEmptyViolation,
  noteNotAdmittedByVerdictViolation,
  noteNotTrimmedViolation,
  noteTooLongViolation,
  purchaseDraftConditionSplitInvalidError,
  purchaseDraftEndingConditionInputError,
  purchaseDraftPreReceiptConformanceInvalidError,
  purchaseDraftRejectionCapabilityRequiredError,
  quantityOutOfRangeViolation,
  rejectionsExceedReceivedViolation,
  sourceMismatchViolation,
  unknownRejectionReasonViolation,
  verdictOnUninstructedLineViolation,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import type { RejectionReasonCatalogueEntry } from 'purchase-drafts/domain/predicates/purchase-draft-condition.predicates';
import {
  conditionOnlyWhereSomethingReceived,
  duplicatedRejectionReasonIds,
  instructionRefusalReasonIdsAmong,
  isNonEmptyProse,
  isOfferedRejectionReason,
  isTrimmedProse,
  isWholeRefusedQuantity,
  isWithinProseBound,
  judgementOnlyOnInstructedLine,
  lineCarriesFrozenInstruction,
  metAgreesWithRefusals,
  notApplicableOnlyOnUninstructedLine,
  refusalsWithinPresented,
  satisfiesDescriptionRequirement,
  sourceMatchesDeliveryMode,
  totalRefusedQuantity,
} from 'purchase-drafts/domain/predicates/purchase-draft-condition.predicates';
import {
  PreReceiptConformanceVerdict,
  requiredSourceFor,
} from 'purchase-drafts/domain/value-objects/line-condition';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type {
  LockedPurchaseDraftLineForEnding,
  RecordLineEndingRejectionInput,
} from 'shared/domain/repositories/arrival-confirmation.repository';
import { RejectionReasonCatalogueRepository } from 'shared/domain/repositories/rejection-reason-catalogue.repository';

// The rules **both** ending commands enforce (sad.md §5, §6.1 steps 4–8, §6.2 step 3). Two callers
// is this repository's extraction trigger, and neither command may state these refusals itself: a
// second copy in either is the drift this module exists to prevent, which
// `arrival-inspection.service.spec.ts` asserts over the whole feature module's source.
//
// Every rule is *decided* by a predicate of `purchase-draft-condition.predicates.ts` and *reported*
// through a violation factory of `purchase-draft.errors.ts`. Nothing here restates a rule either
// already states — including the Source/Delivery-Mode correspondence, which stays
// `line-condition.ts`'s `requiredSourceFor` rather than being re-branched here. What this module
// adds is the one thing T7 deliberately left out: **collecting every violation of a rule set in one
// pass before refusing**, because a member at a dock correcting one figure at a time is the failure
// mode (sad.md §6.1 flags). A first-failing-rule short circuit is a defect, not a simplification.
//
// Only the catalogue assertion needs a collaborator, so only it is a class
// (server-architecture.md §Services): the other four inject nothing, and putting them on the class
// would force a command that needs only them to take the whole service. No import here from HTTP,
// TypeORM or NestJS beyond `@Injectable`.

/** One member's statement about what a line's goods turned out to be: how much was presented, what
 * was refused of it and how the goods measured against the frozen instruction. The one input every
 * rule below is judged against, stated once because the rules are judged together
 * (spec.md §6 "Ending atomicity"). */
export interface EndingConditionSubmission {
  readonly receivedQuantity: number;
  readonly rejections: readonly RecordLineEndingRejectionInput[];
  readonly preReceiptConformance: PreReceiptConformanceVerdict | null;
  // T10 (post-review) — carried on the submission, beside the verdict it belongs to, so
  // `assertPreReceiptConformance` can own AC-15b's length bound itself rather than it being decided
  // (or silently mis-persisted) elsewhere. `null` whenever no verdict was stated is enforced by
  // `buildEndingConditionInput`, not assumed here.
  readonly preReceiptConformanceNote: string | null;
}

// AC-11 (post-review) — the Rejected Quantity, derived exactly once and reused everywhere it is
// needed (`assertConditionSplit`'s own figure, a command bounding its demand delegation, a
// violation naming both figures) rather than re-summed or re-subtracted at each call site. Declared
// here, ahead of its first caller, because every other shared derivation in this module is a
// `const` rather than a `function`.
export const deriveRejectedQuantity = (
  submission: EndingConditionSubmission,
): number => totalRefusedQuantity(map(submission.rejections, 'quantity'));

const rejectionReasonIdsOf = (
  submission: EndingConditionSubmission,
): readonly string[] => map(submission.rejections, 'rejectionReasonId');

// AC-25 and its mirror (sad.md §6.2) — judged against the **locked line's** mode, never against a
// mode the caller stated, and each entry names both directions so the member knows which of their
// two statements to change.
const sourceMismatchViolationsOf = (
  line: LockedPurchaseDraftLineForEnding,
  submission: EndingConditionSubmission,
): readonly ConditionSplitViolation[] =>
  submission.rejections
    .filter(
      (rejection) =>
        !sourceMatchesDeliveryMode(line.deliveryMode, rejection.source),
    )
    .map((rejection) =>
      sourceMismatchViolation({
        rejectionReasonId: rejection.rejectionReasonId,
        deliveryMode: line.deliveryMode,
        submittedSource: rejection.source,
        requiredSource: requiredSourceFor(line.deliveryMode),
      }),
    );

// AC-06/AC-07 — one pass over the stated Reasons against the catalogue as it stands. An unknown
// Reason has no flag to judge, so it contributes the one violation the member can act on.
const statedRejectionReasonViolationsOf = (
  submission: EndingConditionSubmission,
  catalogue: readonly RejectionReasonCatalogueEntry[],
): readonly ConditionSplitViolation[] => {
  const offeredById = keyBy(catalogue, 'id');
  const availableRejectionReasonIds = map(catalogue, 'id');

  return submission.rejections.flatMap((rejection) => {
    if (!isOfferedRejectionReason(rejection.rejectionReasonId, catalogue)) {
      return [
        unknownRejectionReasonViolation(
          rejection.rejectionReasonId,
          availableRejectionReasonIds,
        ),
      ];
    }

    return satisfiesDescriptionRequirement(
      offeredById[rejection.rejectionReasonId],
      rejection.description,
    )
      ? []
      : [descriptionRequiredViolation(rejection.rejectionReasonId)];
  });
};

// AC-16, AC-17, AC-17a — the three rules that judge a stated verdict against the instruction the
// line was frozen carrying, collected together so a submission breaking two is told both.
const conformanceViolationsOf = (
  line: LockedPurchaseDraftLineForEnding,
  verdict: PreReceiptConformanceVerdict,
  rejectionReasonIds: readonly string[],
): readonly PreReceiptConformanceViolation[] => {
  const carriesFrozenInstruction = lineCarriesFrozenInstruction(
    line.packagingTypeId,
    line.valueAddingNote,
  );

  const contradictedByRefusals = metAgreesWithRefusals(
    verdict,
    rejectionReasonIds,
  )
    ? []
    : instructionRefusalReasonIdsAmong(rejectionReasonIds);

  return [
    ...contradictedByRefusals.map(metContradictsRejectionViolation),
    ...(notApplicableOnlyOnUninstructedLine(verdict, carriesFrozenInstruction)
      ? []
      : [
          notApplicableOnInstructedLineViolation(
            line.packagingTypeId,
            line.valueAddingNote,
          ),
        ]),
    ...(judgementOnlyOnInstructedLine(verdict, carriesFrozenInstruction)
      ? []
      : [verdictOnUninstructedLineViolation(verdict)]),
  ];
};

// AC-14/AC-15b (post-review) — the one shape check a Rejection's description and the Conformance
// note both need, stated once because `chk_purchase_draft_line_rejections_description_stored_trimmed`
// and `chk_purchase_draft_lines_conformance_note_shape` state the identical bound: non-empty,
// trimmed and within `MAX_PROSE_LENGTH`. `null` (nothing stated) never contributes a violation —
// that is what makes a prose field genuinely optional.
const proseShapeViolationsOf = (
  prose: string | null,
  path: string,
  violationFactories: {
    readonly empty: (path: string) => EndingConditionInputViolation;
    readonly notTrimmed: (path: string) => EndingConditionInputViolation;
    readonly tooLong: (path: string) => EndingConditionInputViolation;
  },
): readonly EndingConditionInputViolation[] => {
  if (prose === null) {
    return [];
  }

  return [
    ...(isNonEmptyProse(prose) ? [] : [violationFactories.empty(path)]),
    ...(isTrimmedProse(prose) ? [] : [violationFactories.notTrimmed(path)]),
    ...(isWithinProseBound(prose) ? [] : [violationFactories.tooLong(path)]),
  ];
};

// AC-03/AC-14 — the payload's own bounds on each stated Rejection: a whole refused quantity of at
// least one (`isWholeRefusedQuantity`, T7 — carried no caller until now), and, when a description is
// stated, the same prose shape the Conformance note owns below. Refused under
// `purchase_drafts.invalid_input` before the Condition Split ever sums or compares these values
// (contracts/api-sync-report.md §4's `payloadShape` example), collected across every Rejection in
// one pass rather than at the first malformed entry.
const assertRejectionShapes = (submission: EndingConditionSubmission): void => {
  const violations: EndingConditionInputViolation[] =
    submission.rejections.flatMap((rejection, index) => [
      ...(isWholeRefusedQuantity(rejection.quantity)
        ? []
        : [
            quantityOutOfRangeViolation(`rejections.${String(index)}.quantity`),
          ]),
      ...proseShapeViolationsOf(
        rejection.description,
        `rejections.${String(index)}.description`,
        {
          empty: descriptionEmptyViolation,
          notTrimmed: descriptionNotTrimmedViolation,
          tooLong: descriptionTooLongViolation,
        },
      ),
    ]);

  assert(
    isEmpty(violations),
    purchaseDraftEndingConditionInputError(violations),
  );
};

// AC-01a/ADR 0001 — a submission that **refuses** goods needs the refusing capability, read from
// the observed Permissions to narrow what an already-admitted request may do rather than to widen
// anything. A submission that refuses nothing never reaches the rule at all, which is what makes
// AC-01b unreachable by it rather than admitted through a permissive branch.
export const assertRejectionCapability = (
  actor: AccessCurrentUser,
  submission: EndingConditionSubmission,
): void => {
  if (isEmpty(submission.rejections)) {
    return;
  }

  assert(
    actor.observedPermissionIds.includes(PermissionId.REJECTIONS_CREATE),
    purchaseDraftRejectionCapabilityRequiredError(),
  );
};

// AC-02, AC-09, AC-25 — the whole Condition Split judged in one pass, refused under one code
// carrying every violation together with the two figures the member is correcting.
export const assertConditionSplit = (
  line: LockedPurchaseDraftLineForEnding,
  submission: EndingConditionSubmission,
): void => {
  const rejectionReasonIds = rejectionReasonIdsOf(submission);
  const rejectedQuantity = deriveRejectedQuantity(submission);

  const violations: readonly ConditionSplitViolation[] = [
    ...(refusalsWithinPresented(submission.receivedQuantity, rejectedQuantity)
      ? []
      : [
          rejectionsExceedReceivedViolation(
            submission.receivedQuantity,
            rejectedQuantity,
          ),
        ]),
    ...duplicatedRejectionReasonIds(rejectionReasonIds).map(
      duplicateRejectionReasonViolation,
    ),
    ...sourceMismatchViolationsOf(line, submission),
  ];

  assert(
    isEmpty(violations),
    purchaseDraftConditionSplitInvalidError({
      receivedQuantity: submission.receivedQuantity,
      rejectedQuantity,
      violations,
    }),
  );
};

// AC-16, AC-17, AC-17a and AC-04a. The nothing-received refusal comes first and alone because it is
// a different branch of the contract: it refuses under `purchase_drafts.invalid_input` rather than
// the conformance code, as contracts/api-sync-report.md §4 maps it, and reaching
// `chk_purchase_draft_lines_conformance_requires_ending` instead would surface as a 500 on an
// operation whose contract declares no internal failure.
export const assertPreReceiptConformance = (
  line: LockedPurchaseDraftLineForEnding,
  submission: EndingConditionSubmission,
): void => {
  const verdict = submission.preReceiptConformance;
  const note = submission.preReceiptConformanceNote;

  // AC-04a and AC-15b collected together: both are payload-shape bounds refused under
  // `purchase_drafts.invalid_input` rather than the conformance code (contracts/api-sync-report.md
  // §4), and both are decidable before the conformance rules below ever run. The note's shape
  // (non-empty, trimmed, within bound) is measured only when it would actually reach persistence
  // beside a verdict — `buildEndingConditionInput` drops an orphaned note rather than refusing it,
  // so a note stated without one is never this rule's failure mode. `note_not_admitted_by_verdict`
  // is the fourth: `PreReceiptConformanceWithoutNoteCreate` (`@warehouser/contracts`) admits a note
  // only beside Not met, so a note beside Met or Not applicable is refused here rather than
  // persisted silently.
  const inputViolations: EndingConditionInputViolation[] = [
    ...(conditionOnlyWhereSomethingReceived(
      submission.receivedQuantity,
      verdict !== null || !isEmpty(submission.rejections),
    )
      ? []
      : [conditionOnNothingReceivedViolation('preReceiptConformance')]),
    ...(verdict === null
      ? []
      : proseShapeViolationsOf(note, 'preReceiptConformance.note', {
          empty: noteEmptyViolation,
          notTrimmed: noteNotTrimmedViolation,
          tooLong: noteTooLongViolation,
        })),
    ...(verdict !== null &&
    verdict !== PreReceiptConformanceVerdict.NotMet &&
    note !== null
      ? [noteNotAdmittedByVerdictViolation(verdict)]
      : []),
  ];

  assert(
    isEmpty(inputViolations),
    purchaseDraftEndingConditionInputError(inputViolations),
  );

  if (verdict === null) {
    return;
  }

  const violations = conformanceViolationsOf(
    line,
    verdict,
    rejectionReasonIdsOf(submission),
  );

  assert(
    isEmpty(violations),
    purchaseDraftPreReceiptConformanceInvalidError(violations),
  );
};

// AC-01/AC-11 — one hundred presented and eight refused is ninety-two accepted: the figure the
// assignment to Customer Orders is bounded by, always derived and never typed by a member.
export const deriveAcceptedQuantity = (
  submission: EndingConditionSubmission,
): number => submission.receivedQuantity - deriveRejectedQuantity(submission);

@Injectable()
export class ArrivalInspectionService {
  constructor(
    private readonly rejectionReasonCatalogueRepository: RejectionReasonCatalogueRepository,
  ) {}

  // AC-06/AC-07 — every stated Reason judged against the catalogue in **one** read per ending
  // however many Reasons the submission names (data-model.md § "Repository boundaries"): the whole
  // catalogue answers both rules at once, because AC-06's refusal has to name what is offered and
  // AC-07's requirement is each offered entry's own flag.
  async assertStatedRejectionReasons(
    submission: EndingConditionSubmission,
  ): Promise<void> {
    if (isEmpty(submission.rejections)) {
      return;
    }

    const catalogue =
      await this.rejectionReasonCatalogueRepository.listRejectionReasons();

    const violations = statedRejectionReasonViolationsOf(submission, catalogue);

    assert(
      isEmpty(violations),
      purchaseDraftConditionSplitInvalidError({
        receivedQuantity: submission.receivedQuantity,
        rejectedQuantity: deriveRejectedQuantity(submission),
        violations,
      }),
    );
  }

  // T10 (post-review) — sad.md §6.1 steps 4-6, §6.2 step 3: the condition half **both** ending
  // commands run, in the one order every rule below is decided in: the payload's own shape on each
  // Rejection (AC-03/AC-14), the refusing capability (T7's own `isEmpty` guard makes it unreachable
  // on a refusal-free submission, AC-01b), the Condition Split (collected in one pass,
  // AC-02/AC-06/AC-07/AC-09/AC-25), the catalogue check the Condition Split branch shares (AC-06/
  // AC-07), and the Pre-receipt Conformance (AC-15/AC-15b/AC-16/AC-17/AC-17a). Every rule is
  // asserted unconditionally — including on a nothing-received submission (AC-04a) — because
  // `assertPreReceiptConformance`'s own `conditionOnlyWhereSomethingReceived` guard is what turns a
  // verdict or refusal stated against a zero-quantity ending into `condition_on_nothing_received`;
  // skipping the call here would make that guard unreachable and force a second copy of it.
  //
  // A method of this class, not a module-level function beside the four above, because it reaches
  // the catalogue repository through the one collaborator this service already injects
  // (server-architecture.md §117-120 "a shared operation that reaches a repository belongs in an
  // injectable service … threaded through every caller as an argument" is exactly the shape a
  // parameter carrying `assertStatedRejectionReasons` would have been). Both ending commands already
  // inject this class, so moving the orchestration here adds no new collaborator to either.
  async assertEndingCondition(
    currentUser: AccessCurrentUser,
    line: LockedPurchaseDraftLineForEnding,
    submission: EndingConditionSubmission,
  ): Promise<void> {
    assertRejectionShapes(submission);
    assertRejectionCapability(currentUser, submission);
    assertConditionSplit(line, submission);
    await this.assertStatedRejectionReasons(submission);
    assertPreReceiptConformance(line, submission);
  }
}
