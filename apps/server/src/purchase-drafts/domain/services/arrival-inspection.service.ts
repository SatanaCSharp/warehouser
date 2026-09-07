import { Injectable } from '@nestjs/common';
import { PermissionId } from '@warehouser/shared-types/enums';
import { assert } from '@warehouser/utils/asserts';
import { isEmpty, keyBy, map } from 'lodash';
import type {
  ConditionSplitViolation,
  PreReceiptConformanceViolation,
} from 'purchase-drafts/domain/errors/purchase-draft.errors';
import {
  conditionOnNothingReceivedViolation,
  descriptionRequiredViolation,
  duplicateRejectionReasonViolation,
  metContradictsRejectionViolation,
  notApplicableOnInstructedLineViolation,
  purchaseDraftConditionSplitInvalidError,
  purchaseDraftEndingConditionInputError,
  purchaseDraftPreReceiptConformanceInvalidError,
  purchaseDraftRejectionCapabilityRequiredError,
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
  isOfferedRejectionReason,
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
  type PreReceiptConformanceVerdict,
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
}

const rejectedQuantityOf = (submission: EndingConditionSubmission): number =>
  totalRefusedQuantity(map(submission.rejections, 'quantity'));

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
  const rejectedQuantity = rejectedQuantityOf(submission);

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

  assert(
    conditionOnlyWhereSomethingReceived(
      submission.receivedQuantity,
      verdict !== null || !isEmpty(submission.rejections),
    ),
    purchaseDraftEndingConditionInputError([
      conditionOnNothingReceivedViolation('preReceiptConformance'),
    ]),
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
): number => submission.receivedQuantity - rejectedQuantityOf(submission);

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
        rejectedQuantity: rejectedQuantityOf(submission),
        violations,
      }),
    );
  }
}
