import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
import { ArrivalInspectionService } from 'purchase-drafts/domain/services/arrival-inspection.service';
import type { EndingAllocationInput } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command';
import { ConfirmPurchaseDraftLineArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command';
import { RecordPurchaseDraftLineDeliveryCommand } from 'purchase-drafts/usecases/commands/record-purchase-draft-line-delivery.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
import type { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity';
import type {
  ArrivalConfirmationRepository,
  LockPurchaseDraftLineForEndingResult,
} from 'shared/domain/repositories/arrival-confirmation.repository';

// T17/ADR 0002 — the whole-draft arrival is replaced by two per-line endings whose **kind is a
// routing fact**. These are the rules that decision buys, asserted at the use-case boundary rather
// than through HTTP: which of the two acts a line admits (AC-20), that a line admits one ending at
// all (AC-20a), and that the draft closes on its last line rather than on the act (AC-19).
//
// `purchase-draft-line-ending.integration.spec.ts` proves the atomicity, the demand effect and the
// untouched On-hand Quantity against a real database, because a double can prove none of those.
// This suite owns the rules that are decidable from the rows the command has already read.

// T10/AC-01a/AC-01b — `observedPermissionIds` is what the Rejection-capability assertion narrows
// against (ADR 0001); defaulted to empty so a test that does not care about it still exercises "no
// grant" rather than an implicit, unstated one.
const currentUser = (
  observedPermissionIds: readonly PermissionId[] = [],
): AccessCurrentUser =>
  ({
    userId: '00000000-0000-4000-8000-0000000000a1',
    warehouseId: '00000000-0000-4000-8000-0000000000b1',
    observedPermissionIds,
  }) as AccessCurrentUser;

// T10 — a legal refusal within a line's Condition Split: a whole-number quantity, a Reason the
// seeded catalogue offers, the inspected Source a Via Warehouse line requires, and no description
// (only `unfit_other` requires one, AC-07).
const validRejection = (overrides: Record<string, unknown> = {}) => ({
  rejectionReasonId: 'damaged_in_transit',
  quantity: 8,
  source: 'inspected',
  description: null,
  ...overrides,
});

// T10 (post-review) — the condition half of a submission, defaulted to "nothing refused, nothing
// judged" so each test states only what it is proving. `rejections`/`preReceiptConformance` stay
// loosely typed because the commands themselves accept them loosely (the REST boundary is what
// narrows them, per the review's type-looseness verdict); `allocations` is typed against the
// command's own `EndingAllocationInput`, which is strict again post-review.
const conditionInput = (
  overrides: {
    receivedQuantity?: number;
    rejections?: readonly unknown[];
    preReceiptConformance?: unknown;
    allocations?: readonly EndingAllocationInput[];
  } = {},
) => ({
  receivedQuantity: overrides.receivedQuantity ?? 100,
  rejections: overrides.rejections ?? [],
  preReceiptConformance: overrides.preReceiptConformance ?? null,
  allocations: overrides.allocations ?? [],
});

const draftId = '00000000-0000-4000-8000-0000000000c1';
const lineId = '00000000-0000-4000-8000-0000000000d1';
const recordedAt = new Date('2026-09-18T10:00:00.000Z');

// T10 (post-review) — server-architecture.md §216-218: unit-test the commands over the **real**
// `ArrivalInspectionService` with a catalogue-repository double beneath it, never over a double of
// the service itself. Every Reason this suite states is offered here, so no unrelated case sees a
// spurious "unknown Reason" refusal; the AC-06 case below narrows this catalogue instead of
// replacing the service.
const catalogueEntry = (
  id: string,
  requiresDescription = false,
): RejectionReasonEntity => ({
  id,
  label: id,
  requiresDescription,
  createdAt: recordedAt,
  updatedAt: recordedAt,
});

const A_CATALOGUE: readonly RejectionReasonEntity[] = [
  catalogueEntry('damaged_in_transit'),
  catalogueEntry('wrong_item_supplied'),
  catalogueEntry('packaging_not_as_instructed'),
  catalogueEntry('damaged_by_packing'),
  catalogueEntry('unfit_other', true),
];

const catalogueRepositoryDouble = (
  catalogue: readonly RejectionReasonEntity[] = A_CATALOGUE,
) => ({
  listRejectionReasons: jest.fn().mockResolvedValue(catalogue),
  resolveRejectionReasons: jest.fn().mockResolvedValue(catalogue),
});

const arrivalInspectionServiceWith = (
  catalogue: readonly RejectionReasonEntity[] = A_CATALOGUE,
): ArrivalInspectionService =>
  new ArrivalInspectionService(catalogueRepositoryDouble(catalogue) as never);

/** A line of the named mode with no ending recorded — the shape both commands expect to succeed. */
const lockResult = (
  overrides: Partial<LockPurchaseDraftLineForEndingResult['line']> = {},
  draftState = 'ready_for_ordering',
): LockPurchaseDraftLineForEndingResult => ({
  draft: {
    id: draftId,
    warehouseId: currentUser().warehouseId,
    state: draftState,
  },
  line: {
    id: lineId,
    deliveryMode: 'via_warehouse',
    // T5 — the two frozen columns the locked-line projection gained; no case here judges a
    // Pre-receipt Conformance, so both stay as an unfrozen line carries them.
    packagingTypeId: null,
    valueAddingNote: null,
    endingKind: null,
    endingRecordedByUserId: null,
    endingRecordedAt: null,
    ...overrides,
  },
});

const repositoryReturning = (
  locked: LockPurchaseDraftLineForEndingResult | { draft: null; line: null },
  recorded: { recorded: boolean; closed: boolean } = {
    recorded: true,
    closed: false,
  },
): ArrivalConfirmationRepository =>
  ({
    lockDraftLineForEnding: jest.fn().mockResolvedValue(locked),
    recordLineEnding: jest.fn().mockResolvedValue(recorded),
  }) as unknown as ArrivalConfirmationRepository;

const neverAllocates = (): DemandAllocationService =>
  ({
    allocate: jest.fn(),
  }) as unknown as DemandAllocationService;

const codeOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
  } catch (error) {
    return (error as ApplicationError).code;
  }
  throw new Error('the command resolved where a refusal was expected');
};

