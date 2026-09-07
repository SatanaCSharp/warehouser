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
import {
  ArrivalInspectionService,
  assertConditionSplit,
  assertPreReceiptConformance,
  assertRejectionCapability,
  deriveAcceptedQuantity,
  type EndingConditionSubmission,
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
  listRejectionReasons: jest
    .fn()
    .mockResolvedValue([...A_FABRICATED_CATALOGUE]),
  resolveRejectionReasons: jest
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

    await serviceWith(repository).assertStatedRejectionReasons(
      submission({
        rejections: [
          refusal('damaged_in_transit'),
          refusal('unfit_other'),
          refusal('soaked_through', { description: 'wet through the pallet' }),
        ],
      }),
    );

    expect(readsPerformedBy(repository)).toBe(1);
  });

  // AC-06 — "tells the member which reasons are available". The refusal must carry the offered set
  // itself: a refusal that merely says the Reason is unknown leaves the member guessing, and the
  // catalogue is data the surface cannot hard-code.
  it('refuses an unknown Reason, naming every Reason the catalogue offers', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertStatedRejectionReasons(
        submission({
          receivedQuantity: 100,
          rejections: [refusal('crushed_by_forklift', { quantity: 8 })],
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
  it('refuses a Reason the catalogue flags as requiring prose when none was written', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertStatedRejectionReasons(
        submission({
          rejections: [refusal('soaked_through', { description: '   ' })],
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
      serviceWith(repository).assertStatedRejectionReasons(
        submission({
          rejections: [
            refusal('unfit_other', { description: null }),
            refusal('damaged_in_transit', { description: null }),
          ],
        }),
      ),
    ).resolves.toBeUndefined();
  });

  // sad.md §6.1 flag — the whole submission is judged in one pass. Two independent problems on two
  // different refusals are reported together, so the member corrects both at once.
  it('collects an unknown Reason and a missing description in one pass before refusing', async () => {
    const error = await refusalFromAwaiting(() =>
      serviceWith(catalogueRepositoryDouble()).assertStatedRejectionReasons(
        submission({
          rejections: [
            refusal('crushed_by_forklift'),
            refusal('soaked_through', { description: null }),
          ],
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

  // The one rule that earns the class: the catalogue read. Anything else on it would be a rule that
  // took a collaborator it does not need.
  it('keeps the catalogue assertion as the service’s only public method', () => {
    expect(
      Object.getOwnPropertyNames(ArrivalInspectionService.prototype).filter(
        (name) => name !== 'constructor',
      ),
    ).toEqual(['assertStatedRejectionReasons']);
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
    readFileSync(join(__dirname, 'arrival-inspection.service.ts'), 'utf8');

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
      const featureRoot = join(__dirname, '..', '..');
      const raisingFiles = sourceFilesUnder(featureRoot)
        .filter(
          (path) => !path.endsWith(join('errors', 'purchase-draft.errors.ts')),
        )
        .filter((path) => readFileSync(path, 'utf8').includes(refusalName));

      expect(raisingFiles).toEqual([
        join(__dirname, 'arrival-inspection.service.ts'),
      ]);
    },
  );
});
