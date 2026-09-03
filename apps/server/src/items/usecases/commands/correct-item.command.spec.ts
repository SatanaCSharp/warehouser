// T5 — `items/usecases/commands/correct-item.command.ts` does not exist yet. This is the legitimate
// RED for AC-06b/AC-06c at the use-case level, against a controlled `ItemCatalogueRepository`
// double: a named Item's SKU change is refused, while an unnamed Item's SKU is still correctable to
// one unused in that Warehouse, and description/Unit of Measure corrections are always accepted.
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { CorrectItemCommand } from 'items/usecases/commands/correct-item.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { repositoryDouble } from 'test/doubles/repository-double';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const namedItemId = '00000000-0000-4000-8000-000000000101';
const unnamedItemId = '00000000-0000-4000-8000-000000000102';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: 'ITEMS:UPDATE',
  observedPermissionIds: [],
  archived: false,
};

const itemCatalogueRepositoryDouble = (
  isNamed: boolean,
  item: { id: string; warehouseId: string } = {
    id: namedItemId,
    warehouseId,
  },
) =>
  repositoryDouble<ItemCatalogueRepository>()({
    findById: jest.fn().mockResolvedValue(item),
    isNamedByDemandOrDraft: jest.fn().mockResolvedValue(isNamed),
    findBySku: jest.fn().mockResolvedValue(null),
    updateSku: jest.fn().mockResolvedValue(undefined),
    updateItemDetails: jest.fn().mockResolvedValue(undefined),
  });

describe('CorrectItemCommand', () => {
  // AC-03/openapi.yaml `ItemUnavailable` — an Item of another Warehouse is refused exactly as a
  // missing one, disclosing nothing about where it exists. T7 (items HTTP contract) needs this at
  // the use-case level so the REST handler's 404 never depends on a look-aside check of its own.
  it('refuses an Item of another Warehouse the same non-enumerating way as a missing one', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble(false, {
      id: namedItemId,
      warehouseId: 'some-other-warehouse',
    });
    const command = new CorrectItemCommand(itemCatalogueRepository);

    const rejection = command.execute(currentUser, namedItemId, {
      description: 'New description',
    });

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.ITEMS_TARGET_UNAVAILABLE,
    });
    expect(itemCatalogueRepository.updateItemDetails).not.toHaveBeenCalled();
  });

  it('refuses a missing Item the same way', async () => {
    const itemCatalogueRepository = {
      ...itemCatalogueRepositoryDouble(false),
      findById: jest.fn().mockResolvedValue(null),
    };
    const command = new CorrectItemCommand(itemCatalogueRepository as never);

    const rejection = command.execute(currentUser, namedItemId, {
      description: 'New description',
    });

    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.ITEMS_TARGET_UNAVAILABLE,
    });
  });

  // AC-06c — a SKU stops being correctable once demand or a draft names the Item.
  it('refuses a SKU change on an Item that a Customer Order or a Purchase Draft Line already names', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble(true);
    const command = new CorrectItemCommand(itemCatalogueRepository);

    const rejection = command.execute(currentUser, namedItemId, {
      sku: 'TEST-SKU-0003',
    });

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.ITEMS_SKU_FIXED,
    });
    expect(itemCatalogueRepository.updateSku).not.toHaveBeenCalled();
  });

  // AC-06c — an Item nothing yet names may still have its SKU corrected to one unused in that
  // Warehouse.
  it('corrects the SKU of an Item nothing yet names, to one unused in that Warehouse', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble(false);
    const command = new CorrectItemCommand(itemCatalogueRepository);

    await command.execute(currentUser, unnamedItemId, {
      sku: 'TEST-SKU-0003',
    });

    expect(itemCatalogueRepository.findBySku).toHaveBeenCalledWith(
      warehouseId,
      'TEST-SKU-0003',
    );
    expect(itemCatalogueRepository.updateSku).toHaveBeenCalledWith(
      unnamedItemId,
      'TEST-SKU-0003',
    );
  });

  // AC-06b — description and Unit of Measure are always correctable, whether or not the Item is
  // already named, and every record naming the Item keeps naming the same Item (nothing about the
  // Item's identity — its id — is touched).
  it('corrects description and Unit of Measure regardless of whether the Item is already named', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble(true);
    const command = new CorrectItemCommand(itemCatalogueRepository);

    await command.execute(currentUser, namedItemId, {
      description: 'Cable reel, 50m, black',
      unitOfMeasure: 'coil',
    });

    expect(itemCatalogueRepository.updateItemDetails).toHaveBeenCalledWith(
      namedItemId,
      { description: 'Cable reel, 50m, black', unitOfMeasure: 'coil' },
    );
    expect(itemCatalogueRepository.updateSku).not.toHaveBeenCalled();
  });
});