describe('per-line endings replace the whole-draft arrival (T17)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Both halves carry their own boundary: the ending, its Allocations and the closure are one
  // transaction each (spec.md §6 "Ending atomicity"). Asserted here because `@Transactional()` is
  // `SetMetadata` and inert under `new`, so every behavioural test below would stay green without it.
  it.each([
    ['arrival', ConfirmPurchaseDraftLineArrivalCommand],
    ['direct delivery', RecordPurchaseDraftLineDeliveryCommand],
  ])('puts the %s on one @Transactional() boundary', (_name, command) => {
    expect(
      Reflect.getMetadata(TRANSACTIONAL_KEY, command.prototype.execute) as
        TransactionalMetadata | undefined,
    ).toBeDefined();
  });

  describe('AC-20 — the ending must match the way the line travelled', () => {
    it('refuses a dock arrival against a Direct to Customer line, naming how the goods travelled', async () => {
      const repository = repositoryReturning(
        lockResult({ deliveryMode: 'direct_to_customer' }),
      );
      const demand = neverAllocates();
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const code = await codeOf(
        command.execute(currentUser(), draftId, lineId, {
          receivedQuantity: 140,
          allocations: [],
        }),
      );

      expect(code).toBe(ErrorCode.PURCHASE_DRAFTS_ENDING_MODE_MISMATCH);
      expect(repository.recordLineEnding).not.toHaveBeenCalled();
      expect(demand.allocate).not.toHaveBeenCalled();
    });

    it('refuses a direct delivery against a Via Warehouse line', async () => {
      const repository = repositoryReturning(
        lockResult({ deliveryMode: 'via_warehouse' }),
      );
      const demand = neverAllocates();
      const command = new RecordPurchaseDraftLineDeliveryCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const code = await codeOf(
        command.execute(currentUser(), draftId, lineId, {
          deliveredQuantity: 60,
          allocations: [],
        }),
      );

      expect(code).toBe(ErrorCode.PURCHASE_DRAFTS_ENDING_MODE_MISMATCH);
      expect(repository.recordLineEnding).not.toHaveBeenCalled();
      expect(demand.allocate).not.toHaveBeenCalled();
    });
  });

  describe('AC-20a — a line admits exactly one ending', () => {
    it('refuses a second ending, naming when and by whom the first was recorded', async () => {
      const repository = repositoryReturning(
        lockResult({
          endingKind: 'arrival',
          endingRecordedByUserId: '00000000-0000-4000-8000-000000000001',
          endingRecordedAt: recordedAt,
        }),
      );
      const demand = neverAllocates();
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      let thrown: ApplicationError | undefined;
      try {
        await command.execute(currentUser(), draftId, lineId, {
          receivedQuantity: 140,
          allocations: [],
        });
      } catch (error) {
        thrown = error as ApplicationError;
      }

      expect(thrown?.code).toBe(
        ErrorCode.PURCHASE_DRAFTS_ENDING_ALREADY_RECORDED,
      );
      // "naming when and by whom" is the AC's own wording, so the details are asserted rather than
      // just the code — a refusal that named neither would satisfy the code alone.
      expect(thrown?.details).toMatchObject({
        endingKind: 'arrival',
        endingRecordedByUserId: '00000000-0000-4000-8000-000000000001',
        endingRecordedAt: recordedAt.toISOString(),
      });
      // "changes nothing, assigns nothing further to any Customer Order" (AC-20a).
      expect(repository.recordLineEnding).not.toHaveBeenCalled();
      expect(demand.allocate).not.toHaveBeenCalled();
    });
  });

  describe('AC-19 — the draft closes on its last line, not on the act', () => {
    it('records the ending and delegates the demand effect when the mode agrees', async () => {
      const repository = repositoryReturning(lockResult(), {
        recorded: true,
        closed: false,
      });
      const demand = neverAllocates();
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const result = await command.execute(currentUser(), draftId, lineId, {
        receivedQuantity: 140,
        allocations: [
          {
            purchaseDraftLineLinkId: '00000000-0000-4000-8000-000000000501',
            allocatedQuantity: 100,
          },
        ],
      });

      expect(result.state).toBe('ready_for_ordering');
      // T10 — `DemandAllocationService`'s line-wide bound is renamed to `assignableQuantity`
      // (sad.md §4, §8 "Naming"); with no refusal on this line the accepted figure equals what was
      // presented, so this is the rename surfacing even on the plain happy path.
      expect(demand.allocate).toHaveBeenCalledWith(
        currentUser().warehouseId,
        currentUser().userId,
        [
          expect.objectContaining({
            purchaseDraftLineId: lineId,
            assignableQuantity: 140,
            allocations: [
              {
                purchaseDraftLineLinkId: '00000000-0000-4000-8000-000000000501',
                allocatedQuantity: 100,
              },
            ],
          }),
        ],
      );
    });

    it('reports the draft Closed when this was its last line without an ending', async () => {
      const command = new RecordPurchaseDraftLineDeliveryCommand(
        repositoryReturning(
          lockResult({ deliveryMode: 'direct_to_customer' }),
          {
            recorded: true,
            closed: true,
          },
        ),
        neverAllocates(),
        arrivalInspectionServiceWith(),
      );

      const result = await command.execute(currentUser(), draftId, lineId, {
        deliveredQuantity: 60,
        allocations: [],
      });

      expect(result.state).toBe('closed');
    });
  });

  describe('the draft and the line must both resolve', () => {
    it('refuses when the draft is not in Ready for Ordering', async () => {
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repositoryReturning(lockResult({}, 'closed')),
        neverAllocates(),
        arrivalInspectionServiceWith(),
      );

      expect(
        await codeOf(
          command.execute(currentUser(), draftId, lineId, {
            receivedQuantity: 1,
            allocations: [],
          }),
        ),
      ).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_STATE);
    });

    it('refuses a line that does not belong to the draft in the acting Warehouse', async () => {
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repositoryReturning({ draft: null, line: null }),
        neverAllocates(),
        arrivalInspectionServiceWith(),
      );

      expect(
        await codeOf(
          command.execute(currentUser(), draftId, lineId, {
            receivedQuantity: 1,
            allocations: [],
          }),
        ),
      ).toBe(ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE);
    });
  });
});

