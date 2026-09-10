// T8 — `purchase-drafts/domain/services/arrival-inspection.service.ts` does not exist yet. This is
// the legitimate RED for the rules **both** ending commands share (sad.md §5
// `arrival-inspection.service.ts`, §6.1 steps 4–8, §6.2 step 3).
//
// The split of the module is the design under test, not an accident of it
// (server-architecture.md §Services):
//
//   * `ArrivalInspectionService` is `@Injectable()` because — and only because — it needs one
//     collaborator, the Rejection Reason catalogue. It asserts every stated Reason against the
//     catalogue in **one read per ending** (AC-06, AC-07).
//   * `assertRejectionCapability`, `assertConditionSplit`, `assertPreReceiptConformance` and
//     `deriveAcceptedQuantity` are **module-level functions**: they need no collaborator, so putting
//     them on the class would force a command that needs only them to take the whole service.
//
// Every rule is decided by a T7 predicate and reported through a T7 violation factory; nothing here
// asserts a rule those already state in isolation. What this spec adds is the one thing T7
// deliberately left out — collecting **every** violation of a rule set in one pass before refusing
// (sad.md §6.1 flag: "a member at a dock correcting one figure at a time is the failure mode").
//
// Pure unit level per test-plan: every collaborator is a controlled double, so no database is
// involved (server-architecture.md §Testing). The lock order, the atomicity of the write and the
// `chk_…` constraints behind these rules are the ending commands' integration concern.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { EndingConditionSubmission } from 'purchase-drafts/domain/services/arrival-inspection.service';
import {
  ArrivalInspectionService,
  assertConditionSplit,
  assertPreReceiptConformance,
  assertRejectionCapability,
  deriveAcceptedQuantity,
  deriveRejectedQuantity,
} from 'purchase-drafts/domain/services/arrival-inspection.service';
import { DeliveryMode } from 'purchase-drafts/domain/value-objects/delivery-mode';
import {
  PreReceiptConformanceVerdict,
  RejectionSource,
} from 'purchase-drafts/domain/value-objects/line-condition';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity';
import type {
  LockedPurchaseDraftLineForEnding,
  RecordLineEndingRejectionInput,
} from 'shared/domain/repositories/arrival-confirmation.repository';
import { describe, expect, it, vi } from 'vitest';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const lineId = uuid('401');
const actorId = uuid('3');
const warehouseId = uuid('1');
const packagingTypeId = uuid('701');

// A catalogue **fabricated for this spec**, never the seeded one, exactly as
// `purchase-draft-condition.predicates.spec.ts` fabricates its own. AC-07's rule is the
// `requires_description` flag, so the prose-requiring Reason here is deliberately **not**
// `unfit_other` and the Reason named `unfit_other` deliberately does **not** carry the flag: an
// implementation that hard-coded the seeded identifier fails both directions.
const catalogueEntry = (
  id: string,
  requiresDescription: boolean,
): RejectionReasonEntity => ({
  id,
  label: `fabricated ${id}`,
  requiresDescription,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
});

const A_FABRICATED_CATALOGUE: readonly RejectionReasonEntity[] = [
  catalogueEntry('soaked_through', true),
  catalogueEntry('unfit_other', false),
  catalogueEntry('damaged_in_transit', false),
  catalogueEntry('packaging_not_as_instructed', false),
];

const OFFERED_REASON_IDS = A_FABRICATED_CATALOGUE.map((entry) => entry.id);

// The double stands in for `RejectionReasonCatalogueRepository`. Both of its methods are counted,
// because "one read per ending" is a rule about the **number of reads**, not about which method
// performs them: an implementation that listed the catalogue for AC-06 and then resolved the stated
// identifiers again for AC-07's flags would cost two.
const catalogueRepositoryDouble = () => ({
  listRejectionReasons: vi.fn().mockResolvedValue([...A_FABRICATED_CATALOGUE]),
  resolveRejectionReasons: vi
    .fn()
    .mockResolvedValue([...A_FABRICATED_CATALOGUE]),
});

const serviceWith = (
  repository: ReturnType<typeof catalogueRepositoryDouble>,
): ArrivalInspectionService =>
  new ArrivalInspectionService(repository as never);

const readsPerformedBy = (
  repository: ReturnType<typeof catalogueRepositoryDouble>,
): number =>
  repository.listRejectionReasons.mock.calls.length +
  repository.resolveRejectionReasons.mock.calls.length;

