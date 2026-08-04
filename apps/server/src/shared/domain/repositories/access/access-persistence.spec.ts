import { randomUUID } from 'node:crypto';

import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccessPrincipalRepository } from 'shared/domain/repositories/access/access-principal.repository';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access/access-provisioning.repository';
import { AccessReadRepository } from 'shared/domain/repositories/access/access-read.repository';
import { ManagerTransferRepository } from 'shared/domain/repositories/access/manager-transfer.repository';
import { RoleLifecycleRepository } from 'shared/domain/repositories/access/role-lifecycle.repository';
import {
  buildPermission,
  buildRole,
  buildWarehouse,
  buildWarehouseMembership,
  persistWarehouseAccessGraph,
} from 'test/factories/access';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

describeIntegration('access persistence', () => {
  const principals = new AccessPrincipalRepository(dataSource);
  const reads = new AccessReadRepository(dataSource);
  const lifecycle = new RoleLifecycleRepository(dataSource);
  const transfers = new ManagerTransferRepository(dataSource);
  const provisioning = new AccessProvisioningRepository(dataSource);
  const transactionContext = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, transactionContext);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('resolves current Warehouse authority from persisted grants', async () => {
    const graph = await persistWarehouseAccessGraph(dataSource);

    await expect(
      principals.resolveRequiredPermission(graph.manager.userId, 'ROLES:WATCH'),
    ).resolves.toEqual({
      userId: graph.manager.userId,
      warehouseId: graph.warehouse.id,
      roleId: graph.managerRole.id,
      roleKind: 'warehouse_manager',
      granted: true,
    });

    await dataSource.query(
      'DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
      [graph.managerRole.id, 'ROLES:WATCH'],
    );

    await expect(
      principals.resolveRequiredPermission(graph.manager.userId, 'ROLES:WATCH'),
    ).resolves.toMatchObject({ granted: false });
  });

  it('returns deterministic bounded reads from only the requested Warehouse', async () => {
    const local = await persistWarehouseAccessGraph(dataSource, {
      warehouse: buildWarehouse({ name: 'Локальний склад' }),
      customRoles: [buildRole({ name: 'Zulu' }), buildRole({ name: 'Alpha' })],
    });
    await persistWarehouseAccessGraph(dataSource, {
      warehouse: buildWarehouse({ name: 'Foreign warehouse' }),
    });

    const roles = await reads.listRolesAndPermissions(local.warehouse.id, 2);
    const members = await reads.listMembersAndAssignments(
      local.warehouse.id,
      10,
    );

    expect(roles).toHaveLength(2);
    expect(roles.map((role) => role.name)).toEqual([
      'Alpha',
      'Warehouse Manager',
    ]);
    expect(roles.every((role) => role.warehouseId === local.warehouse.id)).toBe(
      true,
    );
    expect(
      members.every((member) => member.warehouseId === local.warehouse.id),
    ).toBe(true);
  });

  it('scopes ordinary assignment and atomically replaces an assigned custom Role', async () => {
    const graph = await persistWarehouseAccessGraph(dataSource, {
      customRoles: [
        buildRole({ name: 'Source' }),
        buildRole({ name: 'Target' }),
      ],
    });
    const [source, target] = graph.customRoles;
    const member = graph.members[0];

    await expect(
      lifecycle.assignMemberRole(graph.warehouse.id, member.userId, target.id),
    ).resolves.toBe(true);
    await expect(
      lifecycle.replaceAssignedRole(graph.warehouse.id, target.id, source.id),
    ).resolves.toBe(2);

    await expect(
      dataSource.query(
        'SELECT role_id FROM warehouse_memberships WHERE user_id = $1',
        [member.userId],
      ),
    ).resolves.toEqual([{ role_id: source.id }]);
    await expect(
      lifecycle.assignMemberRole(randomUUID(), member.userId, source.id),
    ).resolves.toBe(false);
  });

  it('joins the caller transaction and rolls provisioning back on failure', async () => {
    const warehouse = buildWarehouse();
    const role = buildRole({
      warehouseId: warehouse.id,
      kind: 'warehouse_manager',
      name: 'Warehouse Manager',
    });
    const member = buildWarehouseMembership({
      warehouseId: warehouse.id,
      roleId: role.id,
      roleKind: role.kind,
    });
    await expect(
      transactions.executeInTransaction({}, () =>
        provisioning.provisionInitialAccess({
          warehouse,
          managerRole: role,
          managerMembership: member,
          permissionIds: [buildPermission({ id: 'ROLES:WATCH' }).id],
        }),
      ),
    ).rejects.toThrow();

    await expect(
      dataSource.query('SELECT id FROM warehouses WHERE id = $1', [
        warehouse.id,
      ]),
    ).resolves.toEqual([]);
  });

  it('transfers the protected manager assignment while retaining exactly one manager', async () => {
    const graph = await persistWarehouseAccessGraph(dataSource, {
      customRoles: [buildRole({ name: 'Former manager' })],
    });
    const recipient = graph.members[0];

    await expect(
      transactions.executeInTransaction({}, () =>
        transfers.transfer({
          warehouseId: graph.warehouse.id,
          currentManagerUserId: graph.manager.userId,
          recipientUserId: recipient.userId,
          formerManagerRoleId: graph.customRoles[0].id,
        }),
      ),
    ).resolves.toBe(true);

    await expect(
      dataSource.query(
        "SELECT user_id FROM warehouse_memberships WHERE warehouse_id = $1 AND role_kind = 'warehouse_manager'",
        [graph.warehouse.id],
      ),
    ).resolves.toEqual([{ user_id: recipient.userId }]);
  });

  it('serializes concurrent manager transfers by locking the Warehouse first', async () => {
    const graph = await persistWarehouseAccessGraph(dataSource, {
      customRoles: [
        buildRole({ name: 'Former manager' }),
        buildRole({ name: 'Recipient A' }),
        buildRole({ name: 'Recipient B' }),
      ],
    });

    const results = await Promise.all(
      graph.members.slice(0, 2).map((recipient) =>
        transactions.executeInTransaction({}, () =>
          transfers.transfer({
            warehouseId: graph.warehouse.id,
            currentManagerUserId: graph.manager.userId,
            recipientUserId: recipient.userId,
            formerManagerRoleId: graph.customRoles[0].id,
          }),
        ),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(
      dataSource.query(
        "SELECT count(*) FROM warehouse_memberships WHERE warehouse_id = $1 AND role_kind = 'warehouse_manager'",
        [graph.warehouse.id],
      ),
    ).resolves.toEqual([{ count: '1' }]);
  });
});