// T10 — the condition half of both ending commands (sad.md §6.1 steps 4-8, §6.2 step 3): the
// Rejection-capability assertion, the Condition Split, the Pre-receipt Conformance, and the derived
// Accepted Quantity bounding the demand delegation. Every rule is enforced by the **real**
// `ArrivalInspectionService`/module-level functions of `arrival-inspection.service.ts` (T7/T8), with
// only the catalogue repository doubled beneath it (server-architecture.md §216-218) — these cases
// prove the rule holds, not merely that a call was made.
//
// Split into three sibling `describe`s (this one covers the refusing capability, the Condition
// Split/Pre-receipt Conformance refusals and the AC-06 catalogue refusal) purely to stay under the
// max-lines-per-function budget — every `it` below is unchanged from the one block this used to be.
describe('T10 — the condition half of a line ending', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AC-01a/AC-01b — the refusing capability is demanded by the payload, not the operation', () => {
    it('refuses a refusal-carrying ending when the actor lacks the refusing capability (AC-01a)', async () => {
      const repository = repositoryReturning(lockResult());
      const demand = neverAllocates();
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const input = conditionInput({ rejections: [validRejection()] });

      const code = await codeOf(
        command.execute(currentUser(), draftId, lineId, input),
      );

      expect(code).toBe(
        ErrorCode.PURCHASE_DRAFTS_REJECTION_CAPABILITY_REQUIRED,
      );
      expect(repository.recordLineEnding).not.toHaveBeenCalled();
      expect(demand.allocate).not.toHaveBeenCalled();
    });

    it('never refuses a refusal-free submission for lacking the refusing capability, whatever grants the actor holds (AC-01b)', async () => {
      // AC-01b's "unreachable" is `assertRejectionCapability`'s own `isEmpty` guard (T7) rather
      // than something this command re-decides — asserted here as the observable outcome an actor
      // holding **no** capability at all still gets: the ending records.
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repositoryReturning(lockResult()),
        neverAllocates(),
        arrivalInspectionServiceWith(),
      );

      const result = await command.execute(
        currentUser(),
        draftId,
        lineId,
        conditionInput({ rejections: [] }),
      );

      expect(result.state).toBe('ready_for_ordering');
    });
  });

  describe('the Condition Split and the Pre-receipt Conformance refuse the whole submission and record nothing', () => {
    const scenarios: Array<{
      name: string;
      input: ReturnType<typeof conditionInput>;
      code: string;
    }> = [
      {
        name: 'refusals totalling more than what was presented (AC-02)',
        input: conditionInput({
          receivedQuantity: 100,
          rejections: [
            validRejection({ quantity: 60 }),
            validRejection({
              rejectionReasonId: 'wrong_item_supplied',
              quantity: 50,
            }),
          ],
        }),
        code: ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID,
      },
      {
        name: 'two refusals on one line carrying the same Reason (AC-09)',
        input: conditionInput({
          rejections: [
            validRejection({ quantity: 3 }),
            validRejection({ quantity: 2 }),
          ],
        }),
        code: ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID,
      },
      {
        name: 'a Met verdict beside a refusal for packaging not as instructed (AC-16)',
        input: conditionInput({
          rejections: [
            validRejection({
              rejectionReasonId: 'packaging_not_as_instructed',
              quantity: 5,
            }),
          ],
          preReceiptConformance: { verdict: 'met' },
        }),
        code: ErrorCode.PURCHASE_DRAFTS_PRE_RECEIPT_CONFORMANCE_INVALID,
      },
      {
        name: 'a Not applicable verdict on a line frozen carrying an instruction (AC-17a)',
        input: conditionInput({
          rejections: [],
          preReceiptConformance: { verdict: 'not_applicable' },
        }),
        code: ErrorCode.PURCHASE_DRAFTS_PRE_RECEIPT_CONFORMANCE_INVALID,
      },
    ];

    it.each(scenarios)('$name', async ({ input, code }) => {
      // AC-17a needs a line frozen carrying an instruction; every other scenario is indifferent to
      // it, so freezing a Value-adding Note here changes nothing for them.
      const repository = repositoryReturning(
        lockResult({ valueAddingNote: 'Shrink-wrap each pallet' }),
      );
      const demand = neverAllocates();
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const actualCode = await codeOf(
        command.execute(
          currentUser([PermissionId.REJECTIONS_CREATE]),
          draftId,
          lineId,
          input,
        ),
      );

      expect(actualCode).toBe(code);
      expect(repository.recordLineEnding).not.toHaveBeenCalled();
      expect(demand.allocate).not.toHaveBeenCalled();
    });
  });

  describe('AC-06 (via T8) — the unknown-Reason refusal carries the available Reasons', () => {
    // T10 (post-review) — server-architecture.md §216-218: the command is exercised over the
    // **real** `ArrivalInspectionService`, with only its catalogue repository doubled beneath it,
    // narrowed here to a catalogue that genuinely does not offer `not_a_real_reason`. This proves
    // the rule is enforced against a real catalogue read, not merely that some injected function was
    // called.
    it('surfaces the catalogue-checked refusal `ArrivalInspectionService.assertStatedRejectionReasons` raises, recording nothing', async () => {
      const repository = repositoryReturning(lockResult());
      const demand = neverAllocates();
      const narrowCatalogue = [
        catalogueEntry('damaged_in_transit'),
        catalogueEntry('unfit_other', true),
      ];
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(narrowCatalogue),
      );

      const rejection = command.execute(
        currentUser([PermissionId.REJECTIONS_CREATE]),
        draftId,
        lineId,
        conditionInput({
          rejections: [
            validRejection({ rejectionReasonId: 'not_a_real_reason' }),
          ],
        }),
      );

      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID,
        details: {
          violations: [
            expect.objectContaining({
              rule: 'unknown_rejection_reason',
              rejectionReasonId: 'not_a_real_reason',
              availableRejectionReasonIds: narrowCatalogue.map(
                (entry) => entry.id,
              ),
            }),
          ],
        },
      });
      expect(repository.recordLineEnding).not.toHaveBeenCalled();
      expect(demand.allocate).not.toHaveBeenCalled();
    });
  });
});

