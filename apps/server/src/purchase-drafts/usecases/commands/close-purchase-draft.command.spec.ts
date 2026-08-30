// AC-21's closure rules at the rule level, proven against controlled repository doubles per
// server-architecture.md §Testing. Closure shares `ready-purchase-draft.command.ts`'s ambiguity: a
// guarded `UPDATE … WHERE state = 'ready_for_ordering'` returning zero affected rows cannot on its
// own tell "never was Ready for Ordering" apart from "moved on between our read and our write" —
// the same pre-read rule resolves it through `PurchaseDraftTransitionConflict` (openapi.yaml): a
// pre-read state that is already wrong is `purchase_drafts.invalid_state`; a pre-read state that
// was correct but the guarded write still lost the race is `purchase_drafts.concurrent_change`. The
// persistence half — that closure leaves every linked Outstanding Quantity untouched — is an
// integration property and lives in
// `shared/domain/repositories/purchase-draft-freeze.repository.integration.spec.ts`.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { ClosePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/close-purchase-draft.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

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
  permissionId: 'PURCHASE_DRAFTS:CLOSE',
  archived: false,
};

interface DraftHeader {
  readonly warehouseId: string;
  readonly state: string;
}

const commandWith = ({
  header = { warehouseId, state: 'ready_for_ordering' },
  closed = true,
}: {
  header?: DraftHeader | null;
  closed?: boolean;
} = {}) => {
  const closureRepository = {
    findDraftHeader: jest.fn().mockResolvedValue(header),
    close: jest.fn().mockResolvedValue(closed),
  };
  const command = new ClosePurchaseDraftCommand(closureRepository as never, {
    now: () => now,
  });
  return { command, closureRepository };
};

describe('ClosePurchaseDraftCommand', () => {
  // AC-21 — a frozen draft resolves for closure and the reason, member and time are recorded.
  it('closes a frozen draft with the reason, the acting member and the time', async () => {
    const { command, closureRepository } = commandWith({ closed: true });

    await command.execute(currentUser, draftId, {
      closureReason: 'The supplier cannot fulfil the order',
    });

    expect(closureRepository.close).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseDraftId: draftId,
        closedByUserId: actorId,
        closedAt: now,
        closureReason: 'The supplier cannot fulfil the order',
      }),
    );
  });

  // The coordinator's ruling — a draft that resolves to nothing, or to another Warehouse, is
  // the non-enumerating unavailable outcome, never `invalid_state` or `concurrent_change`.
  it('refuses a draft that does not exist with the non-enumerating unavailable outcome', async () => {
    const { command, closureRepository } = commandWith({ header: null });

    const attempt = command.execute(currentUser, draftId, {
      closureReason: 'The supplier cannot fulfil the order',
    });

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(closureRepository.close).not.toHaveBeenCalled();
  });

  it('refuses a draft belonging to another Warehouse with the same non-enumerating outcome', async () => {
    const { command, closureRepository } = commandWith({
      header: { warehouseId: otherWarehouseId, state: 'ready_for_ordering' },
    });

    const attempt = command.execute(currentUser, draftId, {
      closureReason: 'The supplier cannot fulfil the order',
    });

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(closureRepository.close).not.toHaveBeenCalled();
  });

  // sad.md §6.11 — the pre-read state was already wrong for closure (it requires
  // `ready_for_ordering`), so this is `invalid_state`, never `concurrent_change`, and the
  // guarded write is never attempted at all.
  it('refuses with invalid_state when the draft was already not in Ready for Ordering at read time', async () => {
    const { command, closureRepository } = commandWith({
      header: { warehouseId, state: 'draft' },
    });

    const attempt = command.execute(currentUser, draftId, {
      closureReason: 'The supplier cannot fulfil the order',
    });

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_STATE,
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    expect(closureRepository.close).not.toHaveBeenCalled();
  });

  // sad.md §8 — the pre-read state WAS correct (`ready_for_ordering`), so the guarded write's
  // own zero-rows result means someone else moved it in between (e.g. an Arrival Confirmation
  // closed it first) — that is `concurrent_change`, never `invalid_state`.
  it('refuses with concurrent_change when the draft was in Ready for Ordering at read time but the guarded write still lost the race', async () => {
    const { command, closureRepository } = commandWith({
      header: { warehouseId, state: 'ready_for_ordering' },
      closed: false,
    });

    const attempt = command.execute(currentUser, draftId, {
      closureReason: 'The supplier cannot fulfil the order',
    });

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_CONCURRENT_CHANGE,
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    expect(closureRepository.close).toHaveBeenCalled();
  });
});
