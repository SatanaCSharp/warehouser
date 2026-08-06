import { randomUUID } from 'node:crypto';

import { ErrorCode } from '@warehouser/shared-types/enums';
import { SignInCommand } from 'auth/usecases/commands/sign-in.command';
import { accessCurrentUser } from 'shared/access/access-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';
import { hashPassword } from 'shared/domain/security/password-hashing';
// This command does not exist yet — this is the RED step for T9. The command
// is expected to accept the caller's `AccessCurrentUser` plus creation input
// (email, password, roleId) and return the new member's id/email/roleId on
// success, following the same constructor-injection + `@Transactional()`
// idiom as `TransferWarehouseManagerCommand`/`DeleteRoleCommand`.
import { CreateMemberCommand } from 'users/usecases/commands/create-member.command';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-06T12:00:00.000Z');

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

// Warehouse A is the actor's own Warehouse; Warehouse B exists only to prove
// cross-Warehouse Role hiding (AC-09).
const warehouseAId = uuid('100000000001');
const warehouseBId = uuid('100000000002');

const actorRoleId = uuid('200000000001');
const managerRoleId = uuid('200000000002');
const crossWarehouseRoleId = uuid('200000000003');
const permissiveCustomRoleId = uuid('200000000004');
const overReachingCustomRoleId = uuid('200000000005');

const actorId = uuid('300000000001');

const USERS_CREATE = 'USERS:CREATE';
const USERS_EMAIL_UPDATE = 'USERS:EMAIL_UPDATE';
const USERS_DELETE = 'USERS:DELETE';

const validEmail = 'new.member@example.test';
const validPassword = 'a-valid-password-1';

// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describeIntegration('CreateMemberCommand', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const accessCurrentUserRepository = new AccessCurrentUserRepository(
    dataSource,
  );
  const roleLifecycleRepository = new RoleLifecycleRepository(dataSource);
  const memberLifecycleRepository = new MemberLifecycleRepository(dataSource);
  const authenticationRepository = new AuthenticationRepository(dataSource);

  let newMemberId = uuid('400000000001');

  const createCommand = (): CreateMemberCommand =>
    new CreateMemberCommand(
      accessCurrentUserRepository,
      roleLifecycleRepository,
      memberLifecycleRepository,
      authenticationRepository,
      () =>
        Promise.resolve({
          algorithm: 'scrypt',
          hash: 'synthetic-hash',
          parameters: { cost: 1_024 },
        }),
      {
        identityId: () => newMemberId,
        now: () => now,
      },
    );

  // Fast-but-real scrypt parameters, matching the pattern already used by
  // `shared/domain/security/password-hashing.spec.ts`'s `testParameters` —
  // unlike the synthetic mock above (which every other test in this suite
  // uses to stay fast and decoupled from hashing correctness), the sign-in
  // interop test below signs in through the real, unmodified `SignInCommand`
  // / `verifyPassword`, so the stored credential must actually correspond to
  // the submitted password.
  const createCommandWithRealHashing = (): CreateMemberCommand =>
    new CreateMemberCommand(
      accessCurrentUserRepository,
      roleLifecycleRepository,
      memberLifecycleRepository,
      authenticationRepository,
      (password: string) =>
        hashPassword(password, {
          cost: 1_024,
          blockSize: 8,
          parallelization: 1,
          keyLength: 32,
          maxMemory: 4 * 1024 * 1024,
        }),
      {
        identityId: () => newMemberId,
        now: () => now,
      },
    );

  beforeAll(async () => {
    await dataSource.initialize();
    // Real, already-applied migrations (e.g.
    // `GrantUsersManagementPermissions`) seed baseline `permissions` rows
    // (including `USERS:CREATE`) that would otherwise collide with this
    // suite's own catalogue seeding — every catalogue-owning integration
    // suite in this repo (e.g. `MemberLifecycleRepository`'s) truncates
    // `permissions` in its own `afterEach`, so start from that same clean
    // slate here too, regardless of what ran before this suite.
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts, permissions CASCADE',
    );
  });

  beforeEach(() => {
    newMemberId = randomUUID();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const permissionCatalogue = [USERS_CREATE, USERS_EMAIL_UPDATE, USERS_DELETE];

  // `accounts.user_id` / `users.account_id` form a deferred circular FK pair,
  // so both inserts must land inside one statement/transaction.
  const seedIdentity = async (
    userId: string,
    normalizedEmail: string,
  ): Promise<void> => {
    await dataSource.transaction(async (manager) => {
      await manager.insert(AccountEntity, {
        id: userId,
        userId,
        normalizedEmail,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: now,
        updatedAt: now,
      });
      await manager.insert(UserEntity, {
        id: userId,
        accountId: userId,
        createdAt: now,
        updatedAt: now,
      });
    });
  };

  const seedBaseline = async (): Promise<void> => {
    const manager = dataSource.manager;

    await manager.getRepository(WarehouseEntity).insert([
      { id: warehouseAId, name: 'Warehouse A', createdAt: now, updatedAt: now },
      { id: warehouseBId, name: 'Warehouse B', createdAt: now, updatedAt: now },
    ]);

    await manager.getRepository(PermissionEntity).insert(
      permissionCatalogue.map((id) => ({
        id,
        label: id,
        kind: 'assignable' as const,
        createdAt: now,
        updatedAt: now,
      })),
    );

    await manager.getRepository(RoleEntity).insert([
      {
        id: actorRoleId,
        warehouseId: warehouseAId,
        name: 'Actor role',
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
        name: 'Warehouse B role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: permissiveCustomRoleId,
        warehouseId: warehouseAId,
        name: 'Permissive custom role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: overReachingCustomRoleId,
        warehouseId: warehouseAId,
        name: 'Over-reaching custom role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Actor holds USERS:CREATE and USERS:EMAIL_UPDATE, but never USERS:DELETE.
    await manager.getRepository(RolePermissionEntity).insert([
      {
        roleId: actorRoleId,
        permissionId: USERS_CREATE,
        roleKind: 'custom',
        permissionKind: 'assignable',
      },
      {
        roleId: actorRoleId,
        permissionId: USERS_EMAIL_UPDATE,
        roleKind: 'custom',
        permissionKind: 'assignable',
      },
      // permissiveCustomRoleId grants only USERS:EMAIL_UPDATE — a subset of
      // the actor's own Permissions (AC-01 happy path).
      {
        roleId: permissiveCustomRoleId,
        permissionId: USERS_EMAIL_UPDATE,
        roleKind: 'custom',
        permissionKind: 'assignable',
      },
      // overReachingCustomRoleId grants USERS:DELETE, which the actor does
      // not hold (AC-16).
      {
        roleId: overReachingCustomRoleId,
        permissionId: USERS_DELETE,
        roleKind: 'custom',
        permissionKind: 'assignable',
      },
    ]);

    await seedIdentity(actorId, 'actor@example.test');
    await manager.getRepository(WarehouseMembershipEntity).insert({
      userId: actorId,
      warehouseId: warehouseAId,
      roleId: actorRoleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
  };

  const actor = () =>
    accessCurrentUser({
      userId: actorId,
      warehouseId: warehouseAId,
      roleId: actorRoleId,
      roleKind: 'custom',
      permissionId: USERS_CREATE,
    });

  const persistedCounts = async (): Promise<{
    accounts: string;
    users: string;
    memberships: string;
  }> => {
    const [row] = await dataSource.query<
      { accounts: string; users: string; memberships: string }[]
    >(
      `SELECT
        (SELECT count(*) FROM accounts) AS accounts,
        (SELECT count(*) FROM users) AS users,
        (SELECT count(*) FROM warehouse_memberships) AS memberships`,
    );
    return row;
  };

  it('AC-01: creates a new Warehouse Member with a custom Role no more permissive than the actor', async () => {
    await seedBaseline();

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor(), {
        email: validEmail,
        password: validPassword,
        roleId: permissiveCustomRoleId,
      }),
    );

    expect(result).toMatchObject({
      id: newMemberId,
      email: validEmail,
      roleId: permissiveCustomRoleId,
    });

    const membership = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId: newMemberId });
    expect(membership).toMatchObject({
      warehouseId: warehouseAId,
      roleId: permissiveCustomRoleId,
      roleKind: 'custom',
    });

    const sessions = await dataSource.query(
      'SELECT count(*) FROM sessions WHERE account_id = $1',
      [newMemberId],
    );
    expect(sessions).toEqual([{ count: '0' }]);
  });

  it('AC-02: rejects an unsupported email and creates nothing', async () => {
    await seedBaseline();
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(), {
          email: 'not-an-email',
          password: validPassword,
          roleId: permissiveCustomRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_INPUT });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('AC-02: rejects a password outside the accepted length and creates nothing', async () => {
    await seedBaseline();
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(), {
          email: validEmail,
          password: 'short',
          roleId: permissiveCustomRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_INPUT });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('AC-05: rejects creation when the email is already registered anywhere in the system', async () => {
    await seedBaseline();
    await seedIdentity(uuid('500000000001'), validEmail);
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(), {
          email: validEmail,
          password: validPassword,
          roleId: permissiveCustomRoleId,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED,
    });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('AC-09: denies creation with a missing Role without disclosing existence', async () => {
    await seedBaseline();
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(), {
          email: validEmail,
          password: validPassword,
          roleId: uuid('900000000001'),
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_ROLE_UNAVAILABLE });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('AC-09: denies creation with a Role belonging to a different Warehouse without disclosing existence', async () => {
    await seedBaseline();
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(), {
          email: validEmail,
          password: validPassword,
          roleId: crossWarehouseRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.ACCESS_ROLE_UNAVAILABLE });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('AC-20: denies creation when the reserved Warehouse Manager Role is selected', async () => {
    await seedBaseline();
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(), {
          email: validEmail,
          password: validPassword,
          roleId: managerRoleId,
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.USERS_RESERVED_ROLE_SELECTION,
    });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it("AC-16: denies creation when the selected Role's Permissions exceed the actor's own", async () => {
    await seedBaseline();
    const before = await persistedCounts();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(), {
          email: validEmail,
          password: validPassword,
          roleId: overReachingCustomRoleId,
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.USERS_PERMISSION_EXCEEDED });

    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('AC-12/DoD: atomic rollback — an injected failure on the Warehouse Membership insert leaves no identity behind', async () => {
    await seedBaseline();
    const before = await persistedCounts();

    await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_membership_insert()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'injected membership-insert failure';
      END;
      $$;
      CREATE TRIGGER fail_membership_insert
      BEFORE INSERT ON warehouse_memberships
      FOR EACH ROW EXECUTE FUNCTION fail_membership_insert();
    `);

    try {
      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(actor(), {
            email: validEmail,
            password: validPassword,
            roleId: permissiveCustomRoleId,
          }),
        ),
      ).rejects.toBeDefined();
    } finally {
      await dataSource.query(
        'DROP TRIGGER IF EXISTS fail_membership_insert ON warehouse_memberships',
      );
      await dataSource.query('DROP FUNCTION IF EXISTS fail_membership_insert');
    }

    // No partial identity/account/user/membership row survives the rollback.
    await expect(persistedCounts()).resolves.toEqual(before);
  });

  it('DoD: a newly created member can sign in immediately with their initial email and password (US-05 / AC-12), via the existing unchanged sign-in command', async () => {
    await seedBaseline();

    await transactions.executeInTransaction({}, () =>
      createCommandWithRealHashing().execute(actor(), {
        email: validEmail,
        password: validPassword,
        roleId: permissiveCustomRoleId,
      }),
    );

    const signIn = new SignInCommand(authenticationRepository);
    const signedIn = await signIn.execute({
      email: validEmail,
      password: validPassword,
    });

    expect(signedIn.userId).toBe(newMemberId);

    const access =
      await accessCurrentUserRepository.resolveCurrentAccess(newMemberId);
    expect(access).toMatchObject({
      warehouseId: warehouseAId,
      roleId: permissiveCustomRoleId,
      permissionIds: [USERS_EMAIL_UPDATE],
    });
  });
});
