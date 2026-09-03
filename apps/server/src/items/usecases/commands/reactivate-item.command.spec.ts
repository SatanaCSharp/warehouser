// T5 (GAP 1, coordinator round) — `items/usecases/commands/reactivate-item.command.ts` does not
// exist yet. This is the legitimate RED for AC-06d's "lets the member make it active again" half:
// reactivating a deactivated Item clears `deactivatedAt` (which is exactly the write
// `findActiveItemsForPicker` keys off — proven to return the Item again once cleared in
// `item-catalogue.repository.integration.spec.ts`), and reactivating an already-active Item is
// refused via `canReactivateItem`.
import { ApplicationError } from '@warehouser/shared-types/errors';
import { ReactivateItemCommand } from 'items/usecases/commands/reactivate-item.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { repositoryDouble } from 'test/doubles/repository-double';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const deactivatedItemId = '00000000-0000-4000-8000-000000000101';
const alreadyActiveItemId = '00000000-0000-4000-8000-000000000102';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: 'ITEMS:DEACTIVATE',
  observedPermissionIds: [],
  archived: false,
};

const itemCatalogueRepositoryDouble = (
  item: { id: string; warehouseId: string; deactivatedAt: Date | null } | null,
) =>
  repositoryDouble<ItemCatalogueRepository>()({
    findById: jest.fn().mockResolvedValue(item),
    setDeactivatedAt: jest.fn().mockResolvedValue(undefined),
  });

describe('ReactivateItemCommand', () => {
  // AC-06d — reactivation is the same operation inverted: it clears deactivatedAt, which is the
  // exact condition `findActiveItemsForPicker` filters on, so this is what returns the Item to the
  // picker.
  it('reactivates a deactivated Item by clearing deactivatedAt', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble({
      id: deactivatedItemId,
      warehouseId,
      deactivatedAt: new Date('2026-08-26T00:00:00.000Z'),
    });
    const command = new ReactivateItemCommand(itemCatalogueRepository);

    await command.execute(currentUser, deactivatedItemId);

    expect(itemCatalogueRepository.setDeactivatedAt).toHaveBeenCalledWith(
      deactivatedItemId,
      null,
    );
    expect(itemCatalogueRepository.setDeactivatedAt).toHaveBeenCalledTimes(1);
  });

  // canReactivateItem — reactivating an already-active Item is refused.
  it('refuses to reactivate an already-active Item', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble({
      id: alreadyActiveItemId,
      warehouseId,
      deactivatedAt: null,
    });
    const command = new ReactivateItemCommand(itemCatalogueRepository);

    await expect(
      command.execute(currentUser, alreadyActiveItemId),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(itemCatalogueRepository.setDeactivatedAt).not.toHaveBeenCalled();
  });

  it('refuses to reactivate an Item that does not belong to the acting Warehouse', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble({
      id: deactivatedItemId,
      warehouseId: 'a-different-warehouse',
      deactivatedAt: new Date('2026-08-26T00:00:00.000Z'),
    });
    const command = new ReactivateItemCommand(itemCatalogueRepository);

    await expect(
      command.execute(currentUser, deactivatedItemId),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(itemCatalogueRepository.setDeactivatedAt).not.toHaveBeenCalled();
  });
});
