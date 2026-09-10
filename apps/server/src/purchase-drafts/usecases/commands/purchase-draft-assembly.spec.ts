// AC-10, AC-11, AC-11a, AC-12 and AC-13 at the rule level, proven against controlled repository
// doubles per server-architecture.md §Testing, so no database is involved: what these cases assert
// is that a refused write is **never attempted**, and that an accepted one reaches the repository
// exactly as the member composed it — unadjusted, per AC-11a. The persistence half of the state
// guard (zero rows affected) is an integration property and lives in
// `shared/domain/repositories/purchase-draft-assembly.repository.integration.spec.ts`.
//
// One file for the eight assembly commands, following `access/usecases/role-lifecycle.spec.ts`:
// they share one set of repository doubles and one set of rules, and each is built here exactly as
// Nest builds it — over a real `PurchaseDraftAssemblyService`, not a double of it, because the
// service holds only the checks the commands share and every case below is about the rule it
// enforces, not about the call being made (server-architecture.md §Services, §Use cases).
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service.js';
import { AddPurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line.command.js';
import { AddPurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/add-purchase-draft-line-link.command.js';
import { CreatePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/create-purchase-draft.command.js';
import { RemovePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line.command.js';
import { RemovePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/remove-purchase-draft-line-link.command.js';
import { RevisePurchaseDraftCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft.command.js';
import { RevisePurchaseDraftLineCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line.command.js';
import { RevisePurchaseDraftLineLinkCommand } from 'purchase-drafts/usecases/commands/revise-purchase-draft-line-link.command.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import type { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity.js';
import type { PurchaseDraftLineDeliveryMode } from 'shared/domain/entities/purchase-draft-line.entity.js';
import type { AssemblyWriteOutcome } from 'shared/domain/repositories/purchase-draft-assembly.repository.js';
import { describe, expect, it, vi } from 'vitest';

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseId = uuid('1');
const otherWarehouseId = uuid('2');
const actorId = uuid('3');
const itemId = uuid('101');
const otherItemId = uuid('102');
const customerOrderId = uuid('201');
const otherCustomerOrderId = uuid('202');
const draftId = uuid('301');
// Where the Customer Order a link names is going. The agreement between that address and the one a
// Direct to Customer line ships to is `purchase-draft-line-delivery.spec.ts`; here it is only the
// value the locked order carries, so the link commands have one to read.
const customerAddressA = uuid('901');
const now = new Date('2026-08-26T10:00:00.000Z');

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:CREATE',
  observedPermissionIds: [],
  archived: false,
};

const catalogueIds = ['loose_items', 'cartons', 'pallets', 'cable_coil'];

const storedDraft = (
  overrides: Partial<PurchaseDraftEntity> = {},
): PurchaseDraftEntity => ({
  id: draftId,
  warehouseId,
  state: 'draft',
  expectedArrivalDate: null,
  createdByUserId: actorId,
  readiedByUserId: null,
  readiedAt: null,
  closedByUserId: null,
  closedAt: null,
  closureReason: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const itemCatalogueRepositoryDouble = (
  item: {
    id: string;
    warehouseId: string;
    deactivatedAt: Date | null;
  } | null = {
    id: itemId,
    warehouseId,
    deactivatedAt: null,
  },
) => ({ findById: vi.fn().mockResolvedValue(item) });

const customerOrderLifecycleRepositoryDouble = (
  locked: {
    order: {
      id: string;
      warehouseId: string;
      customerDeliveryAddressId?: string | null;
    };
  } | null = {
    order: {
      id: customerOrderId,
      warehouseId,
      customerDeliveryAddressId: customerAddressA,
    },
  },
) => ({
  lockOrderWithAllocatedTotal: vi.fn().mockResolvedValue(locked),
});

const packagingTypeCatalogueRepositoryDouble = () => ({
  listPackagingTypes: vi
    .fn()
    .mockResolvedValue(catalogueIds.map((id) => ({ id, label: id }))),
});

const assemblyRepositoryDouble = (
  outcome: AssemblyWriteOutcome = 'applied',
  delivery: {
    lineDestination?: {
      deliveryMode: PurchaseDraftLineDeliveryMode;
      customerDeliveryAddressId: string | null;
    } | null;
    linkedOrders?: readonly {
      purchaseDraftLineLinkId: string;
      customerOrderId: string;
      customerOrderDeliveryAddressId: string | null;
    }[];
  } = {},
) => ({
  findLineDestination: vi
    .fn()
    .mockResolvedValue(
      delivery.lineDestination === undefined
        ? { deliveryMode: 'via_warehouse', customerDeliveryAddressId: null }
        : delivery.lineDestination,
    ),
  findLinkedOrderDestinations: vi
    .fn()
    .mockResolvedValue(delivery.linkedOrders ?? []),
  createDraft: vi
    .fn()
    .mockImplementation((input: { id: string }) =>
      Promise.resolve(storedDraft({ id: input.id })),
    ),
  updateDraft: vi.fn().mockResolvedValue(outcome),
  addLine: vi.fn().mockResolvedValue(outcome),
  updateLine: vi.fn().mockResolvedValue(outcome),
  removeLine: vi.fn().mockResolvedValue(outcome),
  addLink: vi.fn().mockResolvedValue(outcome),
  updateLink: vi.fn().mockResolvedValue(outcome),
  removeLink: vi.fn().mockResolvedValue(outcome),
});

// Every command is built from the same doubles, exactly as Nest builds it from the same providers.
// The doubles are narrower than the concrete repositories, so they are cast at the construction
// site rather than the production types being widened to admit them
// (`creating-a-server-repository.md` — inject the specialized concrete repository).
const commandsWith = ({
  assemblyRepository = assemblyRepositoryDouble(),
  itemCatalogueRepository = itemCatalogueRepositoryDouble(),
  customerOrderLifecycleRepository = customerOrderLifecycleRepositoryDouble(),
  packagingTypeCatalogueRepository = packagingTypeCatalogueRepositoryDouble(),
}: {
  assemblyRepository?: ReturnType<typeof assemblyRepositoryDouble>;
  itemCatalogueRepository?: ReturnType<typeof itemCatalogueRepositoryDouble>;
  customerOrderLifecycleRepository?: ReturnType<
    typeof customerOrderLifecycleRepositoryDouble
  >;
  packagingTypeCatalogueRepository?: ReturnType<
    typeof packagingTypeCatalogueRepositoryDouble
  >;
} = {}) => {
  const assemblyService = new PurchaseDraftAssemblyService(
    itemCatalogueRepository as never,
    customerOrderLifecycleRepository as never,
    packagingTypeCatalogueRepository as never,
    assemblyRepository as never,
  );

  return {
    create: new CreatePurchaseDraftCommand(
      assemblyRepository as never,
      assemblyService,
      {
        purchaseDraftId: () => draftId,
        purchaseDraftLineId: () => uuid('401'),
        purchaseDraftLineLinkId: () => uuid('501'),
        now: () => now,
      },
    ),
    revise: new RevisePurchaseDraftCommand(assemblyRepository as never),
    addLine: new AddPurchaseDraftLineCommand(
      assemblyRepository as never,
      assemblyService,
      { purchaseDraftLineId: () => uuid('401') },
    ),
    reviseLine: new RevisePurchaseDraftLineCommand(
      assemblyRepository as never,
      assemblyService,
      // T19/AC-12 — the address-book read the line revision issues before writing a Direct to
      // Customer destination. Every case in this file revises something other than the
      // destination, so it answers with an active address of this Warehouse and is never reached;
      // the rule itself is proved in `purchase-draft-line-delivery.spec.ts`.
      {
        findWarehouseDeliveryAddress: vi
          .fn()
          .mockResolvedValue({ deactivatedAt: null }),
      } as never,
    ),
    removeLine: new RemovePurchaseDraftLineCommand(assemblyRepository as never),
    addLink: new AddPurchaseDraftLineLinkCommand(
      assemblyRepository as never,
      assemblyService,
      { purchaseDraftLineLinkId: () => uuid('501') },
    ),
    reviseLink: new RevisePurchaseDraftLineLinkCommand(
      assemblyRepository as never,
    ),
    removeLink: new RemovePurchaseDraftLineLinkCommand(
      assemblyRepository as never,
    ),
  };
};

const baseLine = {
  itemId,
  orderedQuantity: 150,
};

describe('CreatePurchaseDraftCommand (AC-10)', () => {
  it('records a draft in the Draft state with no Expected Arrival Date stated', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const created = await commandsWith({ assemblyRepository }).create.execute(
      currentUser,
      { lines: [baseLine] },
    );

    expect(assemblyRepository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId,
        expectedArrivalDate: null,
        createdByUserId: actorId,
        createdAt: now,
      }),
    );
    expect(created).toMatchObject({ state: 'draft' });
  });
});

describe('CreatePurchaseDraftCommand (AC-11)', () => {
  // AC-11 — a line naming an Item of a different Warehouse is refused, telling the member that a
  // draft, the Items it names and the demand it serves all belong to the same Warehouse.
  it.each([
    [
      'an Item of another Warehouse',
      { id: itemId, warehouseId: otherWarehouseId, deactivatedAt: null },
    ],
    ['a missing Item', null],
    [
      // AC-06d — deactivation stops offering the Item when a draft is assembled, on exactly the
      // same non-enumerating terms, so the refusal never says which of the three it was.
      'a deactivated Item of this Warehouse',
      { id: itemId, warehouseId, deactivatedAt: new Date('2026-08-20') },
    ],
  ])('refuses %s on the same-Warehouse terms', async (_case, item) => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({
      assemblyRepository,
      itemCatalogueRepository: itemCatalogueRepositoryDouble(item),
    }).create.execute(currentUser, { lines: [baseLine] });

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(assemblyRepository.createDraft).not.toHaveBeenCalled();
  });

  // AC-11 — the same refusal for a link naming a Customer Order of a different Warehouse.
  it.each([
    [
      'a Customer Order of another Warehouse',
      { order: { id: customerOrderId, warehouseId: otherWarehouseId } },
    ],
    ['a missing Customer Order', null],
  ])('refuses %s on the same-Warehouse terms', async (_case, locked) => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({
      assemblyRepository,
      customerOrderLifecycleRepository:
        customerOrderLifecycleRepositoryDouble(locked),
    }).create.execute(currentUser, {
      lines: [
        {
          ...baseLine,
          links: [{ customerOrderId, statedQuantity: 100 }],
        },
      ],
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(assemblyRepository.createDraft).not.toHaveBeenCalled();
  });
});

describe('CreatePurchaseDraftCommand (AC-11a)', () => {
  // AC-11a — a second line linking to a Customer Order another line already links to, and links
  // whose quantities do not add up to the line quantity, are both recorded exactly as composed:
  // never blocked, never adjusted, because coverage is the member's decision.
  it('passes overlapping and non-summing link quantities through unadjusted', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).create.execute(currentUser, {
      lines: [
        {
          itemId,
          orderedQuantity: 50,
          links: [
            { customerOrderId, statedQuantity: 500 },
            { customerOrderId: otherCustomerOrderId, statedQuantity: 1 },
          ],
        },
      ],
    });

    expect(assemblyRepository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            orderedQuantity: 50,
            links: [
              expect.objectContaining({
                customerOrderId,
                statedQuantity: 500,
              }),
              expect.objectContaining({
                customerOrderId: otherCustomerOrderId,
                statedQuantity: 1,
              }),
            ],
          }),
        ],
      }),
    );
  });
});

