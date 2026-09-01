import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
// `ListWorkspaceUsersQuery` does not exist yet — this is the RED step for
// T15: the other Users of the Workspace with the Warehouses each belongs
// to, under `WORKSPACE_MEMBERS:WATCH` (AC-33), so the candidates that
// Workspace membership and Warehouse-membership assignment act on can be
// found — narrowed to `warehouseIds` only, never a Warehouse Role.
import { ListWorkspaceUsersQuery } from 'access/usecases/queries/list-workspace-users.query';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import { persistWorkspaceGraph } from 'test/factories/entity-factories';

describe('ListWorkspaceUsersQuery', () => {
  const workspaceReadRepository = new WorkspaceReadRepository(dataSource);
  const createQuery = (): ListWorkspaceUsersQuery =>
    new ListWorkspaceUsersQuery(workspaceReadRepository);

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

  it("returns every User of the actor's own Workspace — Workspace Member or not — with the Warehouses each belongs to (AC-33)", async () => {
    const own = await persistWorkspaceGraph();
    const other = await persistWorkspaceGraph();

    const users = await createQuery().execute(currentUserFor(own.workspaceId));

    const userIds = users.map((user) => user.userId).sort();
    // `own.memberUserId` is a Warehouse member but never made a Workspace
    // Member by `persistWorkspaceGraph` (only `ownerUserId` is), so its
    // presence proves the read is not limited to existing Workspace
    // Members (AC-33's "not only the Users who are already Workspace
    // Members").
    expect(userIds).toEqual(
      [
        own.ownerUserId,
        own.memberUserId,
        own.archivedWarehouseManagerUserId,
      ].sort(),
    );
    expect(users.some((user) => user.userId === other.ownerUserId)).toBe(false);

    const ownerRow = users.find((user) => user.userId === own.ownerUserId);
    expect(ownerRow?.warehouseIds).toEqual([own.activeWarehouseId]);
  });

  it('exposes the Warehouses a User belongs to but no Warehouse Role', async () => {
    const own = await persistWorkspaceGraph();

    const users = await createQuery().execute(currentUserFor(own.workspaceId));

    for (const user of users) {
      // The exhaustive key set is the assertion that matters: AC-33 grants the
      // Users, the Warehouses each belongs to, whether each is already a
      // Workspace Member (AC-21) and — since T46 — the identifying email, and
      // deliberately **not** a Warehouse Role. Any `roleId`/`roleKind` leaking
      // into the projection fails here.
      expect(Object.keys(user).sort()).toEqual([
        'email',
        'isWorkspaceMember',
        'userId',
        'warehouseIds',
      ]);
      for (const warehouseId of user.warehouseIds) {
        expect(typeof warehouseId).toBe('string');
      }
    }
  });

  // T46 — `WorkspaceUser.email` of contracts/openapi.yaml, read from
  // `accounts.normalized_email` exactly as the approved Warehouse member
  // projection reads it. AC-33 grants this read so "the candidates that
  // Workspace membership and Warehouse membership assignment act on can be
  // found"; a raw UUID cannot identify a candidate, and the email identifies
  // no User the read does not already return.
  it('carries the identifying email of every User from the account (T46)', async () => {
    const own = await persistWorkspaceGraph();

    const users = await createQuery().execute(currentUserFor(own.workspaceId));

    expect(
      users.find((user) => user.userId === own.ownerUserId)?.email,
    ).toMatch(/^workspace\.owner\..+@example\.test$/u);
    expect(
      users.find((user) => user.userId === own.memberUserId)?.email,
    ).toMatch(/^workspace\.member\..+@example\.test$/u);
  });
});
