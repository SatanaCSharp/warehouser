import { randomUUID } from 'node:crypto';

import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
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
// `ListAssignableWarehouseRolesQuery` does not exist yet (T22) — this is the
// RED for AC-23a. Per the task card, spec.md §5 and sad.md §6.6, the
// implementer creates it as the narrow read carried by
// `WAREHOUSE_MEMBERSHIPS:ASSIGN`, delegating to the already-implemented
// `WarehouseMembershipAssignmentRepository.readAssignableRoles` (T11), which
// projects to `id, name` in SQL, excludes the protected Warehouse Manager
// Role, and is constrained to a single Warehouse of `currentUser.workspaceId`
// — so a caller-supplied Warehouse of another Workspace resolves to an empty
// result rather than disclosing that Warehouse's Roles.
import { ListAssignableWarehouseRolesQuery } from 'workspaces/usecases/queries/list-assignable-warehouse-roles.query';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

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

describeIntegration('ListAssignableWarehouseRolesQuery', () => {
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

  it('AC-23a: grants no visibility into the Roles of a Warehouse belonging to another Workspace', async () => {
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

    const roles = await createQuery().execute(principal(ownWorkspaceId), {
      warehouseId: otherWarehouseId,
    });

    expect(roles).toEqual([]);
  });
});
