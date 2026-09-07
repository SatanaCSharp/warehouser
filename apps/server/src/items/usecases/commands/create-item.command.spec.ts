// T5 — `items/usecases/commands/create-item.command.ts` does not exist yet. This is the legitimate
// RED for AC-07/AC-07a at the use-case level: a duplicate SKU is refused **naming the Item that
// already holds it**, and the same SKU recorded in a second Warehouse is an unrelated Item, proven
// here against a controlled `ItemCatalogueRepository` double (server-architecture.md §Testing —
// "Test use cases with controlled repository doubles"). Mirrors
// `warehouses/usecases/commands/create-warehouse.command.spec.ts`'s repository-double idiom.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { CreateItemCommand } from 'items/usecases/commands/create-item.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { repositoryDouble } from 'test/doubles/repository-double';

const warehouseOneId = '00000000-0000-4000-8000-000000000001';
const warehouseTwoId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000003';
const existingItemId = '00000000-0000-4000-8000-000000000101';

const currentUserOf = (warehouseId: string): AccessCurrentUser => ({
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: 'ITEMS:CREATE',
  observedPermissionIds: [],
  archived: false,
});

// Simulates real per-Warehouse SKU scoping: `findBySku` only reports the existing Item when the
// queried `warehouseId` matches the Warehouse it actually belongs to (AC-07a — a SKU taken in
// another Warehouse is never consulted and stands as an unrelated Item).
const itemCatalogueRepositoryDouble = () =>
  repositoryDouble<ItemCatalogueRepository>()({
    createItem: jest.fn().mockResolvedValue(undefined),
    findBySku: jest.fn((warehouseId: string, sku: string) =>
      Promise.resolve(
        warehouseId === warehouseOneId && sku === 'TEST-SKU-0001'
          ? // Projected to the three fields the command reads off the hit; the
            // rest of `ItemEntity` is irrelevant to the SKU-taken rejection.
            ({
              id: existingItemId,
              warehouseId: warehouseOneId,
              sku: 'TEST-SKU-0001',
            } as ItemEntity)
          : null,
      ),
    ),
  });

describe('CreateItemCommand', () => {
  // AC-07 — creation is blocked and the member is told which Item already holds the SKU.
  it('refuses a duplicate SKU in the same Warehouse, naming the Item that already holds it', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble();
    const command = new CreateItemCommand(itemCatalogueRepository);

    const rejection = command.execute(currentUserOf(warehouseOneId), {
      sku: 'TEST-SKU-0001',
      description: 'Cable reel, 50m',
      unitOfMeasure: 'each',
    });

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.ITEMS_SKU_TAKEN,
      details: { itemId: existingItemId, sku: 'TEST-SKU-0001' },
    });
    expect(itemCatalogueRepository.createItem).not.toHaveBeenCalled();
  });

  // AC-07a — the same SKU in a second Warehouse is recorded as an unrelated Item: never consulted
  // against the first Warehouse's Item, never blocked by it.
  it('records the same SKU as an unrelated Item in a second Warehouse', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble();
    const command = new CreateItemCommand(itemCatalogueRepository);

    await expect(
      command.execute(currentUserOf(warehouseTwoId), {
        sku: 'TEST-SKU-0001',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
      }),
    ).resolves.toMatchObject({ sku: 'TEST-SKU-0001' });

    expect(itemCatalogueRepository.findBySku).toHaveBeenCalledWith(
      warehouseTwoId,
      'TEST-SKU-0001',
    );
    expect(itemCatalogueRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: warehouseTwoId,
        sku: 'TEST-SKU-0001',
      }),
    );
  });

  it('creates an Item active with nothing on hand when its SKU is free in this Warehouse (AC-06)', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble();
    const command = new CreateItemCommand(itemCatalogueRepository);

    await command.execute(currentUserOf(warehouseTwoId), {
      sku: 'TEST-SKU-0002',
      description: 'Cable reel, 100m',
      unitOfMeasure: 'each',
    });

    expect(itemCatalogueRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: warehouseTwoId,
        sku: 'TEST-SKU-0002',
        description: 'Cable reel, 100m',
        unitOfMeasure: 'each',
        onHandQuantity: 0,
        deactivatedAt: null,
      }),
    );
  });
});
