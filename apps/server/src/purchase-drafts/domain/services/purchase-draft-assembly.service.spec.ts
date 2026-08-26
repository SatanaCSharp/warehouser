// T12 — `purchase-drafts/domain/services/purchase-draft-assembly.service.ts` does not exist yet.
// This is the legitimate RED for AC-10, AC-11, AC-11a, AC-12 and AC-13 at the rule level, proven
// against controlled repository doubles per server-architecture.md §Testing, so no database is
// involved: what these cases assert is that a refused write is **never attempted**, and that an
// accepted one reaches the repository exactly as the member composed it — unadjusted, per
// AC-11a. The persistence half of the state guard (zero rows affected) is an integration property
// and lives in `shared/domain/repositories/purchase-draft-assembly.repository.integration.spec.ts`.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { PurchaseDraftAssemblyService } from 'purchase-drafts/domain/services/purchase-draft-assembly.service';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';

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
const now = new Date('2026-08-26T10:00:00.000Z');

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: uuid('4'),
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:CREATE',
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
  item: { id: string; warehouseId: string } | null = {
    id: itemId,
    warehouseId,
  },
) => ({ findById: jest.fn().mockResolvedValue(item) });

const customerOrderLifecycleRepositoryDouble = (
  locked: { order: { id: string; warehouseId: string } } | null = {
    order: { id: customerOrderId, warehouseId },
  },
) => ({
  lockOrderWithAllocatedTotal: jest.fn().mockResolvedValue(locked),
});

const packagingTypeCatalogueRepositoryDouble = () => ({
  listPackagingTypes: jest
    .fn()
    .mockResolvedValue(catalogueIds.map((id) => ({ id, label: id }))),
});

const assemblyRepositoryDouble = () => ({
  createDraft: jest
    .fn()
    .mockImplementation((input: { id: string }) =>
      Promise.resolve(storedDraft({ id: input.id })),
    ),
});

const serviceWith = ({
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
} = {}): PurchaseDraftAssemblyService =>
  new PurchaseDraftAssemblyService(
    assemblyRepository,
    itemCatalogueRepository,
    customerOrderLifecycleRepository,
    packagingTypeCatalogueRepository,
    {
      purchaseDraftId: () => draftId,
      purchaseDraftLineId: () => uuid('401'),
      purchaseDraftLineLinkId: () => uuid('501'),
      now: () => now,
    },
  );

const baseLine = {
  itemId,
  orderedQuantity: 150,
};

describe('PurchaseDraftAssemblyService — createDraft (AC-10)', () => {
  it('records a draft in the Draft state with no Expected Arrival Date stated', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const created = await serviceWith({ assemblyRepository }).createDraft(
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

describe('PurchaseDraftAssemblyService — createDraft (AC-11)', () => {
  // AC-11 — a line naming an Item of a different Warehouse is refused, telling the member that a
  // draft, the Items it names and the demand it serves all belong to the same Warehouse.
  it.each([
    [
      'an Item of another Warehouse',
      { id: itemId, warehouseId: otherWarehouseId },
    ],
    ['a missing Item', null],
  ])('refuses %s on the same-Warehouse terms', async (_case, item) => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = serviceWith({
      assemblyRepository,
      itemCatalogueRepository: itemCatalogueRepositoryDouble(item),
    }).createDraft(currentUser, { lines: [baseLine] });

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

    const rejection = serviceWith({
      assemblyRepository,
      customerOrderLifecycleRepository:
        customerOrderLifecycleRepositoryDouble(locked),
    }).createDraft(currentUser, {
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

describe('PurchaseDraftAssemblyService — createDraft (AC-11a)', () => {
  // AC-11a — a second line linking to a Customer Order another line already links to, and links
  // whose quantities do not add up to the line quantity, are both recorded exactly as composed:
  // never blocked, never adjusted, because coverage is the member's decision.
  it('passes overlapping and non-summing link quantities through unadjusted', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await serviceWith({ assemblyRepository }).createDraft(currentUser, {
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

describe('PurchaseDraftAssemblyService — createDraft (AC-12)', () => {
  // AC-12 — each line's Packaging Type and Value-adding Note are recorded separately from every
  // other line's.
  it('records each line’s Pre-receipt Requirement independently of the other', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    await serviceWith({ assemblyRepository }).createDraft(currentUser, {
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

describe('PurchaseDraftAssemblyService — createDraft (AC-13)', () => {
  // AC-13 — a Packaging Type outside the catalogue is refused, naming the four the catalogue
  // offers, read from the catalogue repository rather than hard-coded.
  it('refuses a Packaging Type outside the catalogue, naming every one the catalogue offers', async () => {
    const assemblyRepository = assemblyRepositoryDouble();

    const rejection = serviceWith({ assemblyRepository }).createDraft(
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
        serviceWith({ assemblyRepository }).createDraft(currentUser, {
          lines: [{ ...baseLine, packagingTypeId }],
        }),
      ).resolves.toBeDefined();
      expect(assemblyRepository.createDraft).toHaveBeenCalled();
    }
  });
});
