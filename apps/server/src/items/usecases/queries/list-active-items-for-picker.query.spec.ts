// T5 (GAP 3, coordinator round) — `items/usecases/queries/list-active-items-for-picker.query.ts`
// does not exist yet. AC-06a is a use-case-level criterion ("the system shows the Items of that
// Warehouse with their SKUs so the member selects an existing one"), exercised from two call sites
// (recording demand, assembling a draft — sad.md §6.2 step 1) that both need the same
// `ITEMS:WATCH`-gated projection, not the raw persistence entity. The repository-level proof in
// `item-catalogue.repository.integration.spec.ts` shows deactivation excludes an Item from
// `findActiveItemsForPicker`; this use-case spec is the thin adapter that scopes the read to the
// acting Warehouse and projects only `id`/`sku`/`description` — the fields AC-06a says the member
// selects from — never `onHandQuantity` or any other detail a picker has no use for.
import { ListActiveItemsForPickerQuery } from 'items/usecases/queries/list-active-items-for-picker.query';
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
  archived: false,
};

const itemCatalogueRepositoryDouble = () =>
  repositoryDouble<ItemCatalogueRepository>()({
    findActiveItemsForPicker: jest.fn().mockResolvedValue([
      {
        id: 'item-1',
        warehouseId,
        sku: 'TEST-SKU-0001',
        description: 'Cable reel, 50m',
        unitOfMeasure: 'each',
        onHandQuantity: 0,
        deactivatedAt: null,
      },
    ]),
  });

describe('ListActiveItemsForPickerQuery', () => {
  // AC-06a — the Items of that Warehouse with their SKUs, scoped to the acting Warehouse.
  it("reads the acting Warehouse's active Items, projecting id, SKU and description for the picker", async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble();
    const query = new ListActiveItemsForPickerQuery(itemCatalogueRepository);

    await expect(query.execute(currentUser)).resolves.toEqual([
      { id: 'item-1', sku: 'TEST-SKU-0001', description: 'Cable reel, 50m' },
    ]);
    expect(
      itemCatalogueRepository.findActiveItemsForPicker,
    ).toHaveBeenCalledWith(warehouseId);
    expect(
      itemCatalogueRepository.findActiveItemsForPicker,
    ).toHaveBeenCalledTimes(1);
  });
});