describe('CreatePurchaseDraftCommand (AC-12)', () => {
  // AC-12 — each line's Packaging Type and Value-adding Note are recorded separately from every
  // other line's.
  it('records each line’s Pre-receipt Requirement independently of the other', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).create.execute(currentUser, {
      lines: [
        {
          itemId,
          orderedQuantity: 40,
          packagingTypeId: 'cartons',
          valueAddingNote: 'Bundle in tens',
        },
        {
          itemId: otherItemId,
          orderedQuantity: 150,
          packagingTypeId: 'cable_coil',
          valueAddingNote: 'Translated sticker on each coil',
        },
      ],
    });

    expect(assemblyRepository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            packagingTypeId: 'cartons',
            valueAddingNote: 'Bundle in tens',
          }),
          expect.objectContaining({
            packagingTypeId: 'cable_coil',
            valueAddingNote: 'Translated sticker on each coil',
          }),
        ],
      }),
    );
  });
});

describe('CreatePurchaseDraftCommand (AC-13)', () => {
  // AC-13 — a Packaging Type outside the catalogue is refused, naming the four the catalogue
  // offers, read from the catalogue repository rather than hard-coded.
  it('refuses a Packaging Type outside the catalogue, naming every one the catalogue offers', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({ assemblyRepository }).create.execute(
      currentUser,
      {
        lines: [{ ...baseLine, packagingTypeId: 'wooden_crate' }],
      },
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_UNKNOWN_PACKAGING_TYPE,
      details: { field: 'packagingTypeId', packagingTypeIds: catalogueIds },
    });
    expect(assemblyRepository.createDraft).not.toHaveBeenCalled();
  });

  it('accepts every one of the four catalogue entries', async () => {
    for (const packagingTypeId of catalogueIds) {
      const assemblyRepository = assemblyRepositoryDouble();

      await expect(
        commandsWith({ assemblyRepository }).create.execute(currentUser, {
          lines: [{ ...baseLine, packagingTypeId }],
        }),
      ).resolves.toBeDefined();
      expect(assemblyRepository.createDraft).toHaveBeenCalled();
    }
  });
});

