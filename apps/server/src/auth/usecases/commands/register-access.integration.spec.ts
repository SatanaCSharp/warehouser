import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { AuthRegistrationService } from 'auth/domain/services/auth-registration.service';
import { RegisterCommand } from 'auth/usecases/commands/register.command';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const identityId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const warehouseId = '00000000-0000-4000-8000-000000000003';
const roleId = '00000000-0000-4000-8000-000000000004';

describeIntegration('RegisterCommand access transaction', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const authentication = new AuthenticationRepository(dataSource);
  const registrations = new AuthRegistrationService(authentication);
  const provisioning = new ProvisionInitialAccessCommand(
    new AccessProvisioningRepository(dataSource),
    { warehouseId: () => warehouseId, roleId: () => roleId },
  );

  const createCommand = (
    access: ProvisionInitialAccessCommand = provisioning,
  ): RegisterCommand =>
    new RegisterCommand(
      authentication,
      registrations,
      access,
      () =>
        Promise.resolve({
          algorithm: 'scrypt',
          hash: 'synthetic-hash',
          parameters: { cost: 1_024 },
        }),
      () => ({ secret: 'opaque-secret', digest: Buffer.alloc(32, 1) }),
      {
        now: () => new Date('2026-08-04T12:00:00.000Z'),
        identityId: () => identityId,
        sessionId: () => sessionId,
      },
    );

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

  it('commits identity, session, Warehouse, manager grants, and membership together', async () => {
    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute({
        email: 'person@example.test',
        password: 'password',
        warehouseName: 'Склад',
      }),
    );

    expect(result.access).toMatchObject({ warehouseId, roleId });
    await expect(
      dataSource.query(
        `SELECT
          (SELECT count(*) FROM accounts) AS accounts,
          (SELECT count(*) FROM users) AS users,
          (SELECT count(*) FROM sessions) AS sessions,
          (SELECT count(*) FROM warehouses) AS warehouses,
          (SELECT count(*) FROM roles) AS roles,
          (SELECT count(*) FROM role_permissions) AS grants,
          (SELECT count(*) FROM warehouse_memberships) AS memberships`,
      ),
    ).resolves.toEqual([
      {
        accounts: '1',
        users: '1',
        sessions: '1',
        warehouses: '1',
        roles: '1',
        grants: '9',
        memberships: '1',
      },
    ]);
  });

  it('grants the newly registered Warehouse Manager Role all four USERS:* Permissions immediately, without relying on the T1 migration', async () => {
    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute({
        email: 'person@example.test',
        password: 'password',
        warehouseName: 'Склад',
      }),
    );

    const grantedUsersPermissions = await dataSource.query(
      `SELECT permission_id FROM role_permissions
       WHERE role_id = $1 AND permission_id LIKE 'USERS:%'
       ORDER BY permission_id`,
      [result.access.roleId],
    );

    expect(
      grantedUsersPermissions.map(
        (row: { permission_id: string }) => row.permission_id,
      ),
    ).toEqual([
      'USERS:CREATE',
      'USERS:DELETE',
      'USERS:EMAIL_UPDATE',
      'USERS:PASSWORD_CHANGE',
      'USERS:UPDATE',
      'USERS:WATCH',
    ]);
  });

  it('rolls identity and session back when access provisioning fails', async () => {
    const unavailableAccess = {
      execute: jest.fn().mockRejectedValue(new Error('access unavailable')),
    } as unknown as ProvisionInitialAccessCommand;

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand(unavailableAccess).execute({
          email: 'person@example.test',
          password: 'password',
          warehouseName: 'Склад',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'auth.registration_unavailable',
    });
    await expect(
      dataSource.query(
        `SELECT
          (SELECT count(*) FROM accounts) AS accounts,
          (SELECT count(*) FROM sessions) AS sessions,
          (SELECT count(*) FROM warehouses) AS warehouses`,
      ),
    ).resolves.toEqual([{ accounts: '0', sessions: '0', warehouses: '0' }]);
  });

  it.each([
    'accounts',
    'users',
    'sessions',
    'warehouses',
    'roles',
    'role_permissions',
    'warehouse_memberships',
  ])(
    'leaves no registration state when %s persistence fails',
    async (table) => {
      await dataSource.query(`
      CREATE OR REPLACE FUNCTION fail_registration_stage()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'injected registration failure';
      END;
      $$;
      CREATE TRIGGER fail_registration_stage
      BEFORE INSERT ON ${table}
      FOR EACH ROW EXECUTE FUNCTION fail_registration_stage();
    `);

      try {
        await expect(
          transactions.executeInTransaction({}, () =>
            createCommand().execute({
              email: 'person@example.test',
              password: 'password',
              warehouseName: 'Склад',
            }),
          ),
        ).rejects.toMatchObject({ code: 'auth.registration_unavailable' });
      } finally {
        await dataSource.query(
          `DROP TRIGGER IF EXISTS fail_registration_stage ON ${table}`,
        );
        await dataSource.query(
          'DROP FUNCTION IF EXISTS fail_registration_stage',
        );
      }

      await expect(
        dataSource.query(
          `SELECT
          (SELECT count(*) FROM accounts) AS accounts,
          (SELECT count(*) FROM sessions) AS sessions,
          (SELECT count(*) FROM warehouses) AS warehouses,
          (SELECT count(*) FROM warehouse_memberships) AS memberships`,
        ),
      ).resolves.toEqual([
        { accounts: '0', sessions: '0', warehouses: '0', memberships: '0' },
      ]);
    },
  );
});
