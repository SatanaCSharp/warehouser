import { randomBytes, randomUUID } from 'node:crypto';

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
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
// Does not exist yet — this is the RED step for T12. Per data-model.md's
// deletion-sequencing section and sad.md §6.4/§4, DeleteMemberCommand is
// expected to accept the caller's `AccessCurrentUser` plus
// `{ targetUserId }`, lock the target's Warehouse Membership row
// (`MemberLifecycleRepository.lockMembership`, the same pessimistic-write
// primitive `ChangeMemberEmailCommand`/`TransferWarehouseManagerCommand`
// already use), re-check self/protected-Manager preconditions, then in one
// transaction delete the Warehouse Membership row, hard-delete the target's
// Sessions, and delete the target's Account+User pair — in that exact
// order — returning the deleted member's id.
import { DeleteMemberCommand } from 'users/usecases/commands/delete-member.command';

const now = new Date('2026-08-06T12:00:00.000Z');

const workspaceId = '00000000-0000-4000-8000-000000000100';
const warehouseAId = '00000000-0000-4000-8000-000000000101';
const warehouseBId = '00000000-0000-4000-8000-000000000102';

const deleterRoleId = '00000000-0000-4000-8000-000000000201';
const targetRoleId = '00000000-0000-4000-8000-000000000202';
const managerRoleId = '00000000-0000-4000-8000-000000000203';
const crossWarehouseRoleId = '00000000-0000-4000-8000-000000000204';
const replacementRoleId = '00000000-0000-4000-8000-000000000205';

const deleterUserId = '00000000-0000-4000-8000-000000000301';
const targetUserId = '00000000-0000-4000-8000-000000000302';
const crossWarehouseUserId = '00000000-0000-4000-8000-000000000303';