// The add/change/remove use cases for lines and links.
// `createDraft` above covers composing a draft in one submission; a draft is assembled over the
// course of deciding, so every one of these writes carries the same rules: the same-Warehouse rule
// on a named Item or Customer Order (AC-11), the catalogue rule on a Packaging Type (AC-13), link
// quantities passed through unadjusted (AC-11a), and the state guard that makes every one of them
// structurally impossible against a frozen draft (AC-10a, AC-15).
//
// The guard is enforced in the repository's own `WHERE` clause, so these cases prove only what the
// command does with the outcome it is handed: `draft-frozen` becomes the 409 the contract
// specifies (`PurchaseDraftWriteConflict`), `target-missing` the 404
// (`PurchaseDraftTargetUnavailable`). openapi.yaml lists both on every one of these routes, which
// is why the repository reports which of the two happened rather than a bare boolean.
const lineId = uuid('401');
const linkId = uuid('501');

describe('AddPurchaseDraftLineCommand (AC-11, AC-12, AC-13)', () => {
  it('records the line with its Pre-receipt Requirement exactly as composed', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).addLine.execute(
      currentUser,
      draftId,
      {
        itemId,
        orderedQuantity: 160,
        packagingTypeId: 'pallets',
        valueAddingNote: 'Shrink-wrap each pallet',
      },
    );

    expect(assemblyRepository.addLine).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseDraftId: draftId,
        warehouseId,
        itemId,
        orderedQuantity: 160,
        packagingTypeId: 'pallets',
        valueAddingNote: 'Shrink-wrap each pallet',
      }),
    );
  });

  it('refuses an Item of another Warehouse and never attempts the write (AC-11)', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({
      assemblyRepository,
      itemCatalogueRepository: itemCatalogueRepositoryDouble({
        id: otherItemId,
        warehouseId: otherWarehouseId,
        deactivatedAt: null,
      }),
    }).addLine.execute(currentUser, draftId, {
      itemId: otherItemId,
      orderedQuantity: 10,
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(assemblyRepository.addLine).not.toHaveBeenCalled();
  });

  it('refuses a Packaging Type outside the catalogue, naming what it offers (AC-13)', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({ assemblyRepository }).addLine.execute(
      currentUser,
      draftId,
      { itemId, orderedQuantity: 10, packagingTypeId: 'barrels' },
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_UNKNOWN_PACKAGING_TYPE,
      details: { field: 'packagingTypeId', packagingTypeIds: catalogueIds },
    });
    expect(assemblyRepository.addLine).not.toHaveBeenCalled();
  });

  it('refuses the write against a frozen draft (AC-10a, AC-15)', async () => {
    const rejection = commandsWith({
      assemblyRepository: assemblyRepositoryDouble('draft-frozen'),
    }).addLine.execute(currentUser, draftId, { itemId, orderedQuantity: 10 });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN,
    });
  });
});

