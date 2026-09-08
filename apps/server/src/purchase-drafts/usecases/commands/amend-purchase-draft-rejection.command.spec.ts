// T11/AC-18, AC-18a, AC-18b, AC-19, AC-26 — the amendment of one recorded Rejection, at the rule
// level, over controlled repository doubles (server-architecture.md §Testing).
//
// The command's precondition is **the Rejection and never the draft's state** (sad.md §6.4 step 5),
// which is visible here as an absence: the double below exposes only the two Rejection methods, so
// an implementation that reached for a draft header, a line or a state guard could not run at all.
// The positive half of that — a Rejection on a **Closed** draft amending, and nothing else on that
// draft moving — needs the store and lives in
// `amend-purchase-draft-rejection.command.integration.spec.ts`.
//
// Two rules this file deliberately does not restate, because they are already decided and already
// proven elsewhere: the SQL predicate that excludes the return to Undecided (T4,
// `purchase-draft-rejection.repository.integration.spec.ts`) and the two predicates the refusals are
// read from (T7, `purchase-draft-condition.predicates.spec.ts`). What is asserted here is only what
// the command owns: which refusal is owed, what it carries, what is handed to the write, and what
// the amendment returns.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { REJECTION_DISPOSITIONS } from 'purchase-drafts/domain/value-objects/line-condition';
import {
  AmendPurchaseDraftRejectionCommand,
  type AmendRejectionCommandInput,
} from 'purchase-drafts/usecases/commands/amend-purchase-draft-rejection.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
import type { LockedPurchaseDraftLineRejection } from 'shared/domain/repositories/purchase-draft-rejection.repository';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const actorId = uuid('2');
const rejectionId = uuid('451');
const lineId = uuid('452');
const now = new Date('2026-09-19T14:05:00.000Z');

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('3'),
  roleKind: 'custom',
  permissionId: 'REJECTIONS:UPDATE',
  observedPermissionIds: [],
  archived: false,
};

const lockedRejection = (
  overrides: Partial<LockedPurchaseDraftLineRejection> = {},
): LockedPurchaseDraftLineRejection => ({
  id: rejectionId,
  purchaseDraftLineId: lineId,
  warehouseId,
  disposition: 'undecided',
  description: 'Crushed on the pallet corner',
  ...overrides,
});

const commandWith = ({
  locked = lockedRejection(),
  affected = 1,
}: {
  locked?: LockedPurchaseDraftLineRejection | null;
  affected?: number;
} = {}) => {
  // Only the two methods sad.md §6.4 names. Any other reach — a draft header, a line, a state
  // guard — is a `TypeError`, which is how "the precondition is the Rejection, not the draft's
  // state" is enforced rather than merely asserted.
  const rejectionRepository = {
    lockRejectionForAmendment: jest.fn().mockResolvedValue(locked),
    amendRejection: jest.fn().mockResolvedValue({ affected }),
  };
  const command = new AmendPurchaseDraftRejectionCommand(
    rejectionRepository as never,
    { now: () => now },
  );
  return { command, rejectionRepository };
};

const amend = (
  input: AmendRejectionCommandInput,
  options: Parameters<typeof commandWith>[0] = {},
) => {
  const { command, rejectionRepository } = commandWith(options);
  return {
    rejectionRepository,
    attempt: command.execute(currentUser, rejectionId, input),
  };
};

// The whole vocabulary the write is allowed to address. spec.md §6 "Condition immutability": the
// quantity, Reason, Source and line of a Rejection are unwritable after insert, and this command is
// the only write that ever reopens the row — so the set is asserted as a closed set rather than by
// spot-checking a few forbidden names.
const WRITABLE_AMENDMENT_KEYS = [
  'amendedAt',
  'amendedByUserId',
  'description',
  'disposition',
  'rejectionId',
  'warehouseId',
];