const refusal = (
  rejectionReasonId: string,
  overrides: Partial<RecordLineEndingRejectionInput> = {},
): RecordLineEndingRejectionInput => ({
  rejectionReasonId,
  quantity: 8,
  source: RejectionSource.Inspected,
  description: null,
  ...overrides,
});

const submission = (
  overrides: Partial<EndingConditionSubmission> = {},
): EndingConditionSubmission => ({
  receivedQuantity: 100,
  rejections: [],
  preReceiptConformance: null,
  preReceiptConformanceNote: null,
  ...overrides,
});

const lockedLine = (
  overrides: Partial<LockedPurchaseDraftLineForEnding> = {},
): LockedPurchaseDraftLineForEnding => ({
  id: lineId,
  deliveryMode: DeliveryMode.ViaWarehouse,
  packagingTypeId: null,
  valueAddingNote: null,
  endingKind: null,
  endingRecordedByUserId: null,
  endingRecordedAt: null,
  ...overrides,
});

const actorHolding = (
  ...observedPermissionIds: PermissionId[]
): AccessCurrentUser => ({
  userId: actorId,
  warehouseId,
  roleId: uuid('2'),
  roleKind: 'custom',
  permissionId: PermissionId.PURCHASE_DRAFTS_RECEIVE,
  observedPermissionIds,
  archived: false,
});

// A refusal is an outcome under test, so it is captured rather than merely matched: every case below
// reads the violations it carries, and `toThrow` alone would prove only that something was refused.
const refusalFrom = (act: () => unknown): ApplicationError => {
  try {
    act();
  } catch (error) {
    return error as ApplicationError;
  }

  throw new Error('expected a refusal, but the submission was admitted');
};

const refusalFromAwaiting = async (
  act: () => Promise<unknown>,
): Promise<ApplicationError> => {
  try {
    await act();
  } catch (error) {
    return error as ApplicationError;
  }

  throw new Error('expected a refusal, but the submission was admitted');
};

const violationsOf = (
  error: ApplicationError,
): ReadonlyArray<Record<string, unknown>> =>
  (error.details?.violations ?? []) as ReadonlyArray<Record<string, unknown>>;

const rulesOf = (error: ApplicationError): readonly unknown[] =>
  violationsOf(error).map((violation) => violation.rule);

describe('ArrivalInspectionService — the catalogue assertion (AC-06, AC-07)', () => {
  // The one rule that makes this an injectable service at all. A submission naming three Reasons
  // costs one read, not one per Reason and not one per rule
  // (data-model.md § "Repository boundaries").
  it('reads the catalogue once per ending however many Reasons the submission names', async () => {
    const repository = catalogueRepositoryDouble();

    await serviceWith(repository).assertEndingCondition(
      actorHolding(PermissionId.REJECTIONS_CREATE),
      lockedLine(),
      submission({
        rejections: [
          refusal('damaged_in_transit'),
          refusal('unfit_other'),
          refusal('soaked_through', { description: 'wet through the pallet' }),
        ],
        preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
      }),
    );

    expect(readsPerformedBy(repository)).toBe(1);
  });

  // AC-06 — "tells the member which reasons are available". The refusal must carry the offered set
  // itself: a refusal that merely says the Reason is unknown leaves the member guessing, and the
  // catalogue is data the surface cannot hard-code.
  it('refuses an unknown Reason, naming every Reason the catalogue offers', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
        actorHolding(PermissionId.REJECTIONS_CREATE),
        lockedLine(),
        submission({
          receivedQuantity: 100,
          rejections: [refusal('crushed_by_forklift', { quantity: 8 })],
          preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
        }),
      ),
    );

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID);
    expect(error.details).toMatchObject({
      receivedQuantity: 100,
      rejectedQuantity: 8,
    });
    expect(violationsOf(error)).toContainEqual({
      rule: 'unknown_rejection_reason',
      rejectionReasonId: 'crushed_by_forklift',
      availableRejectionReasonIds: OFFERED_REASON_IDS,
    });
  });

  // AC-07 — the requirement is the catalogue's flag. `soaked_through` carries it in the fabricated
  // catalogue and `unfit_other` does not, so an implementation that refuses by identifier fails
  // this case and the next one together.
  //
  // The absence is stated as `null` rather than as whitespace: read through the public method, a
  // whitespace description is refused by `assertRejectionShapes` under
  // `purchase_drafts.invalid_input` before the catalogue is consulted at all, so whitespace could
  // never reach this rule in production either.
  it('refuses a Reason the catalogue flags as requiring prose when none was written', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
        actorHolding(PermissionId.REJECTIONS_CREATE),
        lockedLine(),
        submission({
          rejections: [refusal('soaked_through', { description: null })],
          preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID);
    expect(violationsOf(error)).toContainEqual({
      rule: 'description_required',
      rejectionReasonId: 'soaked_through',
    });
  });

  it('admits a Reason the catalogue does not flag, whatever its identifier, with no description', async () => {
    const repository = catalogueRepositoryDouble();

    await expect(
      serviceWith(repository).assertEndingCondition(
        actorHolding(PermissionId.REJECTIONS_CREATE),
        lockedLine(),
        submission({
          rejections: [
            refusal('unfit_other', { description: null }),
            refusal('damaged_in_transit', { description: null }),
          ],
          preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
        }),
      ),
    ).resolves.toBeUndefined();
  });

  // sad.md §6.1 flag — the whole submission is judged in one pass. Two independent problems on two
  // different refusals are reported together, so the member corrects both at once.
  it('collects an unknown Reason and a missing description in one pass before refusing', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
        actorHolding(PermissionId.REJECTIONS_CREATE),
        lockedLine(),
        submission({
          rejections: [
            refusal('crushed_by_forklift'),
            refusal('soaked_through', { description: null }),
          ],
          preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
        }),
      ),
    );

    expect(rulesOf(error)).toEqual([
      'unknown_rejection_reason',
      'description_required',
    ]);
  });
});