describe('RevisePurchaseDraftLineCommand (AC-12, AC-13)', () => {
  it('passes only the stated changes through, clearing a half set to null', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).reviseLine.execute(
      currentUser,
      draftId,
      lineId,
      { orderedQuantity: 200, valueAddingNote: null },
    );

    expect(assemblyRepository.updateLine).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      lineId,
      {
        orderedQuantity: 200,
        valueAddingNote: null,
      },
    );
  });

  it('refuses a Packaging Type outside the catalogue (AC-13)', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({ assemblyRepository }).reviseLine.execute(
      currentUser,
      draftId,
      lineId,
      { packagingTypeId: 'barrels' },
    );

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_UNKNOWN_PACKAGING_TYPE,
    });
    expect(assemblyRepository.updateLine).not.toHaveBeenCalled();
  });

  it('refuses an Item of another Warehouse (AC-11)', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({
      assemblyRepository,
      itemCatalogueRepository: itemCatalogueRepositoryDouble({
        id: otherItemId,
        warehouseId: otherWarehouseId,
        deactivatedAt: null,
      }),
    }).reviseLine.execute(currentUser, draftId, lineId, {
      itemId: otherItemId,
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(assemblyRepository.updateLine).not.toHaveBeenCalled();
  });

  it('reports a line that is not a line of this draft as unavailable, not as frozen', async () => {
    const rejection = commandsWith({
      assemblyRepository: assemblyRepositoryDouble('target-missing'),
    }).reviseLine.execute(currentUser, draftId, lineId, { orderedQuantity: 1 });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
  });

  it('refuses the write against a frozen draft (AC-10a, AC-15)', async () => {
    const rejection = commandsWith({
      assemblyRepository: assemblyRepositoryDouble('draft-frozen'),
    }).reviseLine.execute(currentUser, draftId, lineId, { orderedQuantity: 1 });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN,
    });
  });
});

