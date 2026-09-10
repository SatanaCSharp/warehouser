// T5 (GAP 1, coordinator round) — `items/usecases/commands/deactivate-item.command.ts` does not
// exist yet. This is the legitimate RED for AC-06d's deactivation half at the use-case level,
// against a controlled `ItemCatalogueRepository` double: deactivating an active Item sets
// `deactivatedAt` (so its SKU stays taken — proven at persistence level in
// `item-catalogue.repository.integration.spec.ts`), deactivating an already-deactivated Item is
// refused via `canDeactivateItem`, and the command's write footprint never touches a Customer Order
// or a Purchase Draft Line — it has no method on this repository double to do so, so "every
// Customer Order and Purchase Draft Line that already names the Item stays readable and counting
// exactly as before" holds by construction of the repository boundary the command is given.
import { ApplicationError } from '@warehouser/shared-types/errors';
import { DeactivateItemCommand } from 'items/usecases/commands/deactivate-item.command';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { ItemCatalogueRepository } from 'shared/domain/repositories/item-catalogue.repository';
import { repositoryDouble } from 'test/doubles/repository-double';
import { describe, expect, it, vi } from 'vitest';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const activeItemId = '00000000-0000-4000-8000-000000000101';
const alreadyDeactivatedItemId = '00000000-0000-4000-8000-000000000102';
const deactivatedAt = new Date('2026-08-26T00:00:00.000Z');

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
    findById: vi.fn().mockResolvedValue(item),
    setDeactivatedAt: vi.fn().mockResolvedValue(undefined),
  });

describe('DeactivateItemCommand', () => {
  // AC-06d — deactivating an active Item records it as inactive; its SKU stays taken because
  // deactivation only ever writes `deactivatedAt`, never `sku` (proven separately at the
  // persistence level — the SKU column is untouched by this command's only write call).
  it('deactivates an active Item, writing only deactivatedAt', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble({
      id: activeItemId,
      warehouseId,
      deactivatedAt: null,
    });
    const command = new DeactivateItemCommand(itemCatalogueRepository, {
      now: () => deactivatedAt,
    });

    await command.execute(currentUser, activeItemId);

    expect(itemCatalogueRepository.setDeactivatedAt).toHaveBeenCalledWith(
      activeItemId,
      deactivatedAt,
    );
    expect(itemCatalogueRepository.setDeactivatedAt).toHaveBeenCalledTimes(1);
  });

  // AC-06d/canDeactivateItem — deactivating an already-deactivated Item is refused.
  it('refuses to deactivate an already-deactivated Item', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble({
      id: alreadyDeactivatedItemId,
      warehouseId,
      deactivatedAt,
    });
    const command = new DeactivateItemCommand(itemCatalogueRepository, {
      now: () => deactivatedAt,
    });

    await expect(
      command.execute(currentUser, alreadyDeactivatedItemId),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(itemCatalogueRepository.setDeactivatedAt).not.toHaveBeenCalled();
  });

  // AC-03/AC-23 non-enumerating shape — an Item of a different Warehouse (or one that does not
  // exist) is refused the same way a foreign Item always is (openapi.yaml `ItemUnavailable`).
  it('refuses to deactivate an Item that does not belong to the acting Warehouse', async () => {
    const itemCatalogueRepository = itemCatalogueRepositoryDouble({
      id: activeItemId,
      warehouseId: 'a-different-warehouse',
      deactivatedAt: null,
    });
    const command = new DeactivateItemCommand(itemCatalogueRepository, {
      now: () => deactivatedAt,
    });

    await expect(
      command.execute(currentUser, activeItemId),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(itemCatalogueRepository.setDeactivatedAt).not.toHaveBeenCalled();
  });
});
