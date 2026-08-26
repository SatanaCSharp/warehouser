// T13 — `purchase-drafts/usecases/commands/close-purchase-draft.command.ts` does not exist yet.
// The legitimate RED for the application boundary of AC-21
// (server-architecture.md §Dependency direction, §Services): the command holds no rule of its own,
// delegates to `PurchaseDraftClosureService`, and lets a refusal propagate unwrapped to the global
// exception filter, mirroring `customer-orders/usecases/commands/cancel-customer-order.command.spec.ts`
// (T8).
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const draftId = uuid('301');

const currentUser: AccessCurrentUser = {
  userId: uuid('3'),
  warehouseId: uuid('1'),
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:CLOSE',
  archived: false,
};

describe('ClosePurchaseDraftCommand', () => {
  it('delegates to the service that owns the rule and returns the closed draft', async () => {
    const closed = { id: draftId, state: 'closed' };
    const closureService = { close: jest.fn().mockResolvedValue(closed) };
    const command = new ClosePurchaseDraftCommand(closureService);

    await expect(
      command.execute(currentUser, draftId, {
        closureReason: 'The supplier cannot fulfil the order',
      }),
    ).resolves.toEqual(closed);
    expect(closureService.close).toHaveBeenCalledWith(currentUser, draftId, {
      closureReason: 'The supplier cannot fulfil the order',
    });
  });

  it('lets the service refusal propagate untouched', async () => {
    const refusal = new Error('refused by the rule owner');
    const command = new ClosePurchaseDraftCommand({
      close: jest.fn().mockRejectedValue(refusal),
    });

    await expect(
      command.execute(currentUser, draftId, { closureReason: '' }),
    ).rejects.toBe(refusal);
  });
});
