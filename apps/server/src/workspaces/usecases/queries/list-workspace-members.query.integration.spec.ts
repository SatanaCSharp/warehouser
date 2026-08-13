import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import { persistWorkspaceGraph } from 'test/factories/entity-factories';
// `ListWorkspaceMembersQuery` does not exist yet — this is the RED step for
// T15: Workspace Members with their Workspace Role assignments under
// `WORKSPACE_MEMBERS:WATCH` (AC-33).
import { ListWorkspaceMembersQuery } from 'workspaces/usecases/queries/list-workspace-members.query';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

describeIntegration('ListWorkspaceMembersQuery', () => {
  const workspaceReadRepository = new WorkspaceReadRepository(dataSource);
  const createQuery = (): ListWorkspaceMembersQuery =>
    new ListWorkspaceMembersQuery(workspaceReadRepository);

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
    permissionId: WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
  });

  it("returns exactly the actor's own Workspace's Members with their Workspace Role assignment (AC-33)", async () => {
    const own = await persistWorkspaceGraph();
    const other = await persistWorkspaceGraph();

    const members = await createQuery().execute(
      currentUserFor(own.workspaceId),
    );

    expect(members.map((member) => member.userId).sort()).toEqual(
      [own.ownerUserId].sort(),
    );
    expect(members[0]).toMatchObject({
      userId: own.ownerUserId,
      workspaceRoleId: own.ownerRoleId,
      workspaceRoleKind: 'workspace_owner',
    });
    expect(members.some((member) => member.userId === other.ownerUserId)).toBe(
      false,
    );
  });

  // T46 — contracts/openapi.yaml documents `WorkspaceMember.email` as the
  // identifying email "carried so the reader can tell Workspace Members
  // apart", "present on the same terms as the approved Warehouse member
  // projection" (`AccessReadRepository.listMembersAndAssignments`, which joins
  // `accounts.normalized_email`). It identifies the very Users AC-33 already
  // grants, so it widens the read by nothing.
  it('carries the identifying email of each Workspace Member from the account (T46)', async () => {
    const own = await persistWorkspaceGraph();

    const members = await createQuery().execute(
      currentUserFor(own.workspaceId),
    );

    expect(members[0]?.email).toMatch(/^workspace\.owner\..+@example\.test$/u);
  });
});
