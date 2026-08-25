import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { workspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
// This command does not exist yet — this is the RED step for T20. Expected
// to accept the caller's `WorkspaceCurrentUser` plus `{ name }`, create the
// Warehouse in `principal.workspaceId`, delegate its protected Warehouse
// Manager Role and the creator's membership to `access`'s
// `ProvisionInitialAccessCommand` (T12), and run inside its own
// `@Transactional()` boundary (sad.md §6.4).
import { CreateWarehouseCommand } from 'warehouses/usecases/commands/create-warehouse.command';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-12T12:00:00.000Z');

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const workspaceId = uuid('000000000001');
const existingWarehouseId = uuid('100000000001');
const actorId = uuid('300000000001');

describeIntegration('CreateWarehouseCommand', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const warehouseLifecycleRepository = new WarehouseLifecycleRepository(
    dataSource,
  );
  const accessProvisioningRepository = new AccessProvisioningRepository(
    dataSource,
  );
  const provisionInitialAccess = new ProvisionInitialAccessCommand(
    accessProvisioningRepository,
  );

  let newWarehouseId = uuid('400000000001');

  const createCommand = (): CreateWarehouseCommand =>
    new CreateWarehouseCommand(
      warehouseLifecycleRepository,
      provisionInitialAccess,
      { warehouseId: () => newWarehouseId },
    );

  beforeAll(async () => {
    await dataSource.initialize();
    // Never truncates `permissions`/`workspace_permissions` — those
    // catalogue tables are restored globally by
    // `src/test/restore-catalogues.setup.ts`.
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  beforeEach(() => {
    newWarehouseId = randomUUID();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // `accounts.user_id` / `users.account_id` form a deferred circular FK
  // pair, so both inserts must land inside one statement/transaction.
  const seedIdentity = async (userId: string): Promise<void> => {
    await dataSource.transaction(async (manager) => {
      await manager.insert(AccountEntity, {
        id: userId,
        userId,
        normalizedEmail: `${userId}@example.test`,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: now,
        updatedAt: now,
      });
      await manager.insert(UserEntity, {
        id: userId,
        accountId: userId,
        workspaceId,
        activeWarehouseId: null,
        createdAt: now,
        updatedAt: now,
      });
    });
  };

  const seedBaseline = async (): Promise<void> => {
    const manager = dataSource.manager;

    await manager.getRepository(WorkspaceEntity).insert({
      id: workspaceId,
      name: null,
      createdAt: now,
      updatedAt: now,
    });

    // Pre-exists so AC-08's "a valid name may duplicate another Warehouse's
    // name" has something concrete to duplicate.
    await manager.getRepository(WarehouseEntity).insert({
      id: existingWarehouseId,
      workspaceId,
      name: 'Test Warehouse North',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await seedIdentity(actorId);
  };

  const actor = () =>
    workspaceCurrentUser({
      userId: actorId,
      workspaceId,
      workspaceRoleId: uuid('200000000001'),
      workspaceRoleKind: 'custom',
      permissionId: WorkspacePermissionId.WAREHOUSES_CREATE,
    });

  const persistedCounts = async (): Promise<{
    warehouses: string;
    roles: string;
    memberships: string;
  }> => {
    const [row] = await dataSource.query<
      { warehouses: string; roles: string; memberships: string }[]
    >(
      `SELECT
        (SELECT count(*) FROM warehouses) AS warehouses,
        (SELECT count(*) FROM roles) AS roles,
        (SELECT count(*) FROM warehouse_memberships) AS memberships`,
    );
    return row;
  };

  it('AC-06: creates the Warehouse, its protected Warehouse Manager Role and the creator membership as one outcome, and it is selectable for them', async () => {
    await seedBaseline();

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor(), { name: 'Test Warehouse South' }),
    );

    expect(result).toMatchObject({
      id: newWarehouseId,
      name: 'Test Warehouse South',
      archivedAt: null,
    });

    const warehouse = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: newWarehouseId });
    expect(warehouse).toMatchObject({
      workspaceId,
      name: 'Test Warehouse South',
      archivedAt: null,
    });

    const roles = await dataSource.manager
      .getRepository(RoleEntity)
      .find({ where: { warehouseId: newWarehouseId } });
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({ kind: 'warehouse_manager' });

    const membership = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId: actorId, warehouseId: newWarehouseId });
    expect(membership).toMatchObject({
      workspaceId,
      roleId: roles[0].id,
      roleKind: 'warehouse_manager',
    });
  });

  it('DoD/spec.md §1 third boundary: the new Warehouse holds only its protected Warehouse Manager Role — no custom Role is created', async () => {
    await seedBaseline();

    await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor(), { name: 'Test Warehouse South' }),
    );

    const customRoles = await dataSource.manager
      .getRepository(RoleEntity)
      .countBy({ warehouseId: newWarehouseId, kind: 'custom' });
    expect(customRoles).toBe(0);
  });

  it('AC-08: a valid name that duplicates another Warehouse of the same Workspace is accepted', async () => {
    await seedBaseline();

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor(), { name: 'Test Warehouse North' }),
    );

    expect(result).toMatchObject({ name: 'Test Warehouse North' });

    const namesakes = await dataSource.manager
      .getRepository(WarehouseEntity)
      .countBy({ workspaceId, name: 'Test Warehouse North' });
    expect(namesakes).toBe(2);
  });

  it('AC-07: an injected failure establishing the Manager Role assignment leaves no Warehouse behind', async () => {
    await seedBaseline();
    const before = await persistedCounts();

    await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_membership_insert_t20()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'injected membership-insert failure';
      END;
      $$;
      CREATE TRIGGER fail_membership_insert_t20
      BEFORE INSERT ON warehouse_memberships
      FOR EACH ROW EXECUTE FUNCTION fail_membership_insert_t20();
    `);

    try {
      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(actor(), { name: 'Test Warehouse South' }),
        ),
      ).rejects.toBeDefined();
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS fail_membership_insert_t20 ON warehouse_memberships',
      );
      await dataSource.query(
        'DROP FUNCTION IF EXISTS fail_membership_insert_t20',
      );
    }

    // No partial Warehouse/Role/membership row survives the rollback — a
    // Warehouse never exists with zero or more than one Manager (AC-07).
    await expect(persistedCounts()).resolves.toEqual(before);
    const warehouse = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: newWarehouseId });
    expect(warehouse).toBeNull();
  });

  it('AC-08: rejects an empty-after-trim Warehouse name and creates nothing (command-level, real Workspace present)', async () => {
    await seedBaseline();
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(), { name: '   ' }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_INVALID_INPUT,
      details: { field: 'name', rule: 'empty' },
    });

    await expect(persistedCounts()).resolves.toEqual(before);
  });
});
