import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { DemandAllocationService } from 'customer-orders/domain/services/demand-allocation.service';
import { ConfirmPurchaseDraftLineArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command';
import { RecordPurchaseDraftLineDeliveryCommand } from 'purchase-drafts/usecases/commands/record-purchase-draft-line-delivery.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
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

const currentUser = (): AccessCurrentUser =>
  ({
    userId: '00000000-0000-4000-8000-0000000000a1',
    warehouseId: '00000000-0000-4000-8000-0000000000b1',
  }) as AccessCurrentUser;

const draftId = '00000000-0000-4000-8000-0000000000c1';
const lineId = '00000000-0000-4000-8000-0000000000d1';
const recordedAt = new Date('2026-09-18T10:00:00.000Z');

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
      expect(demand.allocate).toHaveBeenCalledWith(
        currentUser().warehouseId,
        currentUser().userId,
        [
          {
            purchaseDraftLineId: lineId,
            receivedQuantity: 140,
            allocations: [
              {
                purchaseDraftLineLinkId: '00000000-0000-4000-8000-000000000501',
                allocatedQuantity: 100,
              },
            ],
          },
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
