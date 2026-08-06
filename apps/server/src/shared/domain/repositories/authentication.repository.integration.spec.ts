import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import type { DeepPartial } from 'typeorm';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-06T12:00:00.000Z');

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const buildAccount = (
  overrides: DeepPartial<AccountEntity> = {},
): DeepPartial<AccountEntity> => ({
  id: uuid('000000000001'),
  userId: uuid('000000000001'),
  normalizedEmail: 'member.one@example.test',
  passwordHash: 'synthetic-hash',
  passwordHashAlgorithm: 'scrypt',
  passwordHashParameters: { cost: 1_024 },
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const buildUser = (
  overrides: DeepPartial<UserEntity> = {},
): DeepPartial<UserEntity> => ({
  id: uuid('000000000001'),
  accountId: uuid('000000000001'),
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const buildSession = (
  overrides: DeepPartial<SessionEntity> = {},
): DeepPartial<SessionEntity> => ({
  id: uuid('000000000101'),
  accountId: uuid('000000000001'),
  secretDigest: Buffer.alloc(32, 1),
  establishedAt: now,
  expiresAt: new Date(now.getTime() + 3_600_000),
  revokedAt: null,
  ...overrides,
});

// fk_accounts_user_id / fk_users_account_id are INITIALLY DEFERRED, so an Account+User pair
// must be inserted together inside one transaction — inserting them as separate autocommitted
// statements trips the deferred check at the end of the first statement.
const insertIdentity = (
  account: DeepPartial<AccountEntity>,
  user: DeepPartial<UserEntity>,
): Promise<void> =>
  dataSource.transaction(async (manager) => {
    await manager.insert(AccountEntity, account);
    await manager.insert(UserEntity, user);
  });

describeIntegration('AuthenticationRepository — identity lifecycle', () => {
  const repository = new AuthenticationRepository(dataSource);

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

  it('createIdentity inserts an Account+User pair and creates no Session row', async () => {
    await repository.createIdentity({
      account: buildAccount(),
      user: buildUser(),
    });

    const [accounts, users, sessions] = await Promise.all([
      dataSource.query('SELECT count(*) FROM accounts'),
      dataSource.query('SELECT count(*) FROM users'),
      dataSource.query('SELECT count(*) FROM sessions'),
    ]);

    expect(accounts).toEqual([{ count: '1' }]);
    expect(users).toEqual([{ count: '1' }]);
    expect(sessions).toEqual([{ count: '0' }]);
  });

  it('updateEmail updates exactly the target Account row', async () => {
    await insertIdentity(buildAccount(), buildUser());

    const updatedAt = new Date('2026-08-06T13:00:00.000Z');
    const affected = await repository.updateEmail(
      uuid('000000000001'),
      'member.one.updated@example.test',
      updatedAt,
    );

    expect(affected).toBe(true);
    const row = await dataSource.query(
      'SELECT normalized_email, updated_at FROM accounts WHERE id = $1',
      [uuid('000000000001')],
    );
    expect(row).toEqual([
      {
        normalized_email: 'member.one.updated@example.test',
        updated_at: updatedAt,
      },
    ]);
  });

  it('updateCredential updates exactly the target Account row', async () => {
    await insertIdentity(buildAccount(), buildUser());

    const updatedAt = new Date('2026-08-06T14:00:00.000Z');
    const affected = await repository.updateCredential(
      uuid('000000000001'),
      {
        hash: 'new-synthetic-hash',
        algorithm: 'scrypt',
        parameters: { cost: 2_048 },
      },
      updatedAt,
    );

    expect(affected).toBe(true);
    const row = await dataSource.query(
      `SELECT password_hash, password_hash_algorithm, password_hash_parameters, updated_at
       FROM accounts WHERE id = $1`,
      [uuid('000000000001')],
    );
    expect(row).toEqual([
      {
        password_hash: 'new-synthetic-hash',
        password_hash_algorithm: 'scrypt',
        password_hash_parameters: { cost: 2_048 },
        updated_at: updatedAt,
      },
    ]);
  });

  it("revokeSessionsByAccountId revokes only the target account's non-revoked Sessions", async () => {
    const otherAccountId = uuid('000000000002');

    await insertIdentity(buildAccount(), buildUser());
    await insertIdentity(
      buildAccount({
        id: otherAccountId,
        userId: otherAccountId,
        normalizedEmail: 'member.two@example.test',
      }),
      buildUser({ id: otherAccountId, accountId: otherAccountId }),
    );

    await dataSource.manager.insert(SessionEntity, [
      buildSession({ id: uuid('000000000101') }),
      buildSession({
        id: uuid('000000000102'),
        secretDigest: Buffer.alloc(32, 2),
      }),
      buildSession({
        id: uuid('000000000201'),
        accountId: otherAccountId,
        secretDigest: Buffer.alloc(32, 3),
      }),
    ]);

    const revokedAt = new Date('2026-08-06T15:00:00.000Z');
    const affectedCount = await repository.revokeSessionsByAccountId(
      uuid('000000000001'),
      revokedAt,
    );

    expect(affectedCount).toBe(2);

    const targetSessions = await dataSource.query(
      'SELECT revoked_at FROM sessions WHERE account_id = $1',
      [uuid('000000000001')],
    );
    expect(targetSessions).toEqual([
      { revoked_at: revokedAt },
      { revoked_at: revokedAt },
    ]);

    const otherSessions = await dataSource.query(
      'SELECT revoked_at FROM sessions WHERE account_id = $1',
      [otherAccountId],
    );
    expect(otherSessions).toEqual([{ revoked_at: null }]);
  });

  it('deletes an identity in the data-model deletion-sequencing order: memberships, then sessions, then users/accounts', async () => {
    const warehouseId = uuid('000000000301');
    const roleId = uuid('000000000401');

    await insertIdentity(buildAccount(), buildUser());
    await dataSource.manager.insert(SessionEntity, buildSession());
    await dataSource.manager.insert(WarehouseEntity, {
      id: warehouseId,
      name: 'Test Warehouse',
      createdAt: now,
      updatedAt: now,
    });
    await dataSource.manager.insert(RoleEntity, {
      id: roleId,
      warehouseId,
      name: 'Custom role',
      kind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
    await dataSource.manager.insert(WarehouseMembershipEntity, {
      userId: uuid('000000000001'),
      warehouseId,
      roleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    });

    // Step 1 — membership must be removed first: the FK on warehouse_memberships.user_id
    // is RESTRICT and not deferred, so deleting sessions/users/accounts first would fail.
    await dataSource.manager.delete(WarehouseMembershipEntity, {
      userId: uuid('000000000001'),
    });

    // Step 2 — sessions must be hard-deleted before accounts: fk_sessions_account_id is
    // RESTRICT and not deferred.
    await repository.deleteSessionsByAccountId(uuid('000000000001'));

    // Step 3 — users/accounts pair; the FK pair between them is deferred, so either order
    // within the same statement group is fine.
    await repository.deleteIdentity(uuid('000000000001'));

    const [memberships, sessions, users, accounts] = await Promise.all([
      dataSource.query('SELECT count(*) FROM warehouse_memberships'),
      dataSource.query('SELECT count(*) FROM sessions'),
      dataSource.query('SELECT count(*) FROM users'),
      dataSource.query('SELECT count(*) FROM accounts'),
    ]);

    expect(memberships).toEqual([{ count: '0' }]);
    expect(sessions).toEqual([{ count: '0' }]);
    expect(users).toEqual([{ count: '0' }]);
    expect(accounts).toEqual([{ count: '0' }]);
  });
});
