// `purchase-drafts/domain/services/purchase-draft-closure.service.ts` does not exist yet (T13) —
// this is the RED for AC-21's wiring, AC-24, AC-24a and the closure state guard at the rule level,
// proven against controlled repository doubles per server-architecture.md §Testing. Closure shares
// `PurchaseDraftFreezeService`'s ambiguity: a guarded `UPDATE … WHERE state = 'ready_for_ordering'`
// returning zero affected rows cannot on its own tell "never was Ready for Ordering" apart from
// "moved on between our read and our write" — the coordinator's ruling applies the same pre-read
// rule closure resolves through `PurchaseDraftTransitionConflict` (openapi.yaml): a pre-read state
// that is already wrong is `purchase_drafts.invalid_state`; a pre-read state that was correct but
// the guarded write still lost the race is `purchase_drafts.concurrent_change`. Discard resolves
// through the different `PurchaseDraftWriteConflict` schema, which carries no `concurrent_change`
// example at all, so a discard that loses its guarded write is always
// `purchase_drafts.discard_unavailable` without a pre-read. The persistence half — that closure
// leaves every linked Outstanding Quantity untouched and that discard leaves every linked Customer
// Order exactly as it was — is an integration property and lives in
// `shared/domain/repositories/purchase-draft-freeze.repository.integration.spec.ts`.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { PurchaseDraftClosureService } from 'purchase-drafts/domain/services/purchase-draft-closure.service';
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

const closureRepositoryDouble = ({
  header = { warehouseId, state: 'ready_for_ordering' },
  closed = true,
  discarded = true,
}: {
  header?: DraftHeader | null;
  closed?: boolean;
  discarded?: boolean;
} = {}) => ({
  findDraftHeader: jest.fn().mockResolvedValue(header),
  close: jest.fn().mockResolvedValue(closed),
  discard: jest.fn().mockResolvedValue(discarded),
});

const serviceWith = (
  overrides: {
    header?: DraftHeader | null;
    closed?: boolean;
    discarded?: boolean;
  } = {},
) => {
  const closureRepository = closureRepositoryDouble(overrides);
  const service = new PurchaseDraftClosureService(closureRepository, {
    now: () => now,
  });
  return { service, closureRepository };
};

describe('PurchaseDraftClosureService', () => {
  describe('close', () => {
    // AC-21 — a frozen draft resolves for closure and the reason, member and time are recorded.
    it('closes a frozen draft with the reason, the acting member and the time', async () => {
      const { service, closureRepository } = serviceWith({ closed: true });

      await service.close(currentUser, draftId, {
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
      const { service, closureRepository } = serviceWith({ header: null });

      const attempt = service.close(currentUser, draftId, {
        closureReason: 'The supplier cannot fulfil the order',
      });

      await expect(attempt).rejects.toMatchObject({
        code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
      });
      expect(closureRepository.close).not.toHaveBeenCalled();
    });

    it('refuses a draft belonging to another Warehouse with the same non-enumerating outcome', async () => {
      const { service, closureRepository } = serviceWith({
        header: { warehouseId: otherWarehouseId, state: 'ready_for_ordering' },
      });

      const attempt = service.close(currentUser, draftId, {
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
      const { service, closureRepository } = serviceWith({
        header: { warehouseId, state: 'draft' },
      });

      const attempt = service.close(currentUser, draftId, {
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
      const { service, closureRepository } = serviceWith({
        header: { warehouseId, state: 'ready_for_ordering' },
        closed: false,
      });

      const attempt = service.close(currentUser, draftId, {
        closureReason: 'The supplier cannot fulfil the order',
      });

      await expect(attempt).rejects.toMatchObject({
        code: ErrorCode.PURCHASE_DRAFTS_CONCURRENT_CHANGE,
      });
      await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
      expect(closureRepository.close).toHaveBeenCalled();
    });
  });

  describe('discard', () => {
    // AC-24 — a Draft-state draft resolves for discard and is recorded with the acting member and
    // the time.
    it('discards a draft still in the draft state with the acting member and the time', async () => {
      const { service, closureRepository } = serviceWith({ discarded: true });

      await service.discard(currentUser, draftId);

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
      const { service } = serviceWith({ discarded: false });

      const attempt = service.discard(currentUser, draftId);

      await expect(attempt).rejects.toMatchObject({
        code: ErrorCode.PURCHASE_DRAFTS_DISCARD_UNAVAILABLE,
      });
      await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    });
  });
});