// T10 (post-review) — server-architecture.md §6.1 steps 4-6: the payload shape, the refusing
// capability, the Condition Split (and the catalogue check it shares), then the Pre-receipt
// Conformance run in that fixed order. `assertEndingCondition` now calls each as a same-file
// binding of `ArrivalInspectionService` (moved there per the review — server-architecture.md
// §117-120), which a cross-module `jest.mock` can no longer intercept; the order proof itself lives
// in `arrival-inspection.service.spec.ts`, proved by outcome (which of two colliding rules'
// refusals is returned) rather than by spying.

// T10 — continued from above (split only for max-lines-per-function): AC-04a's nothing-received
// ending, and the accepted figure reaching the demand delegation.
describe('T10 — the condition half of a line ending (nothing received, accepted figure)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AC-04a — a line where nothing was received carries neither judgement', () => {
    it('writes the ending alone, deriving no meaningful judgement from either condition assertion', async () => {
      const repository = repositoryReturning(lockResult());
      const demand = neverAllocates();
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const input = conditionInput({ receivedQuantity: 0 });

      await command.execute(
        currentUser([PermissionId.REJECTIONS_CREATE]),
        draftId,
        lineId,
        input,
      );

      // Both assertions may still run against an empty submission (T8's own
      // `conditionOnlyWhereSomethingReceived` guard inside `assertPreReceiptConformance` is what
      // catches a *non*-empty one, sad.md §6.1 step 7) — what AC-04a requires is that neither
      // produces a judgement: no Condition Split violation and no recorded verdict.
      expect(repository.recordLineEnding).toHaveBeenCalledWith(
        expect.objectContaining({ endingQuantity: 0, condition: null }),
      );
      // T10 — the renamed bound: a nothing-received line derives an Accepted Quantity of zero.
      expect(demand.allocate).toHaveBeenCalledWith(
        currentUser().warehouseId,
        currentUser().userId,
        [
          expect.objectContaining({
            purchaseDraftLineId: lineId,
            assignableQuantity: 0,
          }),
        ],
      );
    });

    it('refuses a stated Pre-receipt Conformance verdict on a line where nothing was received', async () => {
      const repository = repositoryReturning(lockResult());
      const demand = neverAllocates();
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const input = conditionInput({
        receivedQuantity: 0,
        preReceiptConformance: { verdict: 'not_applicable' },
      });

      const code = await codeOf(
        command.execute(
          currentUser([PermissionId.REJECTIONS_CREATE]),
          draftId,
          lineId,
          input,
        ),
      );

      expect(code).toBe(ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT);
      expect(repository.recordLineEnding).not.toHaveBeenCalled();
    });
  });

  describe('the accepted figure, not the presented one, reaches the demand delegation', () => {
    it('bounds the delegation by presented less every refusal (AC-01, AC-11 wiring)', async () => {
      const repository = repositoryReturning(lockResult());
      const demand = neverAllocates();
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const input = conditionInput({
        receivedQuantity: 100,
        rejections: [validRejection({ quantity: 8 })],
        allocations: [
          {
            purchaseDraftLineLinkId: '00000000-0000-4000-8000-000000000501',
            allocatedQuantity: 92,
          },
        ],
      });

      await command.execute(
        currentUser([PermissionId.REJECTIONS_CREATE]),
        draftId,
        lineId,
        input,
      );

      expect(demand.allocate).toHaveBeenCalledWith(
        currentUser().warehouseId,
        currentUser().userId,
        [
          expect.objectContaining({
            purchaseDraftLineId: lineId,
            assignableQuantity: 92,
          }),
        ],
      );
    });
  });
});