describe('RemovePurchaseDraftLineCommand (AC-10a, AC-11a)', () => {
  it('removes the line without writing the Customer Orders its links named', async () => {
    const assemblyRepository = assemblyRepositoryDouble();
    const customerOrderLifecycleRepository =
      customerOrderLifecycleRepositoryDouble();

    await commandsWith({
      assemblyRepository,
      customerOrderLifecycleRepository,
    }).removeLine.execute(currentUser, draftId, lineId);

    expect(assemblyRepository.removeLine).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      lineId,
    );
    // AC-11a — a link claims nothing, so removing one changes no demand.
    expect(
      customerOrderLifecycleRepository.lockOrderWithAllocatedTotal,
    ).not.toHaveBeenCalled();
  });

  it('refuses the write against a frozen draft (AC-10a, AC-15)', async () => {
    const rejection = commandsWith({
      assemblyRepository: assemblyRepositoryDouble('draft-frozen'),
    }).removeLine.execute(currentUser, draftId, lineId);

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN,
    });
  });
});

describe('the Purchase Draft line-link commands (AC-11, AC-11a)', () => {
  it('records a link quantity unadjusted, however it compares to the line', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).addLink.execute(
      currentUser,
      draftId,
      lineId,
      { customerOrderId, statedQuantity: 9999 },
    );

    expect(assemblyRepository.addLink).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseDraftId: draftId,
        purchaseDraftLineId: lineId,
        warehouseId,
        customerOrderId,
        statedQuantity: 9999,
      }),
    );
  });

  it('refuses a Customer Order of another Warehouse (AC-11)', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({
      assemblyRepository,
      customerOrderLifecycleRepository: customerOrderLifecycleRepositoryDouble({
        order: { id: otherCustomerOrderId, warehouseId: otherWarehouseId },
      }),
    }).addLink.execute(currentUser, draftId, lineId, {
      customerOrderId: otherCustomerOrderId,
      statedQuantity: 1,
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(assemblyRepository.addLink).not.toHaveBeenCalled();
  });

  it('revises a link quantity unadjusted', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).reviseLink.execute(
      currentUser,
      draftId,
      linkId,
      1,
    );

    expect(assemblyRepository.updateLink).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      linkId,
      1,
    );
  });

  it('removes a link without writing the Customer Order it named (AC-11a)', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).removeLink.execute(
      currentUser,
      draftId,
      linkId,
    );

    expect(assemblyRepository.removeLink).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      linkId,
    );
  });

  it('refuses every link write against a frozen draft (AC-10a, AC-15)', async () => {
    const frozen = () => assemblyRepositoryDouble('draft-frozen');

    await expect(
      commandsWith({ assemblyRepository: frozen() }).addLink.execute(
        currentUser,
        draftId,
        lineId,
        { customerOrderId, statedQuantity: 1 },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN });

    await expect(
      commandsWith({ assemblyRepository: frozen() }).reviseLink.execute(
        currentUser,
        draftId,
        linkId,
        1,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN });

    await expect(
      commandsWith({ assemblyRepository: frozen() }).removeLink.execute(
        currentUser,
        draftId,
        linkId,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN });
  });
});