const usersDeletePermissionId = 'USERS:DELETE';

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describe('DeleteMemberCommand', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const memberLifecycleRepository = new MemberLifecycleRepository(dataSource);
  const authenticationRepository = new AuthenticationRepository(dataSource);

  const createCommand = (): DeleteMemberCommand =>
    new DeleteMemberCommand(
      memberLifecycleRepository,
      authenticationRepository,
    );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const seedWorkspace = async (): Promise<void> => {
    await dataSource.manager.getRepository(WorkspaceEntity).insert({
      id: workspaceId,
      name: null,
      createdAt: now,
      updatedAt: now,
    });
  };

  const seedPermissions = async (): Promise<void> => {
    await dataSource.manager.getRepository(PermissionEntity).upsert(
      [
        {
          id: usersDeletePermissionId,
          label: 'Delete user',
          kind: 'assignable',
          createdAt: now,
          updatedAt: now,
        },
      ],
      ['id'],
    );
  };

  const seedWarehouses = async (): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseEntity).insert([
      {
        id: warehouseAId,
        workspaceId,
        name: 'Warehouse A',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: warehouseBId,
        workspaceId,
        name: 'Warehouse B',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };

  const seedRoles = async (): Promise<void> => {
    await dataSource.manager.getRepository(RoleEntity).insert([
      {
        id: deleterRoleId,
        warehouseId: warehouseAId,
        name: 'Deleter Role',
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
        id: replacementRoleId,
        warehouseId: warehouseAId,
        name: 'Replacement Custom Role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await dataSource.manager.getRepository(RolePermissionEntity).insert([
      {
        roleId: deleterRoleId,
        permissionId: usersDeletePermissionId,
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
        workspaceId,
        createdAt: now,
        updatedAt: now,
      });
    });
  };

  const seedMembership = async (
    userId: string,
    targetWarehouseId: string,
    roleId: string,
    roleKind: 'custom' | 'warehouse_manager' = 'custom',
  ): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId: targetWarehouseId,
      workspaceId,
      roleId,
      roleKind,
      createdAt: now,
      updatedAt: now,
    });
  };

  const seedSession = async (accountId: string): Promise<string> => {
    const id = randomUUID();
    await dataSource.manager.getRepository(SessionEntity).insert({
      id,
      accountId,
      secretDigest: randomBytes(32),
      establishedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      revokedAt: null,
    });
    return id;
  };

  const seedDeleter = async (): Promise<void> => {
    await seedIdentity(deleterUserId, 'deleter@example.test');
    await seedMembership(deleterUserId, warehouseAId, deleterRoleId);
  };

  const currentDeleter = (): AccessCurrentUser => ({
    userId: deleterUserId,
    warehouseId: warehouseAId,
    roleId: deleterRoleId,
    roleKind: 'custom',
    permissionId: usersDeletePermissionId,
    observedPermissionIds: [],
    archived: false,
  });

  const persistedCounts = async (): Promise<{
    accounts: string;
    users: string;
    memberships: string;
    sessions: string;
  }> => {
    const [row] = await dataSource.query<
      {
        accounts: string;
        users: string;
        memberships: string;
        sessions: string;
      }[]
    >(
      `SELECT
        (SELECT count(*) FROM accounts) AS accounts,
        (SELECT count(*) FROM users) AS users,
        (SELECT count(*) FROM warehouse_memberships) AS memberships,
        (SELECT count(*) FROM sessions) AS sessions`,
    );
    return row;
  };

  it('AC-08: deletes the target Membership, Sessions, Account, and User in the data-model deletion-sequencing order, freeing the email for reuse', async () => {
    await seedPermissions();
    await seedWorkspace();
    await seedWarehouses();
    await seedRoles();
    await seedDeleter();
    await seedIdentity(targetUserId, 'target@example.test');
    await seedMembership(targetUserId, warehouseAId, targetRoleId);
    await seedSession(targetUserId);
    await seedSession(targetUserId);

    // Record persistence call order to prove the exact data-model.md
    // sequence: membership -> sessions -> users/accounts.
    const callOrder: string[] = [];
    const deleteMembershipSpy = jest
      .spyOn(memberLifecycleRepository, 'deleteMembership')
      .mockImplementation(async (warehouseId, userId) => {
        callOrder.push('deleteMembership');
        return MemberLifecycleRepository.prototype.deleteMembership.call(
          memberLifecycleRepository,
          warehouseId,
          userId,
        );
      });
    const deleteSessionsSpy = jest
      .spyOn(authenticationRepository, 'deleteSessionsByAccountId')
      .mockImplementation(async (accountId) => {
        callOrder.push('deleteSessionsByAccountId');
        return AuthenticationRepository.prototype.deleteSessionsByAccountId.call(
          authenticationRepository,
          accountId,
        );
      });
    const deleteIdentitySpy = jest
      .spyOn(authenticationRepository, 'deleteIdentity')
      .mockImplementation(async (identityId) => {
        callOrder.push('deleteIdentity');
        return AuthenticationRepository.prototype.deleteIdentity.call(
          authenticationRepository,
          identityId,
        );
      });

    try {
      const result = await transactions.executeInTransaction({}, () =>
        createCommand().execute(currentDeleter(), { targetUserId }),
      );

      expect(result).toMatchObject({ id: targetUserId });
    } finally {
      deleteMembershipSpy.mockRestore();
      deleteSessionsSpy.mockRestore();
      deleteIdentitySpy.mockRestore();
    }

    expect(callOrder).toEqual([
      'deleteMembership',
      'deleteSessionsByAccountId',
      'deleteIdentity',
    ]);

    await expect(
      dataSource.manager
        .getRepository(WarehouseMembershipEntity)
        .findOneBy({ userId: targetUserId }),
    ).resolves.toBeNull();
    await expect(
      dataSource.manager
        .getRepository(AccountEntity)
        .findOneBy({ id: targetUserId }),
    ).resolves.toBeNull();
    await expect(
      dataSource.manager.getRepository(UserEntity).findOneBy({
        id: targetUserId,
      }),
    ).resolves.toBeNull();
    await expect(
      dataSource.query('SELECT count(*) FROM sessions WHERE account_id = $1', [
        targetUserId,
      ]),
    ).resolves.toEqual([{ count: '0' }]);

    // The freed email can be reused by a future Warehouse Member.
    await expect(
      seedIdentity(randomUUID(), 'target@example.test'),
    ).resolves.toBeUndefined();
  });

  it('AC-09: denies deletion of a missing target without disclosing existence', async () => {
    await seedPermissions();
    await seedWorkspace();
    await seedWarehouses();
    await seedRoles();
    await seedDeleter();
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentDeleter(), {
          targetUserId: randomUUID(),
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('AC-09: denies deletion of a target belonging to a different Warehouse without disclosing existence', async () => {
    await seedPermissions();
    await seedWorkspace();
    await seedWarehouses();
    await seedRoles();
    await seedDeleter();
    await seedIdentity(crossWarehouseUserId, 'cross-warehouse@example.test');
    await seedMembership(
      crossWarehouseUserId,
      warehouseBId,
      crossWarehouseRoleId,
    );
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentDeleter(), {
          targetUserId: crossWarehouseUserId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_TARGET_UNAVAILABLE });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('AC-11: blocks self-deletion', async () => {
    await seedPermissions();
    await seedWorkspace();
    await seedWarehouses();
    await seedRoles();
    await seedDeleter();
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentDeleter(), {
          targetUserId: deleterUserId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.USERS_SELF_ACTION_DENIED });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('AC-13: blocks deletion of a target currently holding the Warehouse Manager Role', async () => {
    await seedPermissions();
    await seedWorkspace();
    await seedWarehouses();
    await seedRoles();
    await seedDeleter();
    await seedIdentity(targetUserId, 'manager@example.test');
    await seedMembership(
      targetUserId,
      warehouseAId,
      managerRoleId,
      'warehouse_manager',
    );
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(currentDeleter(), { targetUserId }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.USERS_MANAGER_ROLE_PROTECTED });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('DoD: atomic rollback — an injected failure on the Sessions delete leaves the target fully intact', async () => {
    await seedPermissions();
    await seedWorkspace();
    await seedWarehouses();
    await seedRoles();
    await seedDeleter();
    await seedIdentity(targetUserId, 'rollback-target@example.test');
    await seedMembership(targetUserId, warehouseAId, targetRoleId);
    await seedSession(targetUserId);
    const before = await persistedCounts();

    await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_session_delete()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'injected session-delete failure';
      END;
      $$;
      CREATE TRIGGER fail_session_delete
      BEFORE DELETE ON sessions
      FOR EACH ROW EXECUTE FUNCTION fail_session_delete();
    `);

    try {
      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(currentDeleter(), { targetUserId }),
        ),
      ).rejects.toThrow();
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS fail_session_delete ON sessions',
      );
      await dataSource.query('DROP FUNCTION IF EXISTS fail_session_delete');
    }

    // No partial removal survives the rollback — membership, session,
    // account, and user rows are all exactly as they were before.
    await expect(persistedCounts()).resolves.toEqual(before);
  });
});
