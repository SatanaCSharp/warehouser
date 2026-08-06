import { ErrorCode } from '@warehouser/shared-types/enums';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
// Does not exist yet — this is the RED step for T10. ChangeMemberEmailCommand
// must be implemented by the implementer at this path.
import { ChangeMemberEmailCommand } from 'users/usecases/commands/change-member-email.command';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-06T12:00:00.000Z');

const warehouseAId = '00000000-0000-4000-8000-000000000101';
const warehouseBId = '00000000-0000-4000-8000-000000000102';

const actorRoleId = '00000000-0000-4000-8000-000000000201';
const targetRoleId = '00000000-0000-4000-8000-000000000202';
const managerRoleId = '00000000-0000-4000-8000-000000000203';
const crossWarehouseRoleId = '00000000-0000-4000-8000-000000000204';
const overPoweredRoleId = '00000000-0000-4000-8000-000000000205';

const actorUserId = '00000000-0000-4000-8000-000000000301';
const targetUserId = '00000000-0000-4000-8000-000000000302';
const crossWarehouseUserId = '00000000-0000-4000-8000-000000000303';
const collidingUserId = '00000000-0000-4000-8000-000000000304';

const emailUpdatePermissionId = 'USERS:EMAIL_UPDATE';
const superpowerPermissionId = 'ACCESS:SUPERPOWER';

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describeIntegration('ChangeMemberEmailCommand', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const memberLifecycleRepository = new MemberLifecycleRepository(dataSource);
  const accessCurrentUserRepository = new AccessCurrentUserRepository(
    dataSource,
  );
  const authenticationRepository = new AuthenticationRepository(dataSource);

  const createCommand = (): ChangeMemberEmailCommand =>
    new ChangeMemberEmailCommand(
      memberLifecycleRepository,
      accessCurrentUserRepository,
      authenticationRepository,
    );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const seedPermissions = async (): Promise<void> => {
    await dataSource.manager.getRepository(PermissionEntity).insert([
      {
        id: emailUpdatePermissionId,
        label: 'Update user email',
        kind: 'assignable',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: superpowerPermissionId,
        label: 'Synthetic superpower',
        kind: 'assignable',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };

  const seedWarehouses = async (): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseEntity).insert([
      { id: warehouseAId, name: 'Warehouse A', createdAt: now, updatedAt: now },
      { id: warehouseBId, name: 'Warehouse B', createdAt: now, updatedAt: now },
    ]);
  };

  const seedRoles = async (): Promise<void> => {
    await dataSource.manager.getRepository(RoleEntity).insert([
      {
        id: actorRoleId,
        warehouseId: warehouseAId,
        name: 'Actor Role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: targetRoleId,
        warehouseId: warehouseAId,
        name: 'Target Role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: managerRoleId,
        warehouseId: warehouseAId,
        name: 'Warehouse Manager',
        kind: 'warehouse_manager',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crossWarehouseRoleId,
        warehouseId: warehouseBId,
        name: 'Cross-Warehouse Role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: overPoweredRoleId,
        warehouseId: warehouseAId,
        name: 'Overpowered Role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    // actor's Role holds email-update only; the "overpowered" Role additionally
    // holds a Permission the actor does not have, for the AC-19 superset test.
    await dataSource.manager.getRepository(RolePermissionEntity).insert([
      {
        roleId: actorRoleId,
        permissionId: emailUpdatePermissionId,
        roleKind: 'custom',
        permissionKind: 'assignable',
      },
      {
        roleId: overPoweredRoleId,
        permissionId: superpowerPermissionId,
        roleKind: 'custom',
        permissionKind: 'assignable',
      },
    ]);
  };

  // `accounts.user_id` / `users.account_id` form a deferred circular FK pair,
  // so both inserts must run inside one transaction.
  const seedIdentity = async (
    userId: string,
    normalizedEmail: string,
  ): Promise<void> => {
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: userId,
        userId,
        normalizedEmail,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: now,
        updatedAt: now,
      });
      await manager.getRepository(UserEntity).insert({
        id: userId,
        accountId: userId,
        createdAt: now,
        updatedAt: now,
      });
    });
  };

  const seedMembership = async (
    userId: string,
    warehouseId: string,
    roleId: string,
    roleKind: 'custom' | 'warehouse_manager' = 'custom',
  ): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId,
      roleId,
      roleKind,
      createdAt: now,
      updatedAt: now,
    });
  };

  const seedActor = async (): Promise<void> => {
    await seedIdentity(actorUserId, 'actor@example.test');
    await seedMembership(actorUserId, warehouseAId, actorRoleId);
  };

  const currentActor = (): AccessCurrentUser => ({
    userId: actorUserId,
    warehouseId: warehouseAId,
    roleId: actorRoleId,
    roleKind: 'custom',
    permissionId: emailUpdatePermissionId,
  });

  const findAccountEmail = (userId: string): Promise<string | null> =>
    dataSource.manager
      .getRepository(AccountEntity)
      .findOneBy({ id: userId })
      .then((account) => account?.normalizedEmail ?? null);

  it('changes the target email and leaves the target sessions active (AC-04)', async () => {
    await seedPermissions();
    await seedWarehouses();
    await seedRoles();
    await seedActor();
    await seedIdentity(targetUserId, 'target@example.test');
    await seedMembership(targetUserId, warehouseAId, targetRoleId);
    const targetAccount = await dataSource.manager
      .getRepository(AccountEntity)
      .findOneByOrFail({ id: targetUserId });
    await dataSource.manager.getRepository(SessionEntity).insert({
      id: '00000000-0000-4000-8000-000000000401',
      accountId: targetAccount.id,
      secretDigest: Buffer.alloc(32, 7),
      establishedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      revokedAt: null,
    });

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(currentActor(), {
        targetUserId,
        email: 'updated@example.test',
      }),
    );

    expect(result).toMatchObject({ userId: targetUserId });
    await expect(findAccountEmail(targetUserId)).resolves.toBe(
      'updated@example.test',
    );
    const session = await dataSource.manager
      .getRepository(SessionEntity)
      .findOneByOrFail({ id: '00000000-0000-4000-8000-000000000401' });
    expect(session.revokedAt).toBeNull();
  });

  it('rejects an invalid new email format and leaves the target unchanged', async () => {
    await seedPermissions();
    await seedWarehouses();
    await seedRoles();
    await seedActor();
    await seedIdentity(targetUserId, 'target@example.test');
    await seedMembership(targetUserId, warehouseAId, targetRoleId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentActor(), {
          targetUserId,
          email: 'not-an-email',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_INPUT });
    await expect(findAccountEmail(targetUserId)).resolves.toBe(
      'target@example.test',
    );
  });

  it('rejects a duplicate email already registered to another identity (AC-05)', async () => {
    await seedPermissions();
    await seedWarehouses();
    await seedRoles();
    await seedActor();
    await seedIdentity(targetUserId, 'target@example.test');
    await seedMembership(targetUserId, warehouseAId, targetRoleId);
    await seedIdentity(collidingUserId, 'already-registered@example.test');

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentActor(), {
          targetUserId,
          email: 'already-registered@example.test',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED });
    await expect(findAccountEmail(targetUserId)).resolves.toBe(
      'target@example.test',
    );
  });

  it('denies a missing/cross-Warehouse target without disclosing existence (AC-09)', async () => {
    await seedPermissions();
    await seedWarehouses();
    await seedRoles();
    await seedActor();
    // target actually belongs to Warehouse B, not the actor's Warehouse A.
    await seedIdentity(crossWarehouseUserId, 'cross-warehouse@example.test');
    await seedMembership(
      crossWarehouseUserId,
      warehouseBId,
      crossWarehouseRoleId,
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentActor(), {
          targetUserId: crossWarehouseUserId,
          email: 'new-email@example.test',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });
    await expect(findAccountEmail(crossWarehouseUserId)).resolves.toBe(
      'cross-warehouse@example.test',
    );
  });

  it('denies self-targeting (AC-18)', async () => {
    await seedPermissions();
    await seedWarehouses();
    await seedRoles();
    await seedActor();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentActor(), {
          targetUserId: actorUserId,
          email: 'new-email@example.test',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.USERS_SELF_ACTION_DENIED });
    await expect(findAccountEmail(actorUserId)).resolves.toBe(
      'actor@example.test',
    );
  });

  it('denies a target currently holding the Warehouse Manager Role (AC-14)', async () => {
    await seedPermissions();
    await seedWarehouses();
    await seedRoles();
    await seedActor();
    await seedIdentity(targetUserId, 'manager@example.test');
    await seedMembership(
      targetUserId,
      warehouseAId,
      managerRoleId,
      'warehouse_manager',
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentActor(), {
          targetUserId,
          email: 'new-email@example.test',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.USERS_MANAGER_ROLE_PROTECTED });
    await expect(findAccountEmail(targetUserId)).resolves.toBe(
      'manager@example.test',
    );
  });

  it('denies a target whose Role holds a Permission the actor lacks (AC-19)', async () => {
    await seedPermissions();
    await seedWarehouses();
    await seedRoles();
    await seedActor();
    await seedIdentity(targetUserId, 'overpowered@example.test');
    await seedMembership(targetUserId, warehouseAId, overPoweredRoleId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentActor(), {
          targetUserId,
          email: 'new-email@example.test',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.USERS_PERMISSION_EXCEEDED });
    await expect(findAccountEmail(targetUserId)).resolves.toBe(
      'overpowered@example.test',
    );
  });

  it('rolls back the whole attempt when persistence fails partway through (atomicity)', async () => {
    await seedPermissions();
    await seedWarehouses();
    await seedRoles();
    await seedActor();
    await seedIdentity(targetUserId, 'target@example.test');
    await seedMembership(targetUserId, warehouseAId, targetRoleId);

    await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_email_change()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'injected email-change failure';
      END;
      $$;
      CREATE TRIGGER fail_email_change
      BEFORE UPDATE ON accounts
      FOR EACH ROW EXECUTE FUNCTION fail_email_change();
    `);

    try {
      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(currentActor(), {
            targetUserId,
            email: 'new-email@example.test',
          }),
        ),
      ).rejects.toThrow();
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS fail_email_change ON accounts',
      );
      await dataSource.query('DROP FUNCTION IF EXISTS fail_email_change');
    }

    await expect(findAccountEmail(targetUserId)).resolves.toBe(
      'target@example.test',
    );
  });
});
