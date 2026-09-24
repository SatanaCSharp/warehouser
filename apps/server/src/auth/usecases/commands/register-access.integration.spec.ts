import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { AuthRegistrationService } from 'auth/domain/services/auth-registration.service';
import { RegisterCommand } from 'auth/usecases/commands/register.command';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
// `WorkspaceProvisioningService` does not exist yet (T14): this import is the
// RED for AC-01/AC-02. sad.md §6.1/§4: `RegisterCommand` stops calling
// `ProvisionInitialAccessCommand` directly and instead calls this
// `workspaces` provisioning service inside its own `@Transactional()`
// boundary, which creates the Workspace, its protected Owner Role and
// initial Workspace Permission membership, the Owner's Workspace membership,
// then the first Warehouse — delegating that Warehouse's protected Manager
// Role and membership to `access`'s `ProvisionInitialAccessCommand` by
// passing only a `warehouseId` and a `userId` (never a Workspace concept).
import { WorkspaceProvisioningService } from 'workspaces/domain/services/workspace-provisioning.service';

// spec.md §1: the full initial Workspace Owner Workspace Permission set — read from the seeded
// `workspace_permissions` catalogue rather than restated here.
//
// This file used to carry the sixteen identifiers of migration `01` as a literal, and that literal
// is what let the defect ship twice: `WAREHOUSES:ADDRESS_UPDATE` (`delivery-addresses` AC-10) and
// `WAREHOUSE_PERFORMANCE:WATCH` (`dashboards` AC-21/AC-21a) were each seeded, backfilled onto the
// `workspace_owner` Roles that already existed, and left out of provisioning, while this suite went
// on comparing provisioning against its own stale copy and passing. Reading the catalogue the
// migrations actually built is what makes the next seeded Permission fail here until provisioning
// grants it — with nothing in this file to edit.
//
// The template this tier restores is migrated, and `workspace_permissions` is deliberately not
// truncated between cases (see `afterEach`), so these rows are the real catalogue.
const readSeededWorkspacePermissionIds = async (): Promise<string[]> => {
  const rows = (await dataSource.query(
    'SELECT id FROM workspace_permissions ORDER BY id',
  )) as { readonly id: string }[];

  return rows.map(({ id }) => id);
};

const readOwnerGrantedPermissionIds = async (
  workspaceRoleId: string,
): Promise<string[]> => {
  const rows = (await dataSource.query(
    `SELECT workspace_permission_id FROM workspace_role_permissions
     WHERE workspace_role_id = $1 ORDER BY workspace_permission_id`,
    [workspaceRoleId],
  )) as { readonly workspace_permission_id: string }[];

  return rows.map((row) => row.workspace_permission_id);
};

// Every table registration bootstrap writes to, in the order sad.md §6.1's
// sequence diagram persists them. Used both for row-count assertions (AC-01)
// and as the per-stage failure-injection matrix (AC-02).
const REGISTRATION_TABLES = [
  'accounts',
  'users',
  'sessions',
  'workspaces',
  'workspace_roles',
  'workspace_role_permissions',
  'workspace_memberships',
  'warehouses',
  'roles',
  'role_permissions',
  'warehouse_memberships',
] as const;

const countsQuery = `SELECT
  (SELECT count(*) FROM accounts) AS accounts,
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM sessions) AS sessions,
  (SELECT count(*) FROM workspaces) AS workspaces,
  (SELECT count(*) FROM workspace_roles) AS workspace_roles,
  (SELECT count(*) FROM workspace_role_permissions) AS workspace_role_permissions,
  (SELECT count(*) FROM workspace_memberships) AS workspace_memberships,
  (SELECT count(*) FROM warehouses) AS warehouses,
  (SELECT count(*) FROM roles) AS roles,
  (SELECT count(*) FROM role_permissions) AS role_permissions,
  (SELECT count(*) FROM warehouse_memberships) AS warehouse_memberships`;

const zeroCounts = Object.fromEntries(
  REGISTRATION_TABLES.map((table) => [table, '0']),
);

vi.mock('shared/domain/security/password-hashing', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('shared/domain/security/password-hashing')
    >();

  return {
    ...actual,
    hashPassword: vi.fn(() =>
      Promise.resolve({
        algorithm: 'scrypt' as const,
        hash: 'synthetic-hash',
        parameters: { cost: 1_024 },
      }),
    ),
  };
});

