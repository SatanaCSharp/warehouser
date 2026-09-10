// AC-24/AC-24a at the rule level, proven against controlled repository doubles per
// server-architecture.md §Testing. Discard resolves through the `PurchaseDraftWriteConflict` schema,
// which carries no `concurrent_change` example at all, so a discard that loses its guarded write is
// always `purchase_drafts.discard_unavailable` — which is why the pre-read deliberately does not
// re-decide the *state*, unlike `close-purchase-draft.command.ts`. What it does decide, exactly as
// `ready`/`close` do, is the non-enumerating outcome a draft outside the acting Warehouse is owed
// (AC-11). The persistence half — that discard leaves every linked Customer Order exactly as it
// was, and that a draft of another Warehouse affects zero rows — is an integration property and
// lives in `shared/domain/repositories/purchase-draft-freeze.repository.integration.spec.ts`.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { DiscardPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/discard-purchase-draft.command.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { describe, expect, it, vi } from 'vitest';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
const actorId = uuid('3');
const draftId = uuid('301');
const now = new Date('2026-08-26T10:00:00.000Z');

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:DISCARD',
  observedPermissionIds: [],
  archived: false,
};

const commandWith = ({
  discarded = true,
  header = { warehouseId, state: 'draft' },
}: {
  discarded?: boolean;
  header?: { warehouseId: string; state: string } | null;
} = {}) => {
  const closureRepository = {
    findDraftHeader: vi.fn().mockResolvedValue(header),
    discard: vi.fn().mockResolvedValue(discarded),
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
        warehouseId,
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

  // AC-11/spec.md §6.1 — a draft id is not authority to discard the draft it names. A draft of
  // another Warehouse, and a draft id that names nothing at all, produce one non-enumerating
  // `purchase_drafts.target_unavailable` (openapi.yaml `PurchaseDraftUnavailable` on `DELETE
  // /purchase-drafts/{id}`), so the refusal never confirms that the draft exists elsewhere — and it
  // is distinct from the `discard_unavailable` a member of the owning Warehouse would see. The
  // write is never attempted, and `discard`'s own `WHERE` clause carries `warehouse_id` besides, so
  // nothing here depends on the pre-read winning a race.
  it.each([
    [
      'a draft of another Warehouse',
      { warehouseId: otherWarehouseId, state: 'draft' },
    ],
    ['a draft that does not exist', null],
  ])('refuses %s on the same non-enumerating terms', async (_case, header) => {
    const { command, closureRepository } = commandWith({ header });

    const attempt = command.execute(currentUser, draftId);

    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(closureRepository.discard).not.toHaveBeenCalled();
  });
});
