import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import {
  buildWarehouse,
  buildWarehouseMembership,
  buildWorkspace,
  buildWorkspaceMembership,
  buildWorkspacePermission,
  buildWorkspaceRole,
  persistWorkspaceGraph,
} from 'test/factories/entity-factories';
import { QueryFailedError } from 'typeorm';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-12T12:00:00.000Z');

/**
 * `accounts.user_id` / `users.account_id` form a deferred circular FK pair,
 * so both inserts must run inside one transaction, matching the pattern in
 * every other integration spec under this directory.
 */
const seedIdentity = async (
  userId: string,
  workspaceId: string,
  normalizedEmail: string,
): Promise<void> => {
  await dataSource.transaction(async (manager) => {
    await manager.getRepository(AccountEntity).insert({
      id: userId,
      userId,
      normalizedEmail,
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

const describeColumnMapping = (): void => {
  describe('column mapping against the promoted schema', () => {
    it('persists and reads back a Workspace (unnamed by default via buildWorkspace)', async () => {
      const workspace = buildWorkspace();

      await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
      const found = await dataSource.manager
        .getRepository(WorkspaceEntity)
        .findOneByOrFail({ id: workspace.id });

      expect(found.name).toBeNull();
      expect(found.id).toEqual(workspace.id);
    });

    it('persists and reads back a Workspace Permission (assignable by default via buildWorkspacePermission)', async () => {
      const permission = buildWorkspacePermission({
        id: 'WORKSPACE_ENTITIES_SPEC:WATCH',
      });

      await dataSource.manager
        .getRepository(WorkspacePermissionEntity)
        .insert(permission);
      const found = await dataSource.manager
        .getRepository(WorkspacePermissionEntity)
        .findOneByOrFail({ id: permission.id });

      expect(found.kind).toEqual('assignable');
    });

    it('persists and reads back a custom Workspace Role scoped to its Workspace (buildWorkspaceRole)', async () => {
      const workspace = buildWorkspace();
      await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);

      const role = buildWorkspaceRole({ workspaceId: workspace.id! });
      await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(role);
      const found = await dataSource.manager
        .getRepository(WorkspaceRoleEntity)
        .findOneByOrFail({ id: role.id });

      expect(found).toMatchObject({
        workspaceId: workspace.id,
        kind: 'custom',
      });
    });

    it('persists and reads back a Workspace Role-Permission grant', async () => {
      const workspace = buildWorkspace();
      await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
      const role = buildWorkspaceRole({ workspaceId: workspace.id! });
      await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(role);
      const permission = buildWorkspacePermission({
        id: 'WORKSPACE_ENTITIES_SPEC:GRANT',
      });
      await dataSource.manager
        .getRepository(WorkspacePermissionEntity)
        .insert(permission);

      await dataSource.manager
        .getRepository(WorkspaceRolePermissionEntity)
        .insert({
          workspaceRoleId: role.id,
          workspacePermissionId: permission.id,
          workspaceRoleKind: 'custom',
          workspacePermissionKind: 'assignable',
        });

      const found = await dataSource.manager
        .getRepository(WorkspaceRolePermissionEntity)
        .findOneByOrFail({
          workspaceRoleId: role.id,
          workspacePermissionId: permission.id,
        });

      expect(found.workspaceRoleKind).toEqual('custom');
    });

    it('persists and reads back a Workspace membership keyed by user_id (buildWorkspaceMembership)', async () => {
      const workspace = buildWorkspace();
      await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
      const role = buildWorkspaceRole({ workspaceId: workspace.id! });
      await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(role);
      const userId = '00000000-0000-4000-8000-000000000501';
      await seedIdentity(userId, workspace.id!, 'member.a@example.test');

      const membership = buildWorkspaceMembership({
        userId,
        workspaceId: workspace.id!,
        workspaceRoleId: role.id!,
        workspaceRoleKind: 'custom',
      });
      await dataSource.manager
        .getRepository(WorkspaceMembershipEntity)
        .insert(membership);

      const found = await dataSource.manager
        .getRepository(WorkspaceMembershipEntity)
        .findOneByOrFail({ userId });

      expect(found).toMatchObject({
        workspaceId: workspace.id,
        workspaceRoleId: role.id,
        workspaceRoleKind: 'custom',
      });
    });

    it('persists and reads back the changed UserEntity (non-null workspaceId, nullable activeWarehouseId)', async () => {
      const workspace = buildWorkspace();
      await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
      const userId = '00000000-0000-4000-8000-000000000502';
      await seedIdentity(userId, workspace.id!, 'member.b@example.test');

      const found = await dataSource.manager
        .getRepository(UserEntity)
        .findOneByOrFail({ id: userId });

      expect(found.workspaceId).toEqual(workspace.id);
      expect(found.activeWarehouseId).toBeNull();
    });

    it('persists and reads back the changed WarehouseEntity (non-null workspaceId, nullable archivedAt via buildWarehouse)', async () => {
      const workspace = buildWorkspace();
      await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);

      const warehouse = buildWarehouse({ workspaceId: workspace.id! });
      await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
      const found = await dataSource.manager
        .getRepository(WarehouseEntity)
        .findOneByOrFail({ id: warehouse.id });

      expect(found.workspaceId).toEqual(workspace.id);
      expect(found.archivedAt).toBeNull();
    });

    it('persists and reads back the re-keyed WarehouseMembershipEntity (composite key by User and Warehouse, carrying workspaceId via buildWarehouseMembership)', async () => {
      const workspace = buildWorkspace();
      await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
      const warehouse = buildWarehouse({ workspaceId: workspace.id! });
      await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
      const role = {
        id: '00000000-0000-4000-8000-000000000601',
        warehouseId: warehouse.id!,
        name: 'Custom Role',
        kind: 'custom' as const,
        createdAt: now,
        updatedAt: now,
      };
      await dataSource.manager.getRepository(RoleEntity).insert(role);
      const userId = '00000000-0000-4000-8000-000000000503';
      await seedIdentity(userId, workspace.id!, 'member.c@example.test');

      const membership = buildWarehouseMembership({
        userId,
        warehouseId: warehouse.id!,
        workspaceId: workspace.id!,
        roleId: role.id,
      });
      await dataSource.manager
        .getRepository(WarehouseMembershipEntity)
        .insert(membership);

      const found = await dataSource.manager
        .getRepository(WarehouseMembershipEntity)
        .findOneByOrFail({ userId, warehouseId: warehouse.id! });

      expect(found).toMatchObject({
        userId,
        warehouseId: warehouse.id,
        workspaceId: workspace.id,
      });
    });
  });
};

const describeCompositeReferences = (): void => {
  describe('composite references reject cross-scope assignments', () => {
    it('rejects a Workspace membership whose Workspace Role belongs to another Workspace', async () => {
      const workspaceA = buildWorkspace();
      const workspaceB = buildWorkspace();
      await dataSource.manager
        .getRepository(WorkspaceEntity)
        .insert([workspaceA, workspaceB]);
      // Role lives in Workspace B, but the membership below claims Workspace A.
      const foreignRole = buildWorkspaceRole({ workspaceId: workspaceB.id! });
      await dataSource.manager
        .getRepository(WorkspaceRoleEntity)
        .insert(foreignRole);
      const userId = '00000000-0000-4000-8000-000000000504';
      await seedIdentity(userId, workspaceA.id!, 'member.d@example.test');

      await expect(
        dataSource.manager.getRepository(WorkspaceMembershipEntity).insert(
          buildWorkspaceMembership({
            userId,
            workspaceId: workspaceA.id!,
            workspaceRoleId: foreignRole.id!,
            workspaceRoleKind: 'custom',
          }),
        ),
      ).rejects.toThrow(QueryFailedError);
    });

    it('rejects a Warehouse membership whose Role belongs to another Warehouse', async () => {
      const workspace = buildWorkspace();
      await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
      const warehouseA = buildWarehouse({ workspaceId: workspace.id! });
      const warehouseB = buildWarehouse({ workspaceId: workspace.id! });
      await dataSource.manager
        .getRepository(WarehouseEntity)
        .insert([warehouseA, warehouseB]);
      // Role lives in Warehouse B, but the membership below claims Warehouse A.
      const foreignRole = {
        id: '00000000-0000-4000-8000-000000000602',
        warehouseId: warehouseB.id!,
        name: 'Foreign Role',
        kind: 'custom' as const,
        createdAt: now,
        updatedAt: now,
      };
      await dataSource.manager.getRepository(RoleEntity).insert(foreignRole);
      const userId = '00000000-0000-4000-8000-000000000505';
      await seedIdentity(userId, workspace.id!, 'member.e@example.test');

      await expect(
        dataSource.manager.getRepository(WarehouseMembershipEntity).insert(
          buildWarehouseMembership({
            userId,
            warehouseId: warehouseA.id!,
            workspaceId: workspace.id!,
            roleId: foreignRole.id,
          }),
        ),
      ).rejects.toThrow(QueryFailedError);
    });
  });
};

const describePersistWorkspaceGraph = (): void => {
  describe('persistWorkspaceGraph', () => {
    it('produces a Workspace, its Owner Role and grants, two Warehouses (one archived), their Roles, and memberships for several Users', async () => {
      const graph = await persistWorkspaceGraph();

      expect(graph.workspaceId).toEqual(expect.any(String));

      const [{ count: workspaceCount }] = await dataSource.query<
        { count: number }[]
      >('SELECT count(*)::int AS count FROM workspaces WHERE id = $1', [
        graph.workspaceId,
      ]);
      expect(workspaceCount).toEqual(1);

      const ownerRoleRows = await dataSource.query<{ id: string }[]>(
        "SELECT id FROM workspace_roles WHERE workspace_id = $1 AND kind = 'workspace_owner'",
        [graph.workspaceId],
      );
      expect(ownerRoleRows).toHaveLength(1);

      const grantRows = await dataSource.query<
        { workspace_permission_id: string }[]
      >(
        'SELECT workspace_permission_id FROM workspace_role_permissions WHERE workspace_role_id = $1',
        [ownerRoleRows[0].id],
      );
      expect(grantRows.length).toBeGreaterThan(0);

      const warehouseRows = await dataSource.query<
        { id: string; archived_at: Date | null }[]
      >(
        'SELECT id, archived_at FROM warehouses WHERE workspace_id = $1 ORDER BY archived_at NULLS FIRST',
        [graph.workspaceId],
      );
      expect(warehouseRows).toHaveLength(2);
      expect(
        warehouseRows.filter((row) => row.archived_at !== null),
      ).toHaveLength(1);
      expect(
        warehouseRows.filter((row) => row.archived_at === null),
      ).toHaveLength(1);

      const roleRows = await dataSource.query<{ id: string }[]>(
        'SELECT id FROM roles WHERE warehouse_id = ANY($1::uuid[])',
        [warehouseRows.map((row) => row.id)],
      );
      expect(roleRows.length).toBeGreaterThanOrEqual(2);

      const membershipRows = await dataSource.query<{ user_id: string }[]>(
        'SELECT DISTINCT user_id FROM warehouse_memberships WHERE workspace_id = $1',
        [graph.workspaceId],
      );
      expect(membershipRows.length).toBeGreaterThanOrEqual(3);

      const userRows = await dataSource.query<{ normalized_email: string }[]>(
        'SELECT normalized_email FROM accounts JOIN users ON users.id = accounts.user_id WHERE users.workspace_id = $1',
        [graph.workspaceId],
      );
      for (const row of userRows) {
        expect(row.normalized_email).toMatch(/@example\.test$/u);
      }
    });

    it('is usable inside a caller-owned transaction and rolls back with it', async () => {
      let capturedWorkspaceId = '';

      await expect(
        dataSource.transaction(async (manager) => {
          const graph = await persistWorkspaceGraph({}, manager);
          capturedWorkspaceId = graph.workspaceId;
          throw new Error(
            'force rollback to prove the caller owns the transaction',
          );
        }),
      ).rejects.toThrow('force rollback');

      const [{ count }] = await dataSource.query<{ count: number }[]>(
        'SELECT count(*)::int AS count FROM workspaces WHERE id = $1',
        [capturedWorkspaceId],
      );
      expect(count).toEqual(0);
    });
  });
};

describeIntegration('Workspace persistence entities and factories', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE workspace_memberships, workspace_role_permissions, workspace_roles, workspace_permissions, workspaces, warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describeColumnMapping();
  describeCompositeReferences();
  describePersistWorkspaceGraph();
});