describe('RegisterCommand workspace provisioning transaction', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const authentication = new AuthenticationRepository(dataSource);
  const registrations = new AuthRegistrationService(authentication);
  const workspaceProvisioning = new WorkspaceProvisioningService(
    new WorkspaceProvisioningRepository(dataSource),
    new ProvisionInitialAccessCommand(
      new AccessProvisioningRepository(dataSource),
    ),
  );

  const createCommand = (
    provisioning: WorkspaceProvisioningService = workspaceProvisioning,
  ): RegisterCommand =>
    new RegisterCommand(authentication, registrations, provisioning);

  const register = () =>
    transactions.executeInTransaction({}, () =>
      createCommand().execute({
        email: 'person@example.test',
        password: 'password',
        warehouseName: 'Склад',
      }),
    );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    // `workspace_permissions` and `permissions` are catalogue tables seeded
    // by migrations and read (never written) by this flow, so they are
    // deliberately left out — matching this suite's pre-existing convention
    // of not truncating the `permissions` catalogue either.
    await dataSource.query(
      `TRUNCATE warehouse_memberships, role_permissions, roles, warehouses,
                workspace_memberships, workspace_role_permissions, workspace_roles, workspaces,
                sessions, users, accounts CASCADE`,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it(
    'creates exactly one linked Account, User, unnamed Workspace, protected Workspace Owner ' +
      'Role with its full initial Permission set, Workspace Role assignment, Warehouse, ' +
      'protected Warehouse Manager Role, Warehouse membership, and session, as one outcome, ' +
      'and confirms immediate access (AC-01)',
    async () => {
      const seededCatalogue = await readSeededWorkspacePermissionIds();
      const result = await register();

      expect(result.workspace).toMatchObject({ name: null });
      expect(result.access.roleKind).toBe('warehouse_manager');

      await expect(dataSource.query(countsQuery)).resolves.toEqual([
        {
          accounts: '1',
          users: '1',
          sessions: '1',
          workspaces: '1',
          workspace_roles: '1',
          workspace_role_permissions: String(seededCatalogue.length),
          workspace_memberships: '1',
          warehouses: '1',
          roles: '1',
          role_permissions: String(result.access.permissionIds.length),
          warehouse_memberships: '1',
        },
      ]);

      expect([...result.workspacePermissionIds].sort()).toEqual(
        seededCatalogue,
      );

      const [userRow] = await dataSource.query(
        'SELECT workspace_id FROM users WHERE id = $1',
        [result.userId],
      );
      expect(userRow.workspace_id).toBe(result.workspace.id);

      const [membershipRow] = await dataSource.query(
        'SELECT role_kind FROM warehouse_memberships WHERE user_id = $1 AND warehouse_id = $2',
        [result.userId, result.access.warehouseId],
      );
      expect(membershipRow).toMatchObject({ role_kind: 'warehouse_manager' });

      const [ownerMembershipRow] = await dataSource.query(
        'SELECT workspace_role_kind FROM workspace_memberships WHERE user_id = $1 AND workspace_id = $2',
        [result.userId, result.workspace.id],
      );
      expect(ownerMembershipRow).toMatchObject({
        workspace_role_kind: 'workspace_owner',
      });
    },
  );

  it(
    'grants the newly provisioned Workspace Owner Role every Permission the migrations seeded, ' +
      'so a Permission added to the catalogue cannot reach existing Owners alone ' +
      '(delivery-addresses AC-10, dashboards AC-21a)',
    async () => {
      // The regression this case exists for, and the reason it reads both sides from the database
      // rather than from a list: a grant migration seeds a Workspace Permission and backfills the
      // `workspace_owner` Roles that already exist, which leaves the Owner of the *next* registered
      // Workspace short of it unless provisioning grants it too. `WAREHOUSES:ADDRESS_UPDATE` and
      // `WAREHOUSE_PERFORMANCE:WATCH` both shipped that way — the second one denied every new
      // Owner their own Workspace Dashboard (`403 workspace.denied` on all four Panels).
      //
      // Nothing here names a Permission, so the next seeded one is covered the moment its
      // migration joins the template: it appears on the left of this comparison without anyone
      // editing this file, and fails until provisioning puts it on the right.
      const seededCatalogue = await readSeededWorkspacePermissionIds();
      const result = await register();

      const [ownerRoleRow] = (await dataSource.query(
        `SELECT id FROM workspace_roles WHERE workspace_id = $1 AND kind = 'workspace_owner'`,
        [result.workspace.id],
      )) as { readonly id: string }[];

      await expect(
        readOwnerGrantedPermissionIds(ownerRoleRow.id),
      ).resolves.toEqual(seededCatalogue);
    },
  );

  it(
    "sets the registrant's users.workspace_id at creation and never re-derives it from " +
      'Warehouse memberships (spec.md §1, second boundary)',
    async () => {
      const result = await register();

      await dataSource.query(
        'DELETE FROM warehouse_memberships WHERE user_id = $1',
        [result.userId],
      );

      const [row] = await dataSource.query(
        'SELECT workspace_id FROM users WHERE id = $1',
        [result.userId],
      );
      expect(row.workspace_id).toBe(result.workspace.id);
    },
  );

  it('rolls identity and session back when Workspace provisioning fails', async () => {
    const unavailableProvisioning = {
      provisionRegistration: vi
        .fn()
        .mockRejectedValue(new Error('workspace provisioning unavailable')),
    } as unknown as WorkspaceProvisioningService;

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand(unavailableProvisioning).execute({
          email: 'person@example.test',
          password: 'password',
          warehouseName: 'Склад',
        }),
      ),
    ).rejects.toMatchObject({ code: 'auth.registration_unavailable' });

    await expect(dataSource.query(countsQuery)).resolves.toEqual([zeroCounts]);
  });

  it.each(REGISTRATION_TABLES)(
    // Injecting the failure at every stage — including the *last* one,
    // `warehouse_memberships` — is also the AC-02 "second transaction" catch:
    // if Workspace provisioning ever opened its own transaction instead of
    // propagating into `RegisterCommand`'s, the earlier Workspace/Warehouse
    // rows created before the failing stage would still be committed and
    // this assertion (which checks *every* table, not just the failing one)
    // would catch them surviving.
    'leaves no registration state when %s persistence fails, none of those objects or access rights exist, and the Visitor is told registration did not complete (AC-02)',
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
        await expect(register()).rejects.toMatchObject({
          code: 'auth.registration_unavailable',
        });
      } finally {
        await dataSource.query(
          `DROP TRIGGER IF EXISTS fail_registration_stage ON ${table}`,
        );
        await dataSource.query(
          'DROP FUNCTION IF EXISTS fail_registration_stage',
        );
      }

      await expect(dataSource.query(countsQuery)).resolves.toEqual([
        zeroCounts,
      ]);
    },
  );
});
