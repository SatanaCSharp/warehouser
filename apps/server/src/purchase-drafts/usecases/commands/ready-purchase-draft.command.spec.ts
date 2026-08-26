// T13 — `purchase-drafts/usecases/commands/ready-purchase-draft.command.ts` does not exist yet.
// The legitimate RED for the application boundary of AC-14/AC-14a
// (server-architecture.md §Dependency direction, §Services): the command holds no rule of its own,
// delegates to `PurchaseDraftFreezeService`, and lets a refusal propagate unwrapped to the global
// exception filter, mirroring `customer-orders/usecases/commands/cancel-customer-order.command.spec.ts`
// (T8).
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const draftId = uuid('301');

const currentUser: AccessCurrentUser = {
  userId: uuid('3'),
  warehouseId: uuid('1'),
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:READY',
  archived: false,
};

describe('ReadyPurchaseDraftCommand', () => {
  it('delegates to the service that owns the rule and returns the frozen draft', async () => {
    const frozen = { id: draftId, state: 'ready_for_ordering' };
    const freezeService = { ready: jest.fn().mockResolvedValue(frozen) };
    const command = new ReadyPurchaseDraftCommand(freezeService);

    await expect(command.execute(currentUser, draftId)).resolves.toEqual(
      frozen,
    );
    expect(freezeService.ready).toHaveBeenCalledWith(currentUser, draftId);
  });

  it('lets the service refusal propagate untouched', async () => {
    const refusal = new Error('refused by the rule owner');
    const command = new ReadyPurchaseDraftCommand({
      ready: jest.fn().mockRejectedValue(refusal),
    });

    await expect(command.execute(currentUser, draftId)).rejects.toBe(refusal);
  });
});
