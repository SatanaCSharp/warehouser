import { ErrorCode } from '@warehouser/shared-types/enums';
import type { PinoLogger } from 'nestjs-pino';
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
import type { PasswordCredential } from 'shared/domain/security/password-hashing';
import {
  accountEntityFactory,
  sessionEntityFactory,
  userEntityFactory,
  warehouseMembershipEntityFactory,
} from 'test/factories/entity-factories';
import { ChangeMemberPasswordCommand } from 'users/usecases/commands/change-member-password.command';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-06T12:00:00.000Z');

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const warehouseAId = uuid('000000000101');
const warehouseBId = uuid('000000000102');
const managerRoleId = uuid('000000000201');
const actorRoleId = uuid('000000000202');
const targetRoleId = uuid('000000000203');
const permissionExceedingRoleId = uuid('000000000204');
const crossWarehouseRoleId = uuid('000000000205');

const actorUserId = uuid('000000000301');
const targetUserId = uuid('000000000302');
const otherAccountUserId = uuid('000000000303');

// The credential produced by a fast, test-only hash function — kept
// deliberately unrealistic (not scrypt) so integration tests stay fast; the
// command must accept whatever `hashPassword` implementation it is given.
const fakeHash = (password: string): Promise<PasswordCredential> =>
  Promise.resolve({
    algorithm: 'test',
    hash: `hashed:${password}`,
    parameters: { marker: 'test-hash' },
  });

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describeIntegration('ChangeMemberPasswordCommand', () => {
  const memberLifecycleRepository = new MemberLifecycleRepository(dataSource);
  const accessCurrentUserRepository = new AccessCurrentUserRepository(
    dataSource,
  );
  const authenticationRepository = new AuthenticationRepository(dataSource);
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);

  const logInfo = jest.fn();

  const createCommand = (): ChangeMemberPasswordCommand =>
    new ChangeMemberPasswordCommand(
      memberLifecycleRepository,
      accessCurrentUserRepository,
      authenticationRepository,
      fakeHash,
      () => now,
      { info: logInfo } as unknown as PinoLogger,
    );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  beforeEach(() => {
    logInfo.mockClear();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const seedPermissions = async (ids: readonly string[]): Promise<void> => {
    if (ids.length === 0) {
      return;
    }
    await dataSource.manager.getRepository(PermissionEntity).insert(
      ids.map((id) => ({
        id,
        label: id,
        kind: 'assignable' as const,
        createdAt: now,
        updatedAt: now,
      })),
    );
  };

  const seedWarehouses = async (): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseEntity).insert([
      { id: warehouseAId, name: 'Warehouse A', createdAt: now, updatedAt: now },
      { id: warehouseBId, name: 'Warehouse B', createdAt: now, updatedAt: now },
    ]);
  };

  const seedRole = async (
    id: string,
    warehouseId: string,
    kind: 'custom' | 'warehouse_manager',
    grantedPermissionIds: readonly string[] = [],
  ): Promise<void> => {
    await dataSource.manager.getRepository(RoleEntity).insert({
      id,
      warehouseId,
      name: `Role ${id}`,
      kind,
      createdAt: now,
      updatedAt: now,
    });
    if (grantedPermissionIds.length > 0) {
      await dataSource.manager.getRepository(RolePermissionEntity).insert(
        grantedPermissionIds.map((permissionId) => ({
          roleId: id,
          permissionId,
          roleKind: kind,
          permissionKind: 'assignable' as const,
        })),
      );
    }
  };

  // fk_accounts_user_id / fk_users_account_id are INITIALLY DEFERRED, so the
  // Account+User pair must land inside one transaction.
  const seedIdentity = async (
    userId: string,
    overrides: { readonly normalizedEmail?: string } = {},
  ): Promise<void> => {
    const account = accountEntityFactory({
      id: userId,
      userId,
      ...(overrides.normalizedEmail && {
        normalizedEmail: overrides.normalizedEmail,
      }),
      createdAt: now,
      updatedAt: now,
    });
    const user = userEntityFactory(account, { createdAt: now, updatedAt: now });
    await dataSource.transaction(async (manager) => {
      await manager.insert(AccountEntity, account);
      await manager.insert(UserEntity, user);
    });
  };

  const seedMembership = async (
    userId: string,
    warehouseId: string,
    roleId: string,
    roleKind: 'custom' | 'warehouse_manager' = 'custom',
  ): Promise<void> => {
    // `warehouseMembershipEntityFactory` always forces `roleKind: 'custom'`
    // (the AC-20 invariant it's designed to enforce), which would violate
    // the composite FK `fk_warehouse_memberships_role
    // (role_id, warehouse_id, role_kind) → roles(id, warehouse_id, kind)`
    // whenever the referenced Role is `warehouse_manager`-kind. Build the
    // row directly in that case, mirroring
    // `member-lifecycle.repository.integration.spec.ts`'s pattern, and only
    // route through the factory for the `custom` case it's meant for.
    if (roleKind === 'warehouse_manager') {
      await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
        userId,
        warehouseId,
        roleId,
        roleKind: 'warehouse_manager',
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert(
      warehouseMembershipEntityFactory({
        userId,
        warehouseId,
        roleId,
        createdAt: now,
        updatedAt: now,
      }),
    );
  };

  const seedSessions = async (
    accountId: string,
    count: number,
  ): Promise<void> => {
    const account = { id: accountId } as never;
    const sessions = Array.from({ length: count }, () =>
      sessionEntityFactory(account, {
        establishedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
      }),
    );
    await dataSource.manager.insert(SessionEntity, sessions);
  };

  const currentUserFor = (
    userId: string,
    warehouseId: string,
    roleId: string,
    roleKind: 'custom' | 'warehouse_manager',
  ) => ({
    userId,
    warehouseId,
    roleId,
    roleKind,
    permissionId: 'USERS:PASSWORD_CHANGE' as const,
  });

  const readAccount = (userId: string) =>
    dataSource.query(
      'SELECT password_hash, password_hash_algorithm FROM accounts WHERE id = $1',
      [userId],
    );

  const countActiveSessions = async (accountId: string): Promise<number> => {
    const rows = await dataSource.query(
      'SELECT count(*) AS count FROM sessions WHERE account_id = $1 AND revoked_at IS NULL',
      [accountId],
    );
    return Number(rows[0].count);
  };

  it("records the new credential and revokes every prior Session for the target's Account, leaving other accounts untouched", async () => {
    await seedPermissions(['USERS:PASSWORD_CHANGE', 'USERS:EMAIL_UPDATE']);
    await seedWarehouses();
    await seedRole(actorRoleId, warehouseAId, 'custom', [
      'USERS:PASSWORD_CHANGE',
      'USERS:EMAIL_UPDATE',
    ]);
    await seedRole(targetRoleId, warehouseAId, 'custom', []);
    await seedIdentity(actorUserId);
    await seedIdentity(targetUserId);
    await seedIdentity(otherAccountUserId);
    await seedMembership(actorUserId, warehouseAId, actorRoleId);
    await seedMembership(targetUserId, warehouseAId, targetRoleId);
    await seedSessions(targetUserId, 2);
    await seedSessions(otherAccountUserId, 1);

    const currentUser = currentUserFor(
      actorUserId,
      warehouseAId,
      actorRoleId,
      'custom',
    );

    await transactions.executeInTransaction({}, () =>
      createCommand().execute(currentUser, {
        targetUserId,
        newPassword: 'a-valid-password',
      }),
    );

    const [account] = await readAccount(targetUserId);
    expect(account).toMatchObject({
      password_hash: 'hashed:a-valid-password',
      password_hash_algorithm: 'test',
    });

    expect(await countActiveSessions(targetUserId)).toBe(0);
    expect(await countActiveSessions(otherAccountUserId)).toBe(1);

    // sad.md §8: a structured, per-action Pino timing log — no credential
    // fields.
    expect(logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'users.change_member_password',
        outcomeCode: 'success',
        durationMs: expect.any(Number),
        userId: actorUserId,
        warehouseId: warehouseAId,
      }),
    );
  });

  it('rejects a password outside the accepted length and makes no change', async () => {
    await seedPermissions(['USERS:PASSWORD_CHANGE']);
    await seedWarehouses();
    await seedRole(actorRoleId, warehouseAId, 'custom', [
      'USERS:PASSWORD_CHANGE',
    ]);
    await seedRole(targetRoleId, warehouseAId, 'custom', []);
    await seedIdentity(actorUserId);
    await seedIdentity(targetUserId);
    await seedMembership(actorUserId, warehouseAId, actorRoleId);
    await seedMembership(targetUserId, warehouseAId, targetRoleId);
    await seedSessions(targetUserId, 1);

    const currentUser = currentUserFor(
      actorUserId,
      warehouseAId,
      actorRoleId,
      'custom',
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentUser, {
          targetUserId,
          newPassword: 'short',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_INPUT });

    const [account] = await readAccount(targetUserId);
    expect(account.password_hash).not.toBe('hashed:short');
    expect(await countActiveSessions(targetUserId)).toBe(1);
  });

  it('denies a missing target without disclosing existence', async () => {
    await seedPermissions(['USERS:PASSWORD_CHANGE']);
    await seedWarehouses();
    await seedRole(actorRoleId, warehouseAId, 'custom', [
      'USERS:PASSWORD_CHANGE',
    ]);
    await seedIdentity(actorUserId);
    await seedMembership(actorUserId, warehouseAId, actorRoleId);

    const currentUser = currentUserFor(
      actorUserId,
      warehouseAId,
      actorRoleId,
      'custom',
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentUser, {
          targetUserId: uuid('000000000999'),
          newPassword: 'a-valid-password',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });
  });

  it('denies a cross-Warehouse target without disclosing existence', async () => {
    await seedPermissions(['USERS:PASSWORD_CHANGE']);
    await seedWarehouses();
    await seedRole(actorRoleId, warehouseAId, 'custom', [
      'USERS:PASSWORD_CHANGE',
    ]);
    await seedRole(crossWarehouseRoleId, warehouseBId, 'custom', []);
    await seedIdentity(actorUserId);
    await seedIdentity(targetUserId);
    await seedMembership(actorUserId, warehouseAId, actorRoleId);
    // Target's membership lives in a different Warehouse.
    await seedMembership(targetUserId, warehouseBId, crossWarehouseRoleId);

    const currentUser = currentUserFor(
      actorUserId,
      warehouseAId,
      actorRoleId,
      'custom',
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentUser, {
          targetUserId,
          newPassword: 'a-valid-password',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });
  });

  it('blocks self-targeting', async () => {
    await seedPermissions(['USERS:PASSWORD_CHANGE']);
    await seedWarehouses();
    await seedRole(actorRoleId, warehouseAId, 'custom', [
      'USERS:PASSWORD_CHANGE',
    ]);
    await seedIdentity(actorUserId);
    await seedMembership(actorUserId, warehouseAId, actorRoleId);

    const currentUser = currentUserFor(
      actorUserId,
      warehouseAId,
      actorRoleId,
      'custom',
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentUser, {
          targetUserId: actorUserId,
          newPassword: 'a-valid-password',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.USERS_SELF_ACTION_DENIED });
  });

  it('blocks a target currently holding the Warehouse Manager Role', async () => {
    await seedPermissions(['USERS:PASSWORD_CHANGE']);
    await seedWarehouses();
    await seedRole(actorRoleId, warehouseAId, 'custom', [
      'USERS:PASSWORD_CHANGE',
    ]);
    await seedRole(managerRoleId, warehouseAId, 'warehouse_manager', []);
    await seedIdentity(actorUserId);
    await seedIdentity(targetUserId);
    await seedMembership(actorUserId, warehouseAId, actorRoleId);
    await seedMembership(
      targetUserId,
      warehouseAId,
      managerRoleId,
      'warehouse_manager',
    );
    await seedSessions(targetUserId, 1);

    const currentUser = currentUserFor(
      actorUserId,
      warehouseAId,
      actorRoleId,
      'custom',
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentUser, {
          targetUserId,
          newPassword: 'a-valid-password',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.USERS_MANAGER_ROLE_PROTECTED });

    expect(await countActiveSessions(targetUserId)).toBe(1);
  });

  it("blocks a target whose Role's Permissions exceed the actor's own", async () => {
    await seedPermissions([
      'USERS:PASSWORD_CHANGE',
      'USERS:EMAIL_UPDATE',
      'USERS:DELETE',
    ]);
    await seedWarehouses();
    // Actor only holds USERS:PASSWORD_CHANGE.
    await seedRole(actorRoleId, warehouseAId, 'custom', [
      'USERS:PASSWORD_CHANGE',
    ]);
    // Target's Role holds USERS:DELETE, which the actor lacks.
    await seedRole(permissionExceedingRoleId, warehouseAId, 'custom', [
      'USERS:DELETE',
    ]);
    await seedIdentity(actorUserId);
    await seedIdentity(targetUserId);
    await seedMembership(actorUserId, warehouseAId, actorRoleId);
    await seedMembership(targetUserId, warehouseAId, permissionExceedingRoleId);
    await seedSessions(targetUserId, 1);

    const currentUser = currentUserFor(
      actorUserId,
      warehouseAId,
      actorRoleId,
      'custom',
    );

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentUser, {
          targetUserId,
          newPassword: 'a-valid-password',
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.USERS_PERMISSION_EXCEEDED });

    expect(await countActiveSessions(targetUserId)).toBe(1);
  });

  it('rolls back the credential update when Session revocation fails', async () => {
    await seedPermissions(['USERS:PASSWORD_CHANGE']);
    await seedWarehouses();
    await seedRole(actorRoleId, warehouseAId, 'custom', [
      'USERS:PASSWORD_CHANGE',
    ]);
    await seedRole(targetRoleId, warehouseAId, 'custom', []);
    await seedIdentity(actorUserId);
    await seedIdentity(targetUserId);
    await seedMembership(actorUserId, warehouseAId, actorRoleId);
    await seedMembership(targetUserId, warehouseAId, targetRoleId);
    await seedSessions(targetUserId, 1);

    const currentUser = currentUserFor(
      actorUserId,
      warehouseAId,
      actorRoleId,
      'custom',
    );

    await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_password_change_session_revocation()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'injected password-change failure';
      END;
      $$;
      CREATE TRIGGER fail_password_change_session_revocation
      BEFORE UPDATE ON sessions
      FOR EACH ROW EXECUTE FUNCTION fail_password_change_session_revocation();
    `);

    try {
      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(currentUser, {
            targetUserId,
            newPassword: 'a-valid-password',
          }),
        ),
      ).rejects.toBeDefined();
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS fail_password_change_session_revocation ON sessions',
      );
      await dataSource.query(
        'DROP FUNCTION IF EXISTS fail_password_change_session_revocation',
      );
    }

    const [account] = await readAccount(targetUserId);
    expect(account.password_hash).not.toBe('hashed:a-valid-password');
    expect(await countActiveSessions(targetUserId)).toBe(1);
  });
});
