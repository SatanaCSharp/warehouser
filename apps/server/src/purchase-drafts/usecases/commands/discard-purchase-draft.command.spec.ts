// AC-24/AC-24a at the rule level, proven against controlled repository doubles per
// server-architecture.md §Testing. Discard resolves through the `PurchaseDraftWriteConflict` schema,
// which carries no `concurrent_change` example at all, so a discard that loses its guarded write is
// always `purchase_drafts.discard_unavailable` — which is why, unlike
// `close-purchase-draft.command.ts`, there is deliberately no pre-read. The persistence half — that
// discard leaves every linked Customer Order exactly as it was — is an integration property and
// lives in `shared/domain/repositories/purchase-draft-freeze.repository.integration.spec.ts`.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const actorId = uuid('3');
const draftId = uuid('301');
const now = new Date('2026-08-26T10:00:00.000Z');

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:DISCARD',
  archived: false,
};

const commandWith = ({ discarded = true }: { discarded?: boolean } = {}) => {
  const closureRepository = {
    discard: jest.fn().mockResolvedValue(discarded),
  };
  const command = new DiscardPurchaseDraftCommand(closureRepository as never, {
    now: () => now,
  });
  return { command, closureRepository };
};

describe('DiscardPurchaseDraftCommand', () => {
  // AC-24 — a Draft-state draft resolves for discard and is recorded with the acting member and
  // the time.
  it('discards a draft still in the draft state with the acting member and the time', async () => {
    const { command, closureRepository } = commandWith({ discarded: true });

    await command.execute(currentUser, draftId);

    expect(closureRepository.discard).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseDraftId: draftId,
        discardedByUserId: actorId,
        discardedAt: now,
      }),
    );
  });

  // AC-24a — a draft that has been made ready is closed with a reason rather than discarded;
  // the attempt is blocked with the named, non-generic error. `PurchaseDraftWriteConflict`
  // carries no `concurrent_change` example for discard, so a lost guarded write is always
  // `discard_unavailable`, without a pre-read.
  it('refuses to discard a draft that has been made ready', async () => {
    const { command } = commandWith({ discarded: false });

    const attempt = command.execute(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DISCARD_UNAVAILABLE,
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
  });
});