describe('RevisePurchaseDraftCommand (AC-10a, AC-15)', () => {
  // AC-10a — only the halves the member stated are forwarded, so an absent key cannot be written
  // as `NULL` and clear an Expected Arrival Date the member never touched. An explicit `null` is
  // the member clearing it and is forwarded as such.
  it.each([
    ['a stated date', { expectedArrivalDate: '2026-09-30' }],
    ['an explicit clear', { expectedArrivalDate: null }],
    ['nothing stated at all', {}],
  ])('forwards %s exactly as stated', async (_case, changes) => {
    const assemblyRepository = assemblyRepositoryDouble();

    await commandsWith({ assemblyRepository }).revise.execute(
      currentUser,
      draftId,
      changes,
    );

    expect(assemblyRepository.updateDraft).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      changes,
    );
  });

  it('refuses the write against a frozen draft (AC-10a, AC-15)', async () => {
    const rejection = commandsWith({
      assemblyRepository: assemblyRepositoryDouble('draft-frozen'),
    }).revise.execute(currentUser, draftId, {
      expectedArrivalDate: '2026-09-30',
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN,
    });
  });
});

// The security half of AC-11, at the level a command can prove it: a draft id is not authority.
// Every assembly write forwards the **acting Warehouse** alongside the draft id, because that pair
// — not the id alone — is what the repository's guarded `WHERE` clause resolves. Without it a
// member holding `PURCHASE_DRAFTS:UPDATE` in one Warehouse who learned a draft id from another
// would write that draft (spec.md §6.1 "Cross-Warehouse demand reach"). The persistence half — that
// the pair really is in the `WHERE` clause, and that a foreign draft therefore affects zero rows —
// is proven in `shared/domain/repositories/purchase-draft-assembly.repository.integration.spec.ts`.
describe('the assembly writes scope every draft to the acting Warehouse (AC-11)', () => {
  it('names the acting Warehouse on every draft-scoped write', async () => {
    const assemblyRepository = assemblyRepositoryDouble();
    const commands = commandsWith({ assemblyRepository });
    const scope = { purchaseDraftId: draftId, warehouseId };

    await commands.revise.execute(currentUser, draftId, {
      expectedArrivalDate: '2026-09-30',
    });
    await commands.addLine.execute(currentUser, draftId, {
      itemId,
      orderedQuantity: 10,
    });
    await commands.reviseLine.execute(currentUser, draftId, lineId, {
      orderedQuantity: 11,
    });
    await commands.removeLine.execute(currentUser, draftId, lineId);
    await commands.addLink.execute(currentUser, draftId, lineId, {
      customerOrderId,
      statedQuantity: 12,
    });
    await commands.reviseLink.execute(currentUser, draftId, linkId, 13);
    await commands.removeLink.execute(currentUser, draftId, linkId);

    expect(assemblyRepository.updateDraft).toHaveBeenCalledWith(
      scope,
      expect.anything(),
    );
    expect(assemblyRepository.addLine).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseDraftId: draftId, warehouseId }),
    );
    expect(assemblyRepository.updateLine).toHaveBeenCalledWith(
      scope,
      lineId,
      expect.anything(),
    );
    expect(assemblyRepository.removeLine).toHaveBeenCalledWith(scope, lineId);
    expect(assemblyRepository.addLink).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseDraftId: draftId, warehouseId }),
    );
    expect(assemblyRepository.updateLink).toHaveBeenCalledWith(
      scope,
      linkId,
      13,
    );
    expect(assemblyRepository.removeLink).toHaveBeenCalledWith(scope, linkId);
  });

  // A draft the acting Warehouse does not hold resolves to nothing, so the repository reports
  // `target-missing` and the member sees the 404 a draft id that names nothing produces — never the
  // 409 that would confirm the draft exists somewhere (openapi.yaml `PurchaseDraftUnavailable` /
  // `PurchaseDraftTargetUnavailable`).
  it('refuses every draft-scoped write against a draft of another Warehouse, indistinguishably from a missing one', async () => {
    const foreign = () => assemblyRepositoryDouble('target-missing');

    await expect(
      commandsWith({ assemblyRepository: foreign() }).revise.execute(
        currentUser,
        draftId,
        { expectedArrivalDate: '2026-09-30' },
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });

    await expect(
      commandsWith({ assemblyRepository: foreign() }).addLine.execute(
        currentUser,
        draftId,
        { itemId, orderedQuantity: 10 },
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });

    await expect(
      commandsWith({ assemblyRepository: foreign() }).reviseLine.execute(
        currentUser,
        draftId,
        lineId,
        { orderedQuantity: 1 },
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });

    await expect(
      commandsWith({ assemblyRepository: foreign() }).removeLine.execute(
        currentUser,
        draftId,
        lineId,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });

    await expect(
      commandsWith({ assemblyRepository: foreign() }).reviseLink.execute(
        currentUser,
        draftId,
        linkId,
        1,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });

    await expect(
      commandsWith({ assemblyRepository: foreign() }).removeLink.execute(
        currentUser,
        draftId,
        linkId,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
  });
});

