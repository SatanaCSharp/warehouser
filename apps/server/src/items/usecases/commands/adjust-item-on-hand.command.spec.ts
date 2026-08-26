// T6 — `items/usecases/commands/adjust-item-on-hand.command.ts` does not exist yet. This is the
// legitimate RED for the application boundary of AC-08: the REST surface (T7) invokes a use case,
// never a service or a repository (server-architecture.md §Dependency direction), and the use case
// owns no rule of its own — `OnHandAdjustmentService` owns them (§Services: "it must use an
// existing service when that service owns the relevant business rule").
import { AdjustItemOnHandCommand } from 'items/usecases/commands/adjust-item-on-hand.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const itemId = uuid('101');
const adjustmentId = uuid('110');
const createdAt = new Date('2026-08-26T09:45:00.000Z');

const currentUser: AccessCurrentUser = {
  userId: uuid('3'),
  warehouseId: uuid('1'),
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'ITEM_STOCK:ADJUST',
  archived: false,
};

const recorded = {
  id: adjustmentId,
  itemId,
  countedQuantity: 12,
  reason: 'Counted after the cancelled collection',
  adjustedByUserId: currentUser.userId,
  createdAt,
};

describe('AdjustItemOnHandCommand', () => {
  it('delegates the adjustment to the service that owns the rule and returns what it recorded', async () => {
    const onHandAdjustmentService = {
      adjust: jest.fn().mockResolvedValue(recorded),
    };
    const command = new AdjustItemOnHandCommand(
      onHandAdjustmentService as never,
    );

    await expect(
      command.execute(currentUser, itemId, {
        countedQuantity: 12,
        reason: 'Counted after the cancelled collection',
      }),
    ).resolves.toEqual(recorded);

    expect(onHandAdjustmentService.adjust).toHaveBeenCalledWith(
      currentUser,
      itemId,
      {
        countedQuantity: 12,
        reason: 'Counted after the cancelled collection',
      },
    );
  });

  // AC-09/AC-09a — the refusal is the service's, and it reaches the caller unwrapped: the use case
  // adds no `try/catch`, so the global filter is still the single normalization point
  // (server-error-handling.md §5, §6).
  it('lets the service refusal propagate untouched', async () => {
    const refusal = new Error('refused by the rule owner');
    const onHandAdjustmentService = {
      adjust: jest.fn().mockRejectedValue(refusal),
    };
    const command = new AdjustItemOnHandCommand(
      onHandAdjustmentService as never,
    );

    await expect(
      command.execute(currentUser, itemId, {
        countedQuantity: -1,
        reason: 'Counted',
      }),
    ).rejects.toBe(refusal);
  });
});
