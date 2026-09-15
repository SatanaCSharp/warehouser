import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import { persistWorkspaceGraph } from 'test/factories/entity-factories';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
// `ListWorkspaceWarehousesQuery` does not exist yet — this is the RED step
// for T15: the Workspace's Warehouses with archived state, under
// `WAREHOUSES:WATCH` (AC-33).
import { ListWorkspaceWarehousesQuery } from 'warehouses/usecases/queries/list-workspace-warehouses.query';

describe('ListWorkspaceWarehousesQuery', () => {
  const workspaceReadRepository = new WorkspaceReadRepository(dataSource);
  const createQuery = (): ListWorkspaceWarehousesQuery =>
    new ListWorkspaceWarehousesQuery(workspaceReadRepository);

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
    permissionId: WorkspacePermissionId.WAREHOUSES_WATCH,
  });

  it("returns exactly the actor's own Workspace's Warehouses with archived state (AC-33)", async () => {
    const own = await persistWorkspaceGraph();
    const other = await persistWorkspaceGraph();

    const warehouses = await createQuery().execute(
      currentUserFor(own.workspaceId),
    );

    expect(warehouses.map((warehouse) => warehouse.id).sort()).toEqual(
      [own.activeWarehouseId, own.archivedWarehouseId].sort(),
    );
    expect(
      warehouses.some((warehouse) => warehouse.id === other.activeWarehouseId),
    ).toBe(false);

    const active = warehouses.find(
      (warehouse) => warehouse.id === own.activeWarehouseId,
    );
    const archived = warehouses.find(
      (warehouse) => warehouse.id === own.archivedWarehouseId,
    );
    expect(active?.archivedAt).toBeNull();
    expect(archived?.archivedAt).not.toBeNull();
  });
});