describe('AmendPurchaseDraftRejectionCommand', () => {
  // AC-18 — the decision, the acting member and the time, in one write carrying the acting
  // Warehouse (AC-26 on the write path is the repository's predicate, so the command has to hand it
  // over).
  it('records a decision with the acting member and the time', async () => {
    const { attempt, rejectionRepository } = amend({
      disposition: 'held_for_return',
    });

    await expect(attempt).resolves.toEqual({
      id: rejectionId,
      description: 'Crushed on the pallet corner',
      disposition: 'held_for_return',
      amendedByUserId: actorId,
      amendedAt: now,
    });
    expect(rejectionRepository.lockRejectionForAmendment).toHaveBeenCalledWith(
      rejectionId,
      warehouseId,
    );
    expect(rejectionRepository.amendRejection).toHaveBeenCalledWith({
      rejectionId,
      warehouseId,
      disposition: 'held_for_return',
      amendedByUserId: actorId,
      amendedAt: now,
    });
  });

  // AC-18a — the refusal is owed on the zero-row result of the conditional update, and it names the
  // decision standing so the surface can drop `undecided` from the menu (openapi.yaml
  // `RejectionAmendmentConflict`). It names no Reason, description or quantity.
  it('refuses a Disposition aimed back at Undecided from a decided one, naming the decision standing', async () => {
    const { attempt } = amend(
      { disposition: 'undecided' },
      {
        locked: lockedRejection({ disposition: 'held_for_return' }),
        affected: 0,
      },
    );

    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DISPOSITION_NOT_REVERSIBLE,
      details: { currentDisposition: 'held_for_return' },
    });
  });

  // AC-18a's other half, and the case a naive "a decided Rejection is frozen" implementation
  // breaks: **no decision is terminal**. Held for return becomes scrapped on site, and the
  // amendment is attributed exactly as the first decision was.
  it('accepts a correction from one decided Disposition to another', async () => {
    const { attempt, rejectionRepository } = amend(
      { disposition: 'scrapped_on_site' },
      { locked: lockedRejection({ disposition: 'held_for_return' }) },
    );

    await expect(attempt).resolves.toMatchObject({
      disposition: 'scrapped_on_site',
      amendedByUserId: actorId,
      amendedAt: now,
    });
    expect(rejectionRepository.amendRejection).toHaveBeenCalledWith(
      expect.objectContaining({ disposition: 'scrapped_on_site' }),
    );
  });

  // AC-19 — the refusal names the Dispositions that are available, in the order openapi.yaml's
  // `unknownDisposition` example fixes, and nothing is written.
  it('refuses a Disposition outside the offered set, naming those that are offered', async () => {
    const { attempt, rejectionRepository } = amend({
      disposition: 'returned_to_supplier',
    });

    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
      details: { availableDispositions: [...REJECTION_DISPOSITIONS] },
    });
    expect(rejectionRepository.amendRejection).not.toHaveBeenCalled();
  });

  // AC-18b — the description alone. The Disposition is not written back: an implementation that
  // defaulted the absent one to the Rejection's current value would push `undecided` through the
  // repository's predicate and refuse a legitimate correction of a decided Rejection.
  it('records a description-only amendment without addressing the Disposition', async () => {
    const { attempt, rejectionRepository } = amend(
      { description: 'Crushed across two pallet corners' },
      { locked: lockedRejection({ disposition: 'held_for_return' }) },
    );

    await expect(attempt).resolves.toEqual({
      id: rejectionId,
      description: 'Crushed across two pallet corners',
      disposition: 'held_for_return',
      amendedByUserId: actorId,
      amendedAt: now,
    });
    const [written] = rejectionRepository.amendRejection.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(written).not.toHaveProperty('disposition');
    expect(written).toMatchObject({
      description: 'Crushed across two pallet corners',
    });
  });

  // "every amendment records the acting member and the time" (spec.md §6, AC-18/AC-18b) — on every
  // accepted shape, not only on the one that decides a Disposition.
  it.each([
    ['a decision alone', { disposition: 'refused_at_delivery' }],
    ['a description alone', { description: 'Seal split along the length' }],
    [
      'both together',
      {
        description: 'Supplier collected on 21 September.',
        disposition: 'refused_at_delivery',
      },
    ],
  ] as [string, AmendRejectionCommandInput][])(
    'attributes the amendment to the acting member and the time when it amends %s',
    async (_shape, input) => {
      const { attempt, rejectionRepository } = amend(input);

      await expect(attempt).resolves.toMatchObject({
        amendedByUserId: actorId,
        amendedAt: now,
      });
      expect(rejectionRepository.amendRejection).toHaveBeenCalledWith(
        expect.objectContaining({
          amendedByUserId: actorId,
          amendedAt: now,
        }),
      );
    },
  );

  // spec.md §6 "Condition immutability" — the fixed part of a Rejection Record is unwritable after
  // insert. The command never names a quantity, a Reason, a Source or a line on any path, so the
  // keys it hands the write are a subset of the six the amendment addresses.
  it('addresses no quantity, Reason, Source or line on any accepted path', async () => {
    const { attempt, rejectionRepository } = amend({
      description: 'Supplier collected on 21 September.',
      disposition: 'refused_at_delivery',
    });

    await attempt;
    const [written] = rejectionRepository.amendRejection.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(Object.keys(written).sort()).toEqual(WRITABLE_AMENDMENT_KEYS);
  });

  // AC-26 — a Rejection of a Warehouse the actor is not acting in resolves to nothing, exactly as
  // one that does not exist, and both fail with the one non-enumerating outcome. The two refusals
  // are compared to each other, so a variant that leaked "it exists elsewhere" into either the code
  // or the details would fail here even if each looked reasonable alone.
  it('fails identically for a Rejection of another Warehouse and for one that does not exist', async () => {
    const foreign = amend({ disposition: 'held_for_return' }, { locked: null });
    const missing = amend({ disposition: 'held_for_return' }, { locked: null });

    const foreignError = (await foreign.attempt.catch(
      (error: unknown) => error,
    )) as ApplicationError;
    const missingError = (await missing.attempt.catch(
      (error: unknown) => error,
    )) as ApplicationError;

    expect(foreignError).toBeInstanceOf(ApplicationError);
    expect(foreignError.code).toBe(
      ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    );
    expect(foreignError.code).toBe(missingError.code);
    expect(foreignError.details).toEqual(missingError.details);
    expect(foreign.rejectionRepository.amendRejection).not.toHaveBeenCalled();
  });

  // The edge T4's implementer surfaced and **no acceptance criterion covers**: `undecided` aimed at
  // a Rejection that is still `undecided`. It is pinned as **accepted** — a no-change amendment
  // that writes only the attribution — because that is what both already-decided halves say:
  // `dispositionMayBeRecorded` admits it (T7), the repository's predicate matches it (T4), and
  // openapi.yaml's `RejectionAmend.disposition` states it outright ("legal against a Rejection still
  // undecided, and refused against one already decided"). Refusing it here would make AC-18a's rule
  // depend on the payload rather than on the stored state.
  it('accepts Undecided aimed at a Rejection that is still Undecided, as a no-change amendment', async () => {
    const { attempt, rejectionRepository } = amend(
      { disposition: 'undecided' },
      { locked: lockedRejection({ disposition: 'undecided' }), affected: 1 },
    );

    await expect(attempt).resolves.toMatchObject({
      disposition: 'undecided',
      amendedByUserId: actorId,
      amendedAt: now,
    });
    expect(rejectionRepository.amendRejection).toHaveBeenCalled();
  });

  it('runs inside its own transaction boundary (server-architecture.md: the command owning the complete atomic operation)', () => {
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        AmendPurchaseDraftRejectionCommand.prototype.execute,
      ) as TransactionalMetadata | undefined,
    ).toBeDefined();
  });
});