describe('assertConditionSplit — the shared Condition Split assertion (AC-02, AC-09, AC-25)', () => {
  // AC-02 — "no more can be refused than was presented", and the refusal names both figures.
  it('refuses refusals totalling more than what was presented, naming both figures', () => {
    const error = refusalFrom(() =>
      assertConditionSplit(
        lockedLine(),
        submission({
          receivedQuantity: 100,
          rejections: [
            refusal('damaged_in_transit', { quantity: 60 }),
            refusal('unfit_other', { quantity: 50 }),
          ],
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID);
    expect(violationsOf(error)).toContainEqual({
      rule: 'rejections_exceed_received',
      rejectionReasonId: null,
      receivedQuantity: 100,
      rejectedQuantity: 110,
    });
  });

  // code-review-back-end-2026-09-09.md, blocking finding 4 — a refusal is only readable beside a
  // verdict, because `LineCondition` declares `preReceiptConformance` non-nullable in both its forms.
  // Persisting Rejections without one produced a row every read served as `condition: null`, so the
  // refused quantity, the accepted quantity and every Rejection vanished for an actor who held
  // `REJECTIONS:WATCH`. The state is refused here rather than modelled in the contract, which is what
  // makes it unrepresentable instead of merely reported.
  it('refuses refusals stated without a Pre-receipt Conformance verdict', () => {
    const error = refusalFrom(() =>
      assertConditionSplit(
        lockedLine(),
        submission({
          receivedQuantity: 100,
          rejections: [refusal('damaged_in_transit', { quantity: 8 })],
          preReceiptConformance: null,
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID);
    expect(violationsOf(error)).toContainEqual({
      rule: 'verdict_required_with_rejections',
      rejectionReasonId: null,
      rejectedQuantity: 8,
    });
  });

  // The two legal shapes the rule above must not reach: a plain ending states no verdict and refuses
  // nothing, which is what keeps a member without `REJECTIONS:CREATE` able to record one at all
  // (server-request-authorization.md § "Declare the Permissions a projection observes"), and a
  // nothing-received ending carries no condition by AC-04a.
  it('admits a plain ending that states no verdict and refuses nothing', () => {
    expect(() =>
      assertConditionSplit(
        lockedLine(),
        submission({
          receivedQuantity: 100,
          rejections: [],
          preReceiptConformance: null,
        }),
      ),
    ).not.toThrow();
  });

  // AC-09 — "one line carries one refusal per reason", and the refusal names the repeated Reason
  // rather than only reporting that one exists.
  it('refuses two refusals carrying one Reason, naming the repeated Reason', () => {
    const error = refusalFrom(() =>
      assertConditionSplit(
        lockedLine(),
        submission({
          rejections: [
            refusal('damaged_in_transit', { quantity: 5 }),
            refusal('damaged_in_transit', { quantity: 3 }),
          ],
        }),
      ),
    );

    expect(violationsOf(error)).toContainEqual({
      rule: 'duplicate_rejection_reason',
      rejectionReasonId: 'damaged_in_transit',
    });
  });

  // AC-25 — the Source is judged against the mode of the **locked line**, never against a mode the
  // caller stated, and the entry names both directions so the member knows which to change.
  it('refuses a customer-reported Source on goods that came to our own dock', () => {
    const error = refusalFrom(() =>
      assertConditionSplit(
        lockedLine({ deliveryMode: DeliveryMode.ViaWarehouse }),
        submission({
          rejections: [
            refusal('damaged_in_transit', {
              quantity: 5,
              source: RejectionSource.CustomerReported,
            }),
          ],
        }),
      ),
    );

    expect(violationsOf(error)).toContainEqual({
      rule: 'source_mismatch',
      rejectionReasonId: 'damaged_in_transit',
      deliveryMode: DeliveryMode.ViaWarehouse,
      submittedSource: RejectionSource.CustomerReported,
      requiredSource: RejectionSource.Inspected,
    });
  });

  // The DoD's own case: three rules broken at once are reported together with their figures intact.
  // A first-failing-rule short circuit reports one and passes this suite's other cases, which is
  // exactly why this case exists.
  it('collects every broken rule of the split before refusing, with the figures intact', () => {
    const error = refusalFrom(() =>
      assertConditionSplit(
        lockedLine({ deliveryMode: DeliveryMode.ViaWarehouse }),
        submission({
          receivedQuantity: 10,
          rejections: [
            refusal('damaged_in_transit', { quantity: 8 }),
            refusal('damaged_in_transit', {
              quantity: 7,
              source: RejectionSource.CustomerReported,
            }),
          ],
        }),
      ),
    );

    expect(error.details).toMatchObject({
      receivedQuantity: 10,
      rejectedQuantity: 15,
    });
    expect(rulesOf(error)).toEqual(
      expect.arrayContaining([
        'rejections_exceed_received',
        'duplicate_rejection_reason',
        'source_mismatch',
      ]),
    );
  });

  it('admits a split that refuses everything presented, one refusal per Reason', () => {
    expect(() =>
      assertConditionSplit(
        lockedLine(),
        submission({
          receivedQuantity: 8,
          rejections: [
            refusal('damaged_in_transit', { quantity: 5 }),
            refusal('unfit_other', { quantity: 3 }),
          ],
          // Not incidental — AC-01: an ending that refuses any quantity states a
          // Pre-receipt Conformance judgement, because a refusal is only readable
          // beside one (spec.md §5, named there since the 2026-09-09 review).
          preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
        }),
      ),
    ).not.toThrow();
  });
});

describe('assertPreReceiptConformance — the shared Conformance assertion (AC-16, AC-17, AC-17a)', () => {
  // AC-16 — a refusal for packaging not as instructed **is** the instruction not being met, so Met
  // cannot stand beside one.
  it('refuses a Met verdict beside a refusal for packaging not as instructed', () => {
    const error = refusalFrom(() =>
      assertPreReceiptConformance(
        lockedLine({ packagingTypeId }),
        submission({
          preReceiptConformance: PreReceiptConformanceVerdict.Met,
          rejections: [refusal('packaging_not_as_instructed', { quantity: 5 })],
        }),
      ),
    );

    expect(error.code).toBe(
      ErrorCode.PURCHASE_DRAFTS_PRE_RECEIPT_CONFORMANCE_INVALID,
    );
    expect(violationsOf(error)).toContainEqual({
      rule: 'met_contradicts_rejection',
      verdict: PreReceiptConformanceVerdict.Met,
      rejectionReasonId: 'packaging_not_as_instructed',
    });
  });

  // AC-17a — a line frozen carrying an instruction must be judged; the entry names what it was
  // frozen with, and reports the Value-adding Note as **whether** there was one, never its wording.
  it('refuses Not applicable on a line frozen carrying an instruction, without quoting the note', () => {
    const error = refusalFrom(() =>
      assertPreReceiptConformance(
        lockedLine({
          packagingTypeId,
          valueAddingNote: 'label each carton on the short side',
        }),
        submission({
          preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
        }),
      ),
    );

    expect(violationsOf(error)).toContainEqual({
      rule: 'not_applicable_on_instructed_line',
      verdict: PreReceiptConformanceVerdict.NotApplicable,
      frozenPackagingTypeId: packagingTypeId,
      frozenValueAddingNote: true,
    });
    expect(JSON.stringify(error.details)).not.toContain('short side');
  });

  // AC-17 — the mirror: a line frozen carrying neither can only record that the judgement does not
  // apply.
  it.each([
    PreReceiptConformanceVerdict.Met,
    PreReceiptConformanceVerdict.NotMet,
  ])(
    'refuses the verdict %s on a line frozen carrying no instruction',
    (verdict) => {
      const error = refusalFrom(() =>
        assertPreReceiptConformance(
          lockedLine(),
          submission({ preReceiptConformance: verdict }),
        ),
      );

      expect(violationsOf(error)).toContainEqual({
        rule: 'verdict_on_uninstructed_line',
        verdict,
        frozenPackagingTypeId: null,
        frozenValueAddingNote: false,
      });
    },
  );

  // The same collect-before-refusing rule as the split: a Met verdict on an uninstructed line that
  // also carries a contradicting refusal breaks two rules, and both are reported.
  it('collects every broken conformance rule before refusing', () => {
    const error = refusalFrom(() =>
      assertPreReceiptConformance(
        lockedLine(),
        submission({
          preReceiptConformance: PreReceiptConformanceVerdict.Met,
          rejections: [refusal('packaging_not_as_instructed', { quantity: 5 })],
        }),
      ),
    );

    expect(rulesOf(error)).toEqual(
      expect.arrayContaining([
        'met_contradicts_rejection',
        'verdict_on_uninstructed_line',
      ]),
    );
  });

  // AC-04a — a line where nothing was received records **no** judgement, Not applicable included.
  // The domain refuses it by name; without this,
  // `chk_purchase_draft_lines_conformance_requires_ending` fires and the global filter can only
  // report it as a 500 on an operation whose contract declares no internal failure. The code is the
  // payload one rather than the conformance one, per contracts/api-sync-report.md §4.
  it('refuses a verdict on an ending where nothing was received', () => {
    const error = refusalFrom(() =>
      assertPreReceiptConformance(
        lockedLine({ packagingTypeId }),
        submission({
          receivedQuantity: 0,
          preReceiptConformance: PreReceiptConformanceVerdict.NotMet,
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT);
    expect(rulesOf(error)).toContain('condition_on_nothing_received');
  });

  // AC-15b (post-review) — a note beyond one thousand characters is refused as the payload's own
  // bound, exactly like AC-04a above, rather than reaching
  // `chk_purchase_draft_lines_conformance_note_length` and surfacing as an unnamed 500.
  it('refuses a Pre-receipt Conformance note beyond one thousand characters', () => {
    const error = refusalFrom(() =>
      assertPreReceiptConformance(
        lockedLine({ packagingTypeId }),
        submission({
          preReceiptConformance: PreReceiptConformanceVerdict.NotMet,
          preReceiptConformanceNote: 'x'.repeat(1001),
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT);
    expect(rulesOf(error)).toContain('note_too_long');
  });

  // The note is measured only where it would actually reach persistence: a note stated without a
  // verdict is `buildEndingConditionInput`'s to drop, never this rule's to refuse, so an overlong
  // note beside no verdict at all must not surface here as a false "note_too_long".
  it('does not measure a note stated without a verdict', () => {
    expect(() =>
      assertPreReceiptConformance(
        lockedLine({ packagingTypeId }),
        submission({
          preReceiptConformance: null,
          preReceiptConformanceNote: 'x'.repeat(1001),
        }),
      ),
    ).not.toThrow();
  });

  // AC-15b (post-review) — the note shape bound's other two named refusals: blank after trim, and
  // stored untrimmed. Both would otherwise reach `chk_purchase_draft_lines_conformance_note_shape`
  // as an unnamed 500.
  it('refuses a blank Pre-receipt Conformance note', () => {
    const error = refusalFrom(() =>
      assertPreReceiptConformance(
        lockedLine({ packagingTypeId }),
        submission({
          preReceiptConformance: PreReceiptConformanceVerdict.NotMet,
          preReceiptConformanceNote: '',
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT);
    expect(rulesOf(error)).toContain('note_empty');
  });

  it('refuses a Pre-receipt Conformance note that is not trimmed', () => {
    const error = refusalFrom(() =>
      assertPreReceiptConformance(
        lockedLine({ packagingTypeId }),
        submission({
          preReceiptConformance: PreReceiptConformanceVerdict.NotMet,
          preReceiptConformanceNote: ' Torn cartons ',
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT);
    expect(rulesOf(error)).toContain('note_not_trimmed');
  });

  // AC-15/AC-15a (post-review) — `PreReceiptConformanceWithoutNoteCreate` admits a note only beside
  // Not met; a note beside Met would otherwise persist silently rather than being refused.
  it.each([
    PreReceiptConformanceVerdict.Met,
    PreReceiptConformanceVerdict.NotApplicable,
  ])('refuses a note stated beside the verdict %s', (verdict) => {
    const line =
      verdict === PreReceiptConformanceVerdict.NotApplicable
        ? lockedLine()
        : lockedLine({ packagingTypeId });

    const error = refusalFrom(() =>
      assertPreReceiptConformance(
        line,
        submission({
          preReceiptConformance: verdict,
          preReceiptConformanceNote: 'Everything arrived as instructed',
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT);
    expect(violationsOf(error)).toContainEqual(
      expect.objectContaining({
        rule: 'note_not_admitted_by_verdict',
        verdict,
      }),
    );
  });

  it('admits a judged instructed line and an unjudged uninstructed one', () => {
    expect(() =>
      assertPreReceiptConformance(
        lockedLine({ packagingTypeId }),
        submission({
          preReceiptConformance: PreReceiptConformanceVerdict.NotMet,
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertPreReceiptConformance(
        lockedLine(),
        submission({
          preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
        }),
      ),
    ).not.toThrow();
  });
});

describe('assertRejectionCapability — the shared capability assertion (AC-01a)', () => {
  // AC-01a — the refusal names the capability and **no Rejection**: no Reason, description,
  // quantity or Source appears in a denial payload (sad.md §8).
  it('refuses a submission that refuses goods when the capability is not held', () => {
    const error = refusalFrom(() =>
      assertRejectionCapability(
        actorHolding(PermissionId.CUSTOMERS_WATCH),
        submission({
          rejections: [
            refusal('damaged_in_transit', {
              quantity: 8,
              description: 'crushed corner',
            }),
          ],
        }),
      ),
    );

    expect(error.code).toBe(
      ErrorCode.PURCHASE_DRAFTS_REJECTION_CAPABILITY_REQUIRED,
    );
    expect(error.details).toEqual({
      requiredPermissionId: PermissionId.REJECTIONS_CREATE,
    });
  });

  it('admits a refusing submission from a member who holds the capability', () => {
    expect(() =>
      assertRejectionCapability(
        actorHolding(PermissionId.REJECTIONS_CREATE),
        submission({ rejections: [refusal('damaged_in_transit')] }),
      ),
    ).not.toThrow();
  });

  // AC-01b — a submission that refuses nothing never reaches the rule at all. The grant narrows
  // what an already-admitted request may do; it never widens anything (ADR 0001).
  it('admits a submission that refuses nothing from a member without the capability', () => {
    expect(() =>
      assertRejectionCapability(actorHolding(), submission({ rejections: [] })),
    ).not.toThrow();
  });
});

// T10 (post-review) — `assertRejectionShapes` (AC-03/AC-14) is private, reached only through
// `ArrivalInspectionService.assertEndingCondition`, so these cases prove the payload's own bounds
// on each Rejection the same way the class's other rule already is: over the real service, with
// only its catalogue repository doubled beneath it.
describe('ArrivalInspectionService.assertEndingCondition — the payload shape on each Rejection (AC-03/AC-14, post-review)', () => {
  it.each([0, -1, 1.5])(
    'refuses a refused quantity of %s, naming which entry',
    async (quantity) => {
      const error = await refusalFromAwaiting(() =>
        serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
          actorHolding(PermissionId.REJECTIONS_CREATE),
          lockedLine(),
          submission({
            rejections: [refusal('damaged_in_transit', { quantity })],
          }),
        ),
      );

      expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT);
      expect(violationsOf(error)).toContainEqual(
        expect.objectContaining({
          rule: 'quantity_out_of_range',
          path: 'rejections.0.quantity',
        }),
      );
    },
  );

  it('refuses a blank Rejection description', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
        actorHolding(PermissionId.REJECTIONS_CREATE),
        lockedLine(),
        submission({
          rejections: [refusal('damaged_in_transit', { description: '' })],
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT);
    expect(violationsOf(error)).toContainEqual(
      expect.objectContaining({
        rule: 'description_empty',
        path: 'rejections.0.description',
      }),
    );
  });

  it('refuses a Rejection description that is not trimmed', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
        actorHolding(PermissionId.REJECTIONS_CREATE),
        lockedLine(),
        submission({
          rejections: [
            refusal('damaged_in_transit', { description: ' crushed corner ' }),
          ],
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT);
    expect(violationsOf(error)).toContainEqual(
      expect.objectContaining({
        rule: 'description_not_trimmed',
        path: 'rejections.0.description',
      }),
    );
  });

  it('admits a whole refused quantity of at least one and a trimmed, non-empty description', async () => {
    await expect(
      serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
        actorHolding(PermissionId.REJECTIONS_CREATE),
        lockedLine(),
        submission({
          rejections: [
            refusal('damaged_in_transit', {
              quantity: 1,
              description: 'crushed corner',
            }),
          ],
          // Not incidental — AC-01: an ending that refuses any quantity states a
          // Pre-receipt Conformance judgement, because a refusal is only readable
          // beside one (spec.md §5, named there since the 2026-09-09 review).
          preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
        }),
      ),
    ).resolves.toBeUndefined();
  });
});

// T10 (post-review) — sad.md §6.1 steps 4-6: the payload's own shape, then the refusing capability,
// then the Condition Split (and the catalogue check it shares), then the Pre-receipt Conformance —
// never a different order, because each later rule is judged only once the more fundamental one has
// passed. Proved by outcome rather than by spying on the module's own functions: `assertEndingCondition`
// now calls them as same-file bindings, which a cross-module `vi.mock` cannot intercept. Each case
// below states a submission breaking **two** rules at once and asserts which one's code is
// returned, which is only possible if the rules run in the stated order.
describe('ArrivalInspectionService.assertEndingCondition — the rules run in the documented order (sad.md §6.1 steps 4-6, post-review)', () => {
  it('checks the payload shape before the refusing capability', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
        actorHolding(), // lacks REJECTIONS:CREATE
        lockedLine(),
        submission({
          // A quantity of zero breaks the shape bound; refusing at all breaks the capability one.
          rejections: [refusal('damaged_in_transit', { quantity: 0 })],
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT);
  });

  it('checks the refusing capability before the Condition Split', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
        actorHolding(), // lacks REJECTIONS:CREATE
        lockedLine(),
        submission({
          receivedQuantity: 10,
          // Refusing more than was presented breaks the Condition Split; refusing at all, held by
          // an actor without the capability, breaks the capability rule.
          rejections: [refusal('damaged_in_transit', { quantity: 40 })],
        }),
      ),
    );

    expect(error.code).toBe(
      ErrorCode.PURCHASE_DRAFTS_REJECTION_CAPABILITY_REQUIRED,
    );
  });

  it('checks the Condition Split (and its catalogue check) before the Pre-receipt Conformance', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
        actorHolding(PermissionId.REJECTIONS_CREATE),
        lockedLine({ packagingTypeId }), // instructed
        submission({
          // Two refusals naming the same Reason breaks the Condition Split; Not applicable on an
          // instructed line breaks the Pre-receipt Conformance.
          rejections: [
            refusal('damaged_in_transit', { quantity: 3 }),
            refusal('damaged_in_transit', { quantity: 2 }),
          ],
          preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID);
  });

  it('checks the catalogue before the Pre-receipt Conformance', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertEndingCondition(
        actorHolding(PermissionId.REJECTIONS_CREATE),
        lockedLine({ packagingTypeId }), // instructed
        submission({
          // A Reason the catalogue does not offer breaks the catalogue check; Not applicable on an
          // instructed line breaks the Pre-receipt Conformance.
          rejections: [refusal('crushed_by_forklift', { quantity: 3 })],
          preReceiptConformance: PreReceiptConformanceVerdict.NotApplicable,
        }),
      ),
    );

    expect(error.code).toBe(ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID);
  });
});

describe('deriveAcceptedQuantity — the shared derivation', () => {
  it('accepts everything presented when the submission refuses nothing', () => {
    expect(
      deriveAcceptedQuantity(
        submission({ receivedQuantity: 100, rejections: [] }),
      ),
    ).toBe(100);
  });

  it('accepts nothing when the whole presented quantity is refused', () => {
    expect(
      deriveAcceptedQuantity(
        submission({
          receivedQuantity: 100,
          rejections: [
            refusal('damaged_in_transit', { quantity: 40 }),
            refusal('unfit_other', { quantity: 60 }),
          ],
        }),
      ),
    ).toBe(0);
  });

  // AC-01 — one hundred presented, eight refused, ninety-two accepted: the figure the assignment is
  // bounded by (AC-11), derived and never typed.
  it('accepts what remains when part of the presented quantity is refused', () => {
    expect(
      deriveAcceptedQuantity(
        submission({
          receivedQuantity: 100,
          rejections: [refusal('damaged_in_transit', { quantity: 8 })],
        }),
      ),
    ).toBe(92);
  });
});

describe('deriveRejectedQuantity — the shared derivation (post-review)', () => {
  // AC-11 — the one figure `deriveAcceptedQuantity` and a refused Allocation's violation both need,
  // derived here once so neither re-sums the Rejections nor re-subtracts the accepted figure to get
  // it back.
  it('sums every refused quantity on the line', () => {
    expect(
      deriveRejectedQuantity(
        submission({
          rejections: [
            refusal('damaged_in_transit', { quantity: 8 }),
            refusal('unfit_other', { quantity: 3 }),
          ],
        }),
      ),
    ).toBe(11);
  });

  it('is zero when nothing was refused', () => {
    expect(deriveRejectedQuantity(submission({ rejections: [] }))).toBe(0);
  });
});

describe('the shape of the shared rules', () => {
  // server-architecture.md §Services — "keep a shared helper as a plain exported function only when
  // it needs no collaborator at all". Each of the four is reachable **without** an instance, which
  // is what lets a command that needs only them take no service at all.
  it.each([
    ['assertRejectionCapability', assertRejectionCapability],
    ['assertConditionSplit', assertConditionSplit],
    ['assertPreReceiptConformance', assertPreReceiptConformance],
    ['deriveAcceptedQuantity', deriveAcceptedQuantity],
  ])(
    'exposes %s as a module-level function, not as a method of the service',
    (name, fn) => {
      expect(typeof fn).toBe('function');
      expect(
        Object.getOwnPropertyNames(ArrivalInspectionService.prototype),
      ).not.toContain(name);
    },
  );

  // The class owns **one** public method. `assertStatedRejectionReasons` is private: its only
  // caller is its sibling `assertEndingCondition`, and server-architecture.md §Services is explicit
  // that "a method called by one command belongs in that command" — a public method with no caller
  // outside the class is surface the extraction does not need
  // (code-review-back-end-2026-09-09.md). TypeScript's `private` is compile-time only, so the
  // runtime list below still sees it; the assertion is over what the class *declares*, read from
  // the source, which is where the modifier lives.
  it('keeps the condition orchestration as the service’s only public method', () => {
    const declaration = readFileSync(
      join(import.meta.dirname, 'arrival-inspection.service.ts'),
      'utf8',
    );

    expect(declaration).toMatch(
      /private async assertStatedRejectionReasons\(/u,
    );
    expect(declaration).toMatch(/\n {2}async assertEndingCondition\(/u);
    expect(
      Object.getOwnPropertyNames(ArrivalInspectionService.prototype).filter(
        (name) => name !== 'constructor',
      ),
    ).toHaveLength(2);
  });
});

// The extraction trigger is that **two** commands enforce the identical rules (sad.md §5). What
// makes the extraction real is that neither command may state these refusals itself: a second copy
// in either ending command is the drift this task exists to prevent. Asserted over the source of
// the whole feature module, so it holds for the commands T11 and T12 add as well as for today's.
const SHARED_REFUSALS = [
  'purchaseDraftConditionSplitInvalidError',
  'purchaseDraftPreReceiptConformanceInvalidError',
  'purchaseDraftRejectionCapabilityRequiredError',
] as const;

const sourceFilesUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFilesUnder(path);
    }

    return entry.name.endsWith('.ts') && !entry.name.includes('.spec.') // specs read them freely
      ? [path]
      : [];
  });

// AC-25's Source/Delivery-Mode correspondence belongs to `line-condition.ts` (`requiredSourceFor`),
// which `sourceMatchesDeliveryMode` already decides by. **No behavioural case above can see the
// difference** between calling it and re-branching the two modes here, because both produce the same
// `requiredSource` — and a second copy of a rule T7 owns is exactly how the two drift apart. So it is
// pinned over the source instead, in the same way the shared refusals below are.
describe('the Source correspondence is stated once', () => {
  const serviceSource = (): string =>
    readFileSync(
      join(import.meta.dirname, 'arrival-inspection.service.ts'),
      'utf8',
    );

  it('names requiredSourceFor rather than re-branching the Delivery Mode', () => {
    expect(serviceSource()).toContain('requiredSourceFor');
  });

  it.each(['DeliveryMode', 'RejectionSource'])(
    'reaches no %s member of its own to decide the required Source',
    (valueObject) => {
      expect(serviceSource()).not.toMatch(
        new RegExp(String.raw`\b${valueObject}\.\w`, 'u'),
      );
    },
  );
});

describe('the ending rules live in one place', () => {
  it.each(SHARED_REFUSALS)(
    'raises %s from the shared module alone, never from a command',
    (refusalName) => {
      const featureRoot = join(import.meta.dirname, '..', '..');
      const raisingFiles = sourceFilesUnder(featureRoot)
        .filter(
          (path) => !path.endsWith(join('errors', 'purchase-draft.errors.ts')),
        )
        .filter((path) => readFileSync(path, 'utf8').includes(refusalName));

      expect(raisingFiles).toEqual([
        join(import.meta.dirname, 'arrival-inspection.service.ts'),
      ]);
    },
  );
});
