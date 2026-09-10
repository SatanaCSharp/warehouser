import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
// AC-23a — the narrow read carried by `WAREHOUSE_MEMBERSHIPS:ASSIGN`, per
// spec.md §5 and sad.md §6.6. It delegates to
// `WarehouseMembershipAssignmentRepository.readAssignableRoles` (T11), which
// projects to `id, name` in SQL and excludes the protected Warehouse Manager
// Role. The query resolves the named Warehouse *before* projecting, because
// contracts/openapi.yaml documents `404 workspace.target_unavailable` for a
// Warehouse of another Workspace — an empty `200 []` is a different outcome
// and cannot be told apart from an own Warehouse that simply has no custom
// Role yet (T51 / review S1-02).
import { ListAssignableWarehouseRolesQuery } from 'access/usecases/queries/list-assignable-warehouse-roles.query';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository';
import {
  buildWarehouse,
  buildWorkspace,
} from 'test/factories/entity-factories';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

interface ListAssignableWarehouseRolesInput {
  readonly warehouseId: string;
}
interface AssignableRoleProjection {
  readonly id: string;
  readonly name: string;
}
interface ListAssignableWarehouseRolesQueryContract {
  execute(
    currentUser: WorkspaceCurrentUser,
    input: ListAssignableWarehouseRolesInput,
  ): Promise<AssignableRoleProjection[]>;
}

describe('ListAssignableWarehouseRolesQuery', () => {
  const warehouseMembershipAssignmentRepository =
    new WarehouseMembershipAssignmentRepository(dataSource);

  const createQuery = (): ListAssignableWarehouseRolesQueryContract =>
    new ListAssignableWarehouseRolesQuery(
      warehouseMembershipAssignmentRepository,
    );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, roles, warehouses, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const seedWorkspace = async (): Promise<string> => {
    const workspace = buildWorkspace();
    await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
    return workspace.id as string;
  };

  const seedWarehouse = async (workspaceId: string): Promise<string> => {
    const warehouse = buildWarehouse({ workspaceId });
    await dataSource.manager.getRepository(WarehouseEntity).insert(warehouse);
    return warehouse.id as string;
  };

  const principal = (workspaceId: string): WorkspaceCurrentUser => ({
    userId: randomUUID(),
    workspaceId,
    workspaceRoleId: randomUUID(),
    workspaceRoleKind: 'custom',
    permissionId: WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
  });

  it('AC-23a: returns only id and name of the custom Roles of the named Warehouse, excluding the protected Manager Role', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);

    const managerRoleId = randomUUID();
    const pickerRoleId = randomUUID();
    const receiverRoleId = randomUUID();
    await dataSource.manager.getRepository(RoleEntity).insert([
      {
        id: managerRoleId,
        warehouseId,
        name: 'Warehouse Manager',
        kind: 'warehouse_manager',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: pickerRoleId,
        warehouseId,
        name: 'Picker',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: receiverRoleId,
        warehouseId,
        name: 'Receiver',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // A sibling Warehouse of the same Workspace, with its own custom Role —
    // proves the read is narrowed to the named Warehouse, not the whole
    // Workspace.
    const siblingWarehouseId = await seedWarehouse(workspaceId);
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: randomUUID(),
      warehouseId: siblingWarehouseId,
      name: 'Sibling Warehouse Role',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });

    const roles = await createQuery().execute(principal(workspaceId), {
      warehouseId,
    });

    expect(new Set(roles.map((role) => role.id))).toEqual(
      new Set([pickerRoleId, receiverRoleId]),
    );
    expect(roles.some((role) => role.id === managerRoleId)).toBe(false);
    for (const role of roles) {
      expect(Object.keys(role).sort()).toEqual(['id', 'name']);
    }
  });

  it('AC-23a: reports a Warehouse of another Workspace exactly as a missing one, disclosing neither its Roles nor its existence', async () => {
    const ownWorkspaceId = await seedWorkspace();

    const otherWorkspaceId = await seedWorkspace();
    const otherWarehouseId = await seedWarehouse(otherWorkspaceId);
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: randomUUID(),
      warehouseId: otherWarehouseId,
      name: "Another Workspace's Role",
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });

    const crossWorkspace = await createQuery()
      .execute(principal(ownWorkspaceId), { warehouseId: otherWarehouseId })
      .catch((error: unknown) => error);
    const missing = await createQuery()
      .execute(principal(ownWorkspaceId), { warehouseId: randomUUID() })
      .catch((error: unknown) => error);

    expect(crossWorkspace).toBeInstanceOf(ApplicationError);
    expect(crossWorkspace).toMatchObject({
      code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    });
    // The two outcomes must be indistinguishable, or the refusal itself
    // discloses that the other Workspace's Warehouse exists.
    expect(missing).toMatchObject({
      code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    });
  });

  // The refusal above must not swallow the legitimate empty case: an own
  // Warehouse that exists but carries no custom Role still answers `[]`.
  it('AC-23a: returns an empty list for a Warehouse of the actor Workspace that has no custom Role', async () => {
    const workspaceId = await seedWorkspace();
    const warehouseId = await seedWarehouse(workspaceId);
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: randomUUID(),
      warehouseId,
      name: 'Warehouse Manager',
      kind: 'warehouse_manager',
      createdAt: now,
      updatedAt: now,
    });

    const roles = await createQuery().execute(principal(workspaceId), {
      warehouseId,
    });

    expect(roles).toEqual([]);
  });
});
