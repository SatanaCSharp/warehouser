// `purchase-drafts/domain/services/purchase-draft-freeze.service.ts` does not exist yet (T13) —
// this is the RED for AC-14a and the two distinct 409 outcomes at the rule level, proven against
// controlled repository doubles per server-architecture.md §Testing: no database is involved. A
// state-guarded `UPDATE … WHERE state = 'draft'` returning zero affected rows cannot on its own
// tell "never was legal" apart from "became illegal between our read and our write" — the
// coordinator's ruling for this task states the rule: pre-read the draft's header before the
// guarded write; a pre-read state that is already wrong is `purchase_drafts.invalid_state`, while a
// pre-read state that was correct but the guarded write still lost the race is
// `purchase_drafts.concurrent_change` (sad.md §8). The persistence half — the snapshot rows and the
// genuinely concurrent race — is an integration property and lives in
// `shared/domain/repositories/purchase-draft-freeze.repository.integration.spec.ts`.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { PurchaseDraftFreezeService } from 'purchase-drafts/domain/services/purchase-draft-freeze.service';
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
  permissionId: 'PURCHASE_DRAFTS:READY',
  archived: false,
};

// Only the single method each collaborator actually calls, matching
// `PurchaseDraftAssemblyService`'s narrowed-dependency shape.
const assemblyRepositoryDouble = (lineCount: number) => ({
  findLines: jest
    .fn()
    .mockResolvedValue(Array.from({ length: lineCount }, () => ({}))),
});

interface DraftHeader {
  readonly warehouseId: string;
  readonly state: string;
}

const freezeRepositoryDouble = ({
  header,
  frozen,
}: {
  header: DraftHeader | null;
  frozen: boolean;
}) => ({
  findDraftHeader: jest.fn().mockResolvedValue(header),
  freeze: jest.fn().mockResolvedValue(frozen),
});

const serviceWith = ({
  lineCount = 1,
  frozen = true,
  header = { warehouseId, state: 'draft' },
}: {
  lineCount?: number;
  frozen?: boolean;
  header?: DraftHeader | null;
} = {}) => {
  const assemblyRepository = assemblyRepositoryDouble(lineCount);
  const freezeRepository = freezeRepositoryDouble({ header, frozen });
  const service = new PurchaseDraftFreezeService(
    freezeRepository,
    assemblyRepository,
    { now: () => now },
  );
  return { service, assemblyRepository, freezeRepository };
};

describe('PurchaseDraftFreezeService', () => {
  // AC-14a — a draft holding no lines is refused before any persistence write is attempted.
  it('refuses to ready a draft holding no lines and never calls the freeze repository', async () => {
    const { service, freezeRepository } = serviceWith({ lineCount: 0 });

    const attempt = service.ready(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_EMPTY,
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    expect(freezeRepository.freeze).not.toHaveBeenCalled();
  });

  // AC-14 — a draft holding at least one line is frozen with the acting member and the time.
  it('freezes a draft holding at least one line with the acting member and the time', async () => {
    const { service, freezeRepository } = serviceWith({
      lineCount: 1,
      frozen: true,
    });

    await service.ready(currentUser, draftId);

    expect(freezeRepository.freeze).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseDraftId: draftId,
        readiedByUserId: actorId,
        readiedAt: now,
      }),
    );
  });

  // The coordinator's ruling — a draft that resolves to nothing, or to another Warehouse, is the
  // non-enumerating unavailable outcome, never `invalid_state` or `concurrent_change`.
  it('refuses a draft that does not exist with the non-enumerating unavailable outcome', async () => {
    const { service, freezeRepository } = serviceWith({ header: null });

    const attempt = service.ready(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(freezeRepository.freeze).not.toHaveBeenCalled();
  });

  it('refuses a draft belonging to another Warehouse with the same non-enumerating outcome', async () => {
    const { service, freezeRepository } = serviceWith({
      header: { warehouseId: otherWarehouseId, state: 'draft' },
    });

    const attempt = service.ready(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(freezeRepository.freeze).not.toHaveBeenCalled();
  });

  // The coordinator's ruling — the pre-read state was already wrong for this transition
  // (readiness requires `draft`), so this is `invalid_state`, never `concurrent_change`, and the
  // guarded write is never attempted at all.
  it('refuses with invalid_state when the draft was already not in the draft state at read time', async () => {
    const { service, freezeRepository } = serviceWith({
      header: { warehouseId, state: 'ready_for_ordering' },
    });

    const attempt = service.ready(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_STATE,
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    expect(freezeRepository.freeze).not.toHaveBeenCalled();
  });

  // sad.md §8/§6.7 — the coordinator's ruling: the pre-read state WAS correct (`draft`), so the
  // guarded write's own zero-rows result means someone else moved it in between — that is
  // `concurrent_change`, never `invalid_state`. This is the case that actually distinguishes the
  // two codes, since both start from an apparently-legal pre-read.
  it('refuses with concurrent_change when the draft was in the draft state at read time but the guarded write still lost the race', async () => {
    const { service, freezeRepository } = serviceWith({
      header: { warehouseId, state: 'draft' },
      lineCount: 1,
      frozen: false,
    });

    const attempt = service.ready(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_CONCURRENT_CHANGE,
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    expect(freezeRepository.freeze).toHaveBeenCalled();
  });
});
