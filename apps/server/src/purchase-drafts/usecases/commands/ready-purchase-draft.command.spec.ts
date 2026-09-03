// AC-14a and the two distinct 409 outcomes at the rule level, proven against controlled repository
// doubles per server-architecture.md §Testing: no database is involved. The rules live in the
// command itself — there is no pass-through service between the use case and the repositories it
// writes through (server-architecture.md §Use cases). A
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
import { ReadyPurchaseDraftCommand } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';
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
  observedPermissionIds: [],
  archived: false,
};

// The two ways a line's goods travel, as `findLines` hands them back (AC-13/AC-16).
const customerAddressA = uuid('901');
const customerAddressB = uuid('902');
const viaWarehouseLineId = uuid('401');
const directLineId = uuid('402');

interface LineDouble {
  readonly id: string;
  readonly deliveryMode: 'via_warehouse' | 'direct_to_customer';
  readonly customerDeliveryAddressId: string | null;
}

const viaWarehouseLine: LineDouble = {
  id: viaWarehouseLineId,
  deliveryMode: 'via_warehouse',
  customerDeliveryAddressId: null,
};

const directLine: LineDouble = {
  id: directLineId,
  deliveryMode: 'direct_to_customer',
  customerDeliveryAddressId: customerAddressA,
};

// Only the single method each collaborator actually calls; the doubles are cast at the
// construction site rather than the production type being widened to admit them.
const assemblyRepositoryDouble = (lines: readonly LineDouble[]) => ({
  findLines: jest.fn().mockResolvedValue(lines),
});

// AC-15a — T15's shared `findDisagreeingLinks`, which the freeze is the third caller of. The
// double answers per line so a draft can disagree on more than one of them at once.
const assemblyServiceDouble = (
  disagreementsByLine: Readonly<Record<string, readonly unknown[]>>,
) => ({
  findDisagreeingLinks: jest
    .fn()
    .mockImplementation((_scope: unknown, purchaseDraftLineId: string) =>
      Promise.resolve(disagreementsByLine[purchaseDraftLineId] ?? []),
    ),
});

interface DraftHeader {
  readonly warehouseId: string;
  readonly state: string;
  readonly warehouseDeliveryAddressText: string | null;
}

const recordedWarehouseAddress = 'Dock 4, Test Industrial Estate';

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

const commandWith = ({
  lines = [viaWarehouseLine],
  frozen = true,
  header = {
    warehouseId,
    state: 'draft',
    warehouseDeliveryAddressText: recordedWarehouseAddress,
  },
  disagreementsByLine = {},
}: {
  lines?: readonly LineDouble[];
  frozen?: boolean;
  header?: DraftHeader | null;
  disagreementsByLine?: Readonly<Record<string, readonly unknown[]>>;
} = {}) => {
  const assemblyRepository = assemblyRepositoryDouble(lines);
  const freezeRepository = freezeRepositoryDouble({ header, frozen });
  const assemblyService = assemblyServiceDouble(disagreementsByLine);
  const command = new ReadyPurchaseDraftCommand(
    freezeRepository as never,
    assemblyRepository as never,
    assemblyService as never,
    { now: () => now },
  );
  return { command, assemblyRepository, freezeRepository, assemblyService };
};