// AC-06d — "stops offering it when demand is recorded **and when a draft is assembled**". The
// customer-order path already refuses a deactivated Item when demand is recorded; every draft path
// that records a *new* reference to an Item now refuses it on the same terms and with the same
// non-enumerating outcome.
describe('a deactivated Item may not be put on a draft line (AC-06d)', () => {
  const deactivated = () =>
    itemCatalogueRepositoryDouble({
      id: itemId,
      warehouseId,
      deactivatedAt: new Date('2026-08-20T09:00:00.000Z'),
    });

  it('refuses a deactivated Item on a draft composed in one submission, and never attempts the write', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({
      assemblyRepository,
      itemCatalogueRepository: deactivated(),
    }).create.execute(currentUser, { lines: [baseLine] });

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(assemblyRepository.createDraft).not.toHaveBeenCalled();
  });

  it('refuses a deactivated Item on a line added to an existing draft', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({
      assemblyRepository,
      itemCatalogueRepository: deactivated(),
    }).addLine.execute(currentUser, draftId, { itemId, orderedQuantity: 10 });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(assemblyRepository.addLine).not.toHaveBeenCalled();
  });

  it('refuses a line revised to name a deactivated Item', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = commandsWith({
      assemblyRepository,
      itemCatalogueRepository: deactivated(),
    }).reviseLine.execute(currentUser, draftId, lineId, { itemId });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
    });
    expect(assemblyRepository.updateLine).not.toHaveBeenCalled();
  });

  // AC-06d — deactivation "keeps every Customer Order and Purchase Draft Line that already names it
  // readable and counting exactly as before". A line whose Item was deactivated after it was
  // composed is still fully editable, as long as the member is not naming that Item afresh: the
  // catalogue is not even consulted when `itemId` is left unstated.
  it('still revises a line that already names a deactivated Item when the Item is not restated', async () => {
    const assemblyRepository = assemblyRepositoryDouble();
    const itemCatalogueRepository = deactivated();

    await commandsWith({
      assemblyRepository,
      itemCatalogueRepository,
    }).reviseLine.execute(currentUser, draftId, lineId, {
      orderedQuantity: 200,
      valueAddingNote: 'Bundle in tens',
    });

    expect(itemCatalogueRepository.findById).not.toHaveBeenCalled();
    expect(assemblyRepository.updateLine).toHaveBeenCalledWith(
      { purchaseDraftId: draftId, warehouseId },
      lineId,
      { orderedQuantity: 200, valueAddingNote: 'Bundle in tens' },
    );
  });
});
