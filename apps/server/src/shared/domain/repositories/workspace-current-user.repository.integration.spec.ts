import dataSource from 'shared/database/data-source.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity.js';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity.js';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity.js';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity.js';
// The repository under test does not exist yet — this is the RED step. The
// implementer creates it in the same location, exposing exactly this shape
// (data-model.md "Repository boundaries"):
//   WorkspaceCurrentUserRepository.resolveRequiredWorkspacePermission(userId, workspacePermissionId)
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository.js';
import {
  buildWorkspace,
  buildWorkspaceMembership,
  buildWorkspacePermission,
  buildWorkspaceRole,
} from 'test/factories/entity-factories.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

describe('WorkspaceCurrentUserRepository', () => {
  const repository = new WorkspaceCurrentUserRepository(dataSource);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, warehouse_memberships, roles, warehouses, sessions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const persistUser = async (workspaceId: string): Promise<string> => {
    const manager = dataSource.manager;
    const userId = crypto.randomUUID();
    // accounts.user_id / users.account_id form a deferred circular FK pair,
    // so both inserts must land inside one transaction (see
    // member-lifecycle.repository.integration.spec.ts for the identical
    // pattern).
    await dataSource.transaction(async (trxManager) => {
      await trxManager.getRepository(AccountEntity).insert({
        id: userId,
        userId,
        normalizedEmail: `member.${userId}@example.test`,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: now,
        updatedAt: now,
      });
      await trxManager.getRepository(UserEntity).insert({
        id: userId,
        accountId: userId,
        workspaceId,
        createdAt: now,
        updatedAt: now,
      });
    });
    void manager;
    return userId;
  };

  const persistWorkspaceWithRole = async (): Promise<{
    workspaceId: string;
    roleId: string;
    grantedPermissionId: string;
    ungrantedPermissionId: string;
  }> => {
    const manager = dataSource.manager;
    const workspace = buildWorkspace();
    await manager.getRepository(WorkspaceEntity).insert(workspace);
    const workspaceId = workspace.id as string;

    const role = buildWorkspaceRole({ workspaceId });
    await manager.getRepository(WorkspaceRoleEntity).insert(role);
    const roleId = role.id as string;

    const grantedPermission = buildWorkspacePermission();
    const ungrantedPermission = buildWorkspacePermission();
    await manager
      .getRepository(WorkspacePermissionEntity)
      .insert([grantedPermission, ungrantedPermission]);

    await manager.getRepository(WorkspaceRolePermissionEntity).insert({
      workspaceRoleId: roleId,
      workspacePermissionId: grantedPermission.id as string,
      workspaceRoleKind: 'custom',
      workspacePermissionKind: grantedPermission.kind as
        'assignable' | 'reserved',
    });

    return {
      workspaceId,
      roleId,
      grantedPermissionId: grantedPermission.id as string,
      ungrantedPermissionId: ungrantedPermission.id as string,
    };
  };

  it('resolves the actor Workspace membership, Role and Role-Permission grant', async () => {
    const { workspaceId, roleId, grantedPermissionId } =
      await persistWorkspaceWithRole();
    const userId = await persistUser(workspaceId);
    await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert(
      buildWorkspaceMembership({
        userId,
        workspaceId,
        workspaceRoleId: roleId,
      }),
    );

    const result = await repository.resolveRequiredWorkspacePermission(
      userId,
      grantedPermissionId,
    );

    expect(result).toMatchObject({
      userId,
      workspaceId,
      workspaceRoleId: roleId,
      permissionId: grantedPermissionId,
      granted: true,
    });
  });

  it('returns nothing for a User with no Workspace membership', async () => {
    const { workspaceId, grantedPermissionId } =
      await persistWorkspaceWithRole();
    const userId = await persistUser(workspaceId);
    // Deliberately no `workspace_memberships` row for this User.

    const result = await repository.resolveRequiredWorkspacePermission(
      userId,
      grantedPermissionId,
    );

    expect(result).toBeNull();
  });

  it('does not return a Warehouse Permission through the Workspace read (AC-31)', async () => {
    const { workspaceId, roleId } = await persistWorkspaceWithRole();
    const userId = await persistUser(workspaceId);
    await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert(
      buildWorkspaceMembership({
        userId,
        workspaceId,
        workspaceRoleId: roleId,
      }),
    );

    // A Warehouse Permission identifier (e.g. WAREHOUSES:WATCH shape) is
    // simply absent from `workspace_permissions`, so it can never be granted
    // by this read — the two catalogues are parallel and never joined
    // (ADR 0002, spec.md AC-31).
    const result = await repository.resolveRequiredWorkspacePermission(
      userId,
      'WAREHOUSES:WATCH',
    );

    expect(result?.granted).not.toBe(true);
  });
});