describe('ReadyPurchaseDraftCommand', () => {
  // AC-14a — a draft holding no lines is refused before any persistence write is attempted.
  it('refuses to ready a draft holding no lines and never calls the freeze repository', async () => {
    const { command, freezeRepository } = commandWith({ lines: [] });

    const attempt = command.execute(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_EMPTY,
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    expect(freezeRepository.freeze).not.toHaveBeenCalled();
  });

  // AC-14 — a draft holding at least one line is frozen with the acting member and the time.
  it('freezes a draft holding at least one line with the acting member and the time', async () => {
    const { command, freezeRepository } = commandWith({
      lines: [viaWarehouseLine],
      frozen: true,
    });

    await command.execute(currentUser, draftId);

    // `warehouseId` is part of the write's own `WHERE` clause, so the command has to hand it over
    // — the pre-read above it decides which refusal is owed, never whether the write may happen.
    expect(freezeRepository.freeze).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseDraftId: draftId,
        warehouseId,
        readiedByUserId: actorId,
        readiedAt: now,
      }),
    );
  });

  // The coordinator's ruling — a draft that resolves to nothing, or to another Warehouse, is the
  // non-enumerating unavailable outcome, never `invalid_state` or `concurrent_change`.
  it('refuses a draft that does not exist with the non-enumerating unavailable outcome', async () => {
    const { command, freezeRepository } = commandWith({ header: null });

    const attempt = command.execute(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(freezeRepository.freeze).not.toHaveBeenCalled();
  });

  it('refuses a draft belonging to another Warehouse with the same non-enumerating outcome', async () => {
    const { command, freezeRepository } = commandWith({
      header: {
        warehouseId: otherWarehouseId,
        state: 'draft',
        warehouseDeliveryAddressText: recordedWarehouseAddress,
      },
    });

    const attempt = command.execute(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(freezeRepository.freeze).not.toHaveBeenCalled();
  });

  // The coordinator's ruling — the pre-read state was already wrong for this transition
  // (readiness requires `draft`), so this is `invalid_state`, never `concurrent_change`, and the
  // guarded write is never attempted at all.
  it('refuses with invalid_state when the draft was already not in the draft state at read time', async () => {
    const { command, freezeRepository } = commandWith({
      header: {
        warehouseId,
        state: 'ready_for_ordering',
        warehouseDeliveryAddressText: recordedWarehouseAddress,
      },
    });

    const attempt = command.execute(currentUser, draftId);

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
    const { command, freezeRepository } = commandWith({
      header: {
        warehouseId,
        state: 'draft',
        warehouseDeliveryAddressText: recordedWarehouseAddress,
      },
      lines: [viaWarehouseLine],
      frozen: false,
    });

    const attempt = command.execute(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_CONCURRENT_CHANGE,
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    expect(freezeRepository.freeze).toHaveBeenCalled();
  });

  // AC-16a — a line coming to the warehouse cannot be frozen before the warehouse has an address to
  // be delivered to. The refusal names the capability that records one, and the guarded write is
  // never attempted, so nothing changes.
  it('refuses a draft holding a Via Warehouse line when the Warehouse has no Delivery Address, naming the capability that records one', async () => {
    const { command, freezeRepository } = commandWith({
      lines: [viaWarehouseLine, directLine],
      header: {
        warehouseId,
        state: 'draft',
        warehouseDeliveryAddressText: null,
      },
    });

    const attempt = command.execute(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_WAREHOUSE_DELIVERY_ADDRESS_REQUIRED,
      details: { requiredPermissionId: 'WAREHOUSES:ADDRESS_UPDATE' },
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    expect(freezeRepository.freeze).not.toHaveBeenCalled();
  });

  // AC-16a is a precondition about Via Warehouse lines alone: a draft holding only directly-shipped
  // lines never comes to the dock, so the Warehouse's own address is not required of it.
  it('freezes a draft holding only Direct to Customer lines even when the Warehouse has no Delivery Address', async () => {
    const { command, freezeRepository } = commandWith({
      lines: [directLine],
      header: {
        warehouseId,
        state: 'draft',
        warehouseDeliveryAddressText: null,
      },
    });

    await command.execute(currentUser, draftId);

    expect(freezeRepository.freeze).toHaveBeenCalled();
  });

  // AC-15a — the freeze is the third moment the direct-line agreement is required, and it names
  // **every** disagreeing link across **every** line, withdrawing none.
  it('refuses a disagreeing link set naming every disagreement across every line, and never attempts the write', async () => {
    const firstDisagreement = {
      purchaseDraftLineLinkId: uuid('501'),
      customerOrderId: uuid('601'),
      lineDeliveryAddressId: customerAddressA,
      customerOrderDeliveryAddressId: customerAddressB,
    };
    const secondDisagreement = {
      purchaseDraftLineLinkId: uuid('502'),
      customerOrderId: uuid('602'),
      lineDeliveryAddressId: customerAddressB,
      customerOrderDeliveryAddressId: null,
    };
    const secondDirectLine = {
      id: uuid('403'),
      deliveryMode: 'direct_to_customer' as const,
      customerDeliveryAddressId: customerAddressB,
    };
    const { command, freezeRepository } = commandWith({
      lines: [directLine, secondDirectLine],
      disagreementsByLine: {
        [directLine.id]: [firstDisagreement],
        [secondDirectLine.id]: [secondDisagreement],
      },
    });

    const attempt = command.execute(currentUser, draftId);

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT,
      details: { disagreeingLinks: [firstDisagreement, secondDisagreement] },
    });
    await expect(attempt).rejects.toBeInstanceOf(ApplicationError);
    expect(freezeRepository.freeze).not.toHaveBeenCalled();
  });

  // T15's note — "the freeze can call the same method with no prospective links". The agreement is
  // asked of the links the line already has, so the freeze states none.
  it('asks the shared agreement read about every line, with no prospective links', async () => {
    const { command, assemblyService } = commandWith({
      lines: [viaWarehouseLine, directLine],
    });

    await command.execute(currentUser, draftId);

    expect(assemblyService.findDisagreeingLinks).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      directLine.id,
      {
        deliveryMode: 'direct_to_customer',
        customerDeliveryAddressId: customerAddressA,
      },
    );
    expect(assemblyService.findDisagreeingLinks).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      viaWarehouseLine.id,
      { deliveryMode: 'via_warehouse', customerDeliveryAddressId: null },
    );
  });
});
