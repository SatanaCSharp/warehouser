import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
// `AccessProvisioningRepository` exists today, but its old shape inserts a
// `warehouses` row itself and its `managerMembership` input carries no
// `workspaceId` (T12/sad.md §4: Warehouse-row creation moves out of
// `access`; `access` receives a `warehouseId` + `userId` it does not create
// and learns the owning Workspace only by reading the Warehouse it is
// handed). This spec is written against the *target* shape, so it is RED
// against the current production type until the implementer reshapes it.
import {
  AccessProvisioningRepository,
  type InitialAccessPersistenceInput,
} from 'shared/domain/repositories/access-provisioning.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';

const now = new Date('2026-08-12T12:00:00.000Z');

const seedIdentity = async (
  userId: string,
  workspaceId: string,
): Promise<void> => {
  await dataSource.transaction(async (manager) => {
    await manager.getRepository(AccountEntity).insert({
      id: userId,
      userId,
      normalizedEmail: `member.${userId}@example.test`,
      passwordHash: 'synthetic-hash',
      passwordHashAlgorithm: 'scrypt',
      passwordHashParameters: { cost: 1_024 },
      createdAt: now,
      updatedAt: now,
    });
    await manager.getRepository(UserEntity).insert({
      id: userId,
      accountId: userId,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    });
  });
};

const seedWorkspaceAndWarehouse = async (): Promise<{
  workspaceId: string;
  warehouseId: string;
}> => {
  const manager = dataSource.manager;
  const workspace = buildWorkspace();
  await manager.getRepository(WorkspaceEntity).insert(workspace);
  const workspaceId = workspace.id as string;

  const warehouse = buildWarehouse({ workspaceId });
  await manager.getRepository(WarehouseEntity).insert(warehouse);

  return { workspaceId, warehouseId: warehouse.id as string };
};

describe('AccessProvisioningRepository', () => {
  const repository = new AccessProvisioningRepository(dataSource);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, permissions, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('provisionInitialAccess', () => {
    it('creates no `warehouses` row and works against the Warehouse the caller supplies', async () => {
      const { workspaceId, warehouseId } = await seedWorkspaceAndWarehouse();
      const userId = crypto.randomUUID();
      await seedIdentity(userId, workspaceId);
      const roleId = crypto.randomUUID();
      const permissionId = 'ROLES:ASSIGN';
      await dataSource.manager.getRepository(PermissionEntity).upsert(
        {
          id: permissionId,
          label: 'Assign a Role',
          kind: 'assignable',
          createdAt: now,
          updatedAt: now,
        },
        ['id'],
      );

      const warehouseCountBefore = await dataSource.manager
        .getRepository(WarehouseEntity)
        .count();

      const input: InitialAccessPersistenceInput = {
        warehouseId,
        userId,
        managerRole: {
          id: roleId,
          warehouseId,
          name: 'Warehouse Manager',
          kind: 'warehouse_manager',
        },
        permissionIds: [permissionId],
      };
      await repository.provisionInitialAccess(input);

      const warehouseCountAfter = await dataSource.manager
        .getRepository(WarehouseEntity)
        .count();
      expect(warehouseCountAfter).toBe(warehouseCountBefore);

      const role = await dataSource.manager
        .getRepository(RoleEntity)
        .findOneBy({ id: roleId });
      expect(role).toMatchObject({
        id: roleId,
        warehouseId,
        kind: 'warehouse_manager',
      });

      const grant = await dataSource.manager
        .getRepository(RolePermissionEntity)
        .findOneBy({ roleId, permissionId });
      expect(grant).toMatchObject({ roleId, permissionId });

      // The membership must carry `workspace_id`, derived from the
      // caller-supplied Warehouse's own Workspace — `access` is handed the
      // `workspaceId` implicitly through the Warehouse row, never told it
      // directly (sad.md §4: "access learns nothing about Workspaces beyond
      // storing the workspace_id it is handed").
      const membership = await dataSource.manager
        .getRepository(WarehouseMembershipEntity)
        .findOneBy({ userId, warehouseId });
      expect(membership).toMatchObject({
        userId,
        warehouseId,
        workspaceId,
        roleId,
        roleKind: 'warehouse_manager',
      });
    });
  });
});
