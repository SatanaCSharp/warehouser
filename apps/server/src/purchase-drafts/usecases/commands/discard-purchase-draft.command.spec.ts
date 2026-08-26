// T13 — `purchase-drafts/usecases/commands/discard-purchase-draft.command.ts` does not exist yet.
// The legitimate RED for the application boundary of AC-24/AC-24a
// (server-architecture.md §Dependency direction, §Services): the command holds no rule of its own,
// delegates to `PurchaseDraftClosureService`, and lets a refusal propagate unwrapped to the global
// exception filter, mirroring `customer-orders/usecases/commands/cancel-customer-order.command.spec.ts`
// (T8).
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const draftId = uuid('301');

const currentUser: AccessCurrentUser = {
  userId: uuid('3'),
  warehouseId: uuid('1'),
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:DISCARD',
  archived: false,
};

describe('DiscardPurchaseDraftCommand', () => {
  it('delegates to the service that owns the rule and returns the discarded draft', async () => {
    const discarded = { id: draftId, state: 'discarded' };
    const closureService = {
      discard: jest.fn().mockResolvedValue(discarded),
    };
    const command = new DiscardPurchaseDraftCommand(closureService);

    await expect(command.execute(currentUser, draftId)).resolves.toEqual(
      discarded,
    );
    expect(closureService.discard).toHaveBeenCalledWith(currentUser, draftId);
  });

  it('lets the service refusal propagate untouched', async () => {
    const refusal = new Error('refused by the rule owner');
    const command = new DiscardPurchaseDraftCommand({
      discard: jest.fn().mockRejectedValue(refusal),
    });

    await expect(command.execute(currentUser, draftId)).rejects.toBe(refusal);
  });
});
