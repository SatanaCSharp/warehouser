// T15 — `purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command.ts` does not
// exist yet. The legitimate RED for the application boundary of AC-17 (server-architecture.md
// §Dependency direction, §Services): the command holds no rule of its own, delegates to
// `ArrivalConfirmationService`, and lets a refusal propagate unwrapped to the global exception
// filter, mirroring `close-purchase-draft.command.spec.ts` (T13) and
// `cancel-customer-order.command.spec.ts` (T8).
import { ConfirmPurchaseDraftArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const draftId = uuid('301');
const lineId = uuid('401');
const linkId = uuid('501');

const currentUser: AccessCurrentUser = {
  userId: uuid('3'),
  warehouseId: uuid('1'),
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:RECEIVE',
  archived: false,
};

const lines = [
  {
    purchaseDraftLineId: lineId,
    receivedQuantity: 100,
    allocations: [{ purchaseDraftLineLinkId: linkId, allocatedQuantity: 100 }],
  },
];

describe('ConfirmPurchaseDraftArrivalCommand', () => {
  it('delegates to the service that owns the rule and returns the closed draft', async () => {
    const closed = { id: draftId, state: 'closed' };
    const confirmationService = {
      confirm: jest.fn().mockResolvedValue(closed),
    };
    const command = new ConfirmPurchaseDraftArrivalCommand(confirmationService);

    await expect(
      command.execute(currentUser, draftId, { lines }),
    ).resolves.toEqual(closed);
    expect(confirmationService.confirm).toHaveBeenCalledWith(
      currentUser,
      draftId,
      lines,
    );
  });

  it('lets the service refusal propagate untouched', async () => {
    const refusal = new Error('refused by the rule owner');
    const command = new ConfirmPurchaseDraftArrivalCommand({
      confirm: jest.fn().mockRejectedValue(refusal),
    });

    await expect(command.execute(currentUser, draftId, { lines })).rejects.toBe(
      refusal,
    );
  });
});