// T10 — continued from above (split only for max-lines-per-function): the direct-delivery
// half's mirrored Source rule (AC-24/AC-25).
describe('T10 — the condition half of a line ending (direct-delivery Source mirror)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AC-24/AC-25 — the direct-delivery ending mirrors the Source rule', () => {
    it('records a customer-reported refusal on a directly delivered line, leaving that quantity assigned to nobody (AC-24)', async () => {
      const repository = repositoryReturning(
        lockResult({ deliveryMode: 'direct_to_customer' }),
      );
      const demand = neverAllocates();
      const command = new RecordPurchaseDraftLineDeliveryCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const input = {
        deliveredQuantity: 40,
        rejections: [
          validRejection({ source: 'customer_reported', quantity: 6 }),
        ],
        preReceiptConformance: null,
        allocations: [],
      };

      await command.execute(
        currentUser([PermissionId.REJECTIONS_CREATE]),
        draftId,
        lineId,
        input,
      );

      expect(demand.allocate).toHaveBeenCalledWith(
        currentUser().warehouseId,
        currentUser().userId,
        [
          expect.objectContaining({
            purchaseDraftLineId: lineId,
            assignableQuantity: 34,
            allocations: [],
          }),
        ],
      );
    });

    it('refuses a refusal claiming inspection at the dock on a directly delivered line (AC-25, mirrored)', async () => {
      const repository = repositoryReturning(
        lockResult({ deliveryMode: 'direct_to_customer' }),
      );
      const demand = neverAllocates();
      const command = new RecordPurchaseDraftLineDeliveryCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const input = {
        deliveredQuantity: 40,
        rejections: [validRejection({ source: 'inspected', quantity: 6 })],
        preReceiptConformance: null,
        allocations: [],
      };

      const code = await codeOf(
        command.execute(
          currentUser([PermissionId.REJECTIONS_CREATE]),
          draftId,
          lineId,
          input,
        ),
      );

      expect(code).toBe(ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID);
      expect(repository.recordLineEnding).not.toHaveBeenCalled();
      expect(demand.allocate).not.toHaveBeenCalled();
    });

    it('refuses a customer-reported refusal on a line delivered to our own dock (AC-25)', async () => {
      const repository = repositoryReturning(lockResult());
      const demand = neverAllocates();
      const command = new ConfirmPurchaseDraftLineArrivalCommand(
        repository,
        demand,
        arrivalInspectionServiceWith(),
      );

      const input = conditionInput({
        rejections: [
          validRejection({ source: 'customer_reported', quantity: 6 }),
        ],
      });

      const code = await codeOf(
        command.execute(
          currentUser([PermissionId.REJECTIONS_CREATE]),
          draftId,
          lineId,
          input,
        ),
      );

      expect(code).toBe(ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID);
      expect(repository.recordLineEnding).not.toHaveBeenCalled();
    });
  });
});

