import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
// `ListWorkspaceRolesQuery` does not exist yet — this is the RED step for
// T15. The implementer creates it in this location per sad.md §5
// ("workspaces/usecases/queries ... Workspace Roles ... under
// WORKSPACE_ROLES:WATCH") over the existing `WorkspaceReadRepository`.
import { ListWorkspaceRolesQuery } from 'access/usecases/queries/list-workspace-roles.query';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import {
  buildWorkspaceRole,
  persistWorkspaceGraph,
} from 'test/factories/entity-factories';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

describeIntegration('ListWorkspaceRolesQuery', () => {
  const workspaceReadRepository = new WorkspaceReadRepository(dataSource);
  const createQuery = (): ListWorkspaceRolesQuery =>
    new ListWorkspaceRolesQuery(workspaceReadRepository);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, warehouses, workspaces, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const currentUserFor = (workspaceId: string): WorkspaceCurrentUser => ({
    userId: '00000000-0000-4000-8000-000000000900',
    workspaceId,
    workspaceRoleId: '00000000-0000-4000-8000-000000000901',
    workspaceRoleKind: 'workspace_owner',
    permissionId: WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
  });

  it("returns exactly the actor's own Workspace Roles, including the protected Owner Role (AC-32)", async () => {
    const own = await persistWorkspaceGraph();
    const custom = buildWorkspaceRole({
      workspaceId: own.workspaceId,
      name: 'Site Administrator',
    });
    await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(custom);

    const other = await persistWorkspaceGraph();
    const otherCustom = buildWorkspaceRole({
      workspaceId: other.workspaceId,
      name: "Other Workspace's Role",
    });
    await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .insert(otherCustom);

    const roles = await createQuery().execute(currentUserFor(own.workspaceId));

    expect(roles.map((role) => role.id).sort()).toEqual(
      [own.ownerRoleId, custom.id as string].sort(),
    );
    expect(roles.some((role) => role.id === otherCustom.id)).toBe(false);
    const ownerRole = roles.find((role) => role.id === own.ownerRoleId);
    expect(ownerRole).toMatchObject({
      kind: 'workspace_owner',
      name: 'Workspace Owner',
    });
  });

  it('includes each Role’s assignable Workspace Permission membership', async () => {
    const own = await persistWorkspaceGraph();
    const custom = buildWorkspaceRole({
      workspaceId: own.workspaceId,
      name: 'Site Administrator',
    });
    await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(custom);
    const grant = {
      id: 'WAREHOUSES:WATCH',
      label: 'Watch Warehouses',
      kind: 'assignable' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await dataSource.manager
      .getRepository(WorkspacePermissionEntity)
      .upsert(grant, ['id']);
    await dataSource.manager
      .getRepository(WorkspaceRolePermissionEntity)
      .insert({
        workspaceRoleId: custom.id as string,
        workspacePermissionId: grant.id,
        workspaceRoleKind: 'custom',
        workspacePermissionKind: 'assignable',
      });

    const roles = await createQuery().execute(currentUserFor(own.workspaceId));

    const customRole = roles.find((role) => role.id === custom.id);
    expect(customRole?.permissionIds).toContain('WAREHOUSES:WATCH');
  });

  it('does not gate on the permission carried by the principal — that is the transport guard’s responsibility', async () => {
    const own = await persistWorkspaceGraph();

    const roles = await createQuery().execute({
      ...currentUserFor(own.workspaceId),
      permissionId: WorkspacePermissionId.WAREHOUSES_WATCH,
    });

    expect(roles.some((role) => role.id === own.ownerRoleId)).toBe(true);
  });
});
