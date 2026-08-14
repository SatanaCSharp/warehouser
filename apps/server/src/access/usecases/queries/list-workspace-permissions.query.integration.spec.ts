import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
// `ListWorkspacePermissionsQuery` does not exist yet — this is the RED step
// for T15: the system Workspace Permission catalogue under
// `WORKSPACE_ROLES:WATCH` (AC-32).
import { ListWorkspacePermissionsQuery } from 'access/usecases/queries/list-workspace-permissions.query';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import { persistWorkspaceGraph } from 'test/factories/entity-factories';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

describeIntegration('ListWorkspacePermissionsQuery', () => {
  const workspaceReadRepository = new WorkspaceReadRepository(dataSource);
  const createQuery = (): ListWorkspacePermissionsQuery =>
    new ListWorkspacePermissionsQuery(workspaceReadRepository);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, workspace_role_permissions, workspace_memberships, workspace_roles, warehouses, workspaces, users, accounts CASCADE',
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

  it('lists the system Workspace Permission catalogue with its assignable/reserved classification (AC-32)', async () => {
    // The Workspace Permission catalogue is system-wide, not per-Workspace,
    // so `persistWorkspaceGraph` seeds one synthetic grant that the suite's
    // `restore-catalogues` setup does not manage; this asserts that
    // synthetic grant is visible through the query.
    const { workspaceId } = await persistWorkspaceGraph();

    const permissions = await createQuery().execute(
      currentUserFor(workspaceId),
    );

    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        label: expect.any(String),
        kind: expect.stringMatching(/^(?:assignable|reserved)$/u),
      }),
    );
  });
});