// T10/sad.md §4, §8 "Naming" — `DemandAllocationService`'s line-wide bound narrows from the
// received figure to the derived Accepted Quantity, renamed `assignableQuantity`; its violation
// becomes `allocations_exceed_accepted_quantity` and carries the accepted and refused figures
// (AC-11). The two other bounds are unaffected (AC-12, "still refuses ... as it does today").
describe('T10 — DemandAllocationService narrows to the derived Accepted Quantity (AC-11, AC-12)', () => {
  const linkId = '00000000-0000-4000-8000-000000000501';
  const customerOrderId = '00000000-0000-4000-8000-000000000601';

  const orderRow = (overrides: Record<string, unknown> = {}) => ({
    id: customerOrderId,
    warehouseId: currentUser().warehouseId,
    outstandingQuantity: 100,
    state: 'unfulfilled',
    createdAt: recordedAt,
    updatedAt: recordedAt,
    ...overrides,
  });

  const repositoryDouble = (
    locked: ReadonlyArray<{
      purchaseDraftLineLinkId: string;
      order: ReturnType<typeof orderRow>;
    }>,
  ) => ({
    lockCustomerOrdersForLinks: jest.fn().mockResolvedValue(locked),
    applyAllocations: jest.fn().mockResolvedValue([]),
  });

  it('refuses an assignment exceeding the derived Accepted Quantity, naming both figures (AC-11)', async () => {
    const repository = repositoryDouble([
      { purchaseDraftLineLinkId: linkId, order: orderRow() },
    ]);
    const service = new DemandAllocationService(repository as never, {
      now: () => recordedAt,
    });

    // AC-11 — one hundred presented, eight refused, ninety-two accepted: `assignableQuantity` is
    // the bound the service enforces, and ninety-five exceeds it even though it stays within what
    // was originally presented.
    const line = {
      purchaseDraftLineId: lineId,
      assignableQuantity: 92,
      rejectedQuantity: 8,
      allocations: [{ purchaseDraftLineLinkId: linkId, allocatedQuantity: 95 }],
    };

    const rejection = service.allocate(
      currentUser().warehouseId,
      currentUser().userId,
      [line],
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
      details: {
        violations: [
          expect.objectContaining({
            rule: 'allocations_exceed_accepted_quantity',
            acceptedQuantity: 92,
            rejectedQuantity: 8,
          }),
        ],
      },
    });
    expect(repository.applyAllocations).not.toHaveBeenCalled();
  });

  // AC-12 — unaffected by the rename, kept here as the regression guard the DoD names: an order
  // that is cancelled or already Fulfilled is refused whatever the Accepted Quantity is.
  it('still refuses an assignment to a Customer Order that is no longer waiting (AC-12)', async () => {
    const repository = repositoryDouble([
      {
        purchaseDraftLineLinkId: linkId,
        order: orderRow({ state: 'cancelled' }),
      },
    ]);
    const service = new DemandAllocationService(repository as never, {
      now: () => recordedAt,
    });

    const line = {
      purchaseDraftLineId: lineId,
      assignableQuantity: 92,
      rejectedQuantity: 8,
      allocations: [{ purchaseDraftLineLinkId: linkId, allocatedQuantity: 10 }],
    };

    const rejection = service.allocate(
      currentUser().warehouseId,
      currentUser().userId,
      [line],
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
      details: {
        violations: [
          expect.objectContaining({ rule: 'customer_order_not_unfulfilled' }),
        ],
      },
    });
  });
});
