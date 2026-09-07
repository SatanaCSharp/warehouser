// T5 (GAP 2, coordinator round) — `items/usecases/queries/list-warehouse-items.query.ts` does not
// exist yet. Task brief §What: "the Item queries: the Warehouse's Items with on-hand and the latest
// adjustment reason". The `item_stock_adjustments` table and `ItemStockAdjustmentEntity` already
// exist (migration `1786600000000-CreateOrderingSchema`), so this read is writable in T5; only the
// write path that creates adjustment rows is T6/T7. The repository-level efficiency proof (one
// query, no N+1 across Items) lives in `item-catalogue.repository.integration.spec.ts`; this spec
// is the thin use-case adapter scoping the read to the acting Warehouse.
import { ListWarehouseItemsQuery } from 'items/usecases/queries/list-warehouse-items.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { repositoryDouble } from 'test/doubles/repository-double';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: 'ITEMS:WATCH',
  observedPermissionIds: [],
  archived: false,
};

const itemCatalogueRepositoryDouble = () =>
  repositoryDouble<ItemCatalogueRepository>()({
    findItemsWithOnHandAndLatestReason: jest.fn().mockResolvedValue([
      {
        id: 'item-1',
        warehouseId,
        sku: 'TEST-SKU-0001',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
        onHandQuantity: 12,
        deactivatedAt: null,
        latestAdjustmentReason: 'Cycle count',
      },
      {
        id: 'item-2',
        warehouseId,
        sku: 'TEST-SKU-0002',
        description: 'Cable reel, 100m',
        unitOfMeasure: 'each',
        onHandQuantity: 0,
        deactivatedAt: null,
        latestAdjustmentReason: null,
      },
    ]),
  });

describe('ListWarehouseItemsQuery', () => {
  it("reads the acting Warehouse's Items with their on-hand figure and latest adjustment reason", async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble();
    const query = new ListWarehouseItemsQuery(itemCatalogueRepository);

    await expect(query.execute(currentUser)).resolves.toEqual([
      {
        id: 'item-1',
        sku: 'TEST-SKU-0001',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
        onHandQuantity: 12,
        active: true,
        latestAdjustmentReason: 'Cycle count',
      },
      {
        id: 'item-2',
        sku: 'TEST-SKU-0002',
        description: 'Cable reel, 100m',
        unitOfMeasure: 'each',
        onHandQuantity: 0,
        active: true,
        latestAdjustmentReason: null,
      },
    ]);
    expect(
      itemCatalogueRepository.findItemsWithOnHandAndLatestReason,
    ).toHaveBeenCalledWith(warehouseId);
    expect(
      itemCatalogueRepository.findItemsWithOnHandAndLatestReason,
    ).toHaveBeenCalledTimes(1);
  });
});
