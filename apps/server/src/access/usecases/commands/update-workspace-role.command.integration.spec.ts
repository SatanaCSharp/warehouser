import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
// `UpdateWorkspaceRoleCommand` does not exist yet — this is the RED step for
// T16. Expected to accept the caller's `WorkspaceCurrentUser` plus
// `{ roleId, name, permissionIds }`, prove the target Role belongs to
// `principal.workspaceId` itself (never disclosing a cross-Workspace target,
// AC-10-style), refuse to touch the protected Owner Role (AC-16), validate
// the name (T4/T3 rules, AC-15/AC-15a) and the submitted Permission ids
// against `WorkspaceReadRepository.listWorkspacePermissionCatalogue()`
// (assignable-only, AC-18), then replace the name and/or Permission
// membership via `WorkspaceRoleLifecycleRepository` — mirroring
// `access/usecases/commands/update-role.command.ts` at the Workspace
// authority level (sad.md §6.7).
import { UpdateWorkspaceRoleCommand } from 'access/usecases/commands/update-workspace-role.command';
import { workspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';
import {
  buildWorkspaceRole,
  persistWorkspaceGraph,
} from 'test/factories/entity-factories';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

// Same grapheme composed (U+00E9) vs. decomposed (e + U+0301) — storing must
// not fold one into the other (AC-14a).
const COMPOSED_E_ACUTE = `Caf${String.fromCodePoint(0x00e9)}`;

const context = new DbTransactionContext(dataSource);
const transactions = new DbTransactionService(dataSource, context);
const workspaceRoleLifecycleRepository = new WorkspaceRoleLifecycleRepository(
  dataSource,
);
const workspaceReadRepository = new WorkspaceReadRepository(dataSource);

const createCommand = (): UpdateWorkspaceRoleCommand =>
  new UpdateWorkspaceRoleCommand(
    workspaceRoleLifecycleRepository,
    workspaceReadRepository,
  );

const actor = (workspaceId: string) =>
  workspaceCurrentUser({
    userId: randomUUID(),
    workspaceId,
    workspaceRoleId: randomUUID(),
    workspaceRoleKind: 'custom',
    permissionId: WorkspacePermissionId.WORKSPACE_ROLES_UPDATE,
  });

const insertCustomRole = async (
  workspaceId: string,
  overrides: Parameters<typeof buildWorkspaceRole>[0] = { workspaceId },
): Promise<string> => {
  const role = buildWorkspaceRole({ workspaceId, ...overrides });
  await dataSource.manager.getRepository(WorkspaceRoleEntity).insert(role);
  return role.id as string;
};

const grantPermission = async (
  roleId: string,
  permissionId: string,
): Promise<void> => {
  await dataSource.manager.getRepository(WorkspaceRolePermissionEntity).insert({
    workspaceRoleId: roleId,
    workspacePermissionId: permissionId,
    workspaceRoleKind: 'custom',
    workspacePermissionKind: 'assignable',
  });
};

const storedRole = (roleId: string): Promise<WorkspaceRoleEntity | null> =>
  dataSource.manager
    .getRepository(WorkspaceRoleEntity)
    .findOneBy({ id: roleId });

const storedPermissionIds = async (roleId: string): Promise<string[]> => {
  const rows = await dataSource.manager
    .getRepository(WorkspaceRolePermissionEntity)
    .findBy({ workspaceRoleId: roleId });
  return rows.map((row) => row.workspacePermissionId).sort();
};

const TRUNCATE_STATEMENT =
  // Never truncates `workspace_permissions` — restored globally by
  // `src/test/restore-catalogues.setup.ts`.
  'TRUNCATE warehouse_memberships, warehouses, workspace_memberships, workspace_role_permissions, workspace_roles, users, accounts, workspaces CASCADE';

// One shared connection lifecycle for the whole file (top-level hooks,
// mirroring `src/test/restore-catalogues.setup.ts`'s own conditional
// registration), so splitting the suite below into two `describe` blocks
// — purely to keep each body under the repo's `max-lines-per-function` cap —
// does not initialize/destroy `dataSource` twice.
if (process.env.RUN_INTEGRATION === '1') {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(TRUNCATE_STATEMENT);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });
}

describeIntegration(
  'UpdateWorkspaceRoleCommand — naming and membership',
  () => {
    it('changes the Permission membership to a different set, used for subsequent authorization decisions (AC-14a)', async () => {
      const { workspaceId } = await persistWorkspaceGraph();
      const roleId = await insertCustomRole(workspaceId, {
        workspaceId,
        name: 'Site Administrator',
      });
      await grantPermission(roleId, 'WAREHOUSES:WATCH');

      const result = await transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          roleId,
          name: 'Site Administrator',
          permissionIds: ['WAREHOUSES:CREATE', 'WORKSPACE_ROLES:WATCH'],
        }),
      );

      expect(result.permissionIds.slice().sort()).toEqual([
        'WAREHOUSES:CREATE',
        'WORKSPACE_ROLES:WATCH',
      ]);
      await expect(storedPermissionIds(roleId)).resolves.toEqual([
        'WAREHOUSES:CREATE',
        'WORKSPACE_ROLES:WATCH',
      ]);
    });

    it('changes the Permission membership to the empty set (AC-14a)', async () => {
      const { workspaceId } = await persistWorkspaceGraph();
      const roleId = await insertCustomRole(workspaceId, {
        workspaceId,
        name: 'Site Administrator',
      });
      await grantPermission(roleId, 'WAREHOUSES:WATCH');

      const result = await transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          roleId,
          name: 'Site Administrator',
          permissionIds: [],
        }),
      );

      expect(result.permissionIds).toEqual([]);
      await expect(storedPermissionIds(roleId)).resolves.toEqual([]);
    });

    it('renames the Role, preserving a submitted name’s Unicode without normalization (AC-14a)', async () => {
      const { workspaceId } = await persistWorkspaceGraph();
      const roleId = await insertCustomRole(workspaceId, {
        workspaceId,
        name: 'Original Role Name',
      });

      const result = await transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          roleId,
          name: `  ${COMPOSED_E_ACUTE}  `,
          permissionIds: [],
        }),
      );

      expect(result.name).toBe(COMPOSED_E_ACUTE);
      const stored = await storedRole(roleId);
      expect(stored?.name).toBe(COMPOSED_E_ACUTE);
    });

    it('rejects an exact name conflict within the Workspace but accepts a differently cased name (AC-15)', async () => {
      const { workspaceId } = await persistWorkspaceGraph();
      const takenName = 'Site Administrator';
      await insertCustomRole(workspaceId, { workspaceId, name: takenName });
      const roleId = await insertCustomRole(workspaceId, {
        workspaceId,
        name: 'Warehouse Coordinator',
      });

      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(actor(workspaceId), {
            roleId,
            name: takenName,
            permissionIds: [],
          }),
        ),
      ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_ROLE_NAME_CONFLICT });

      // Differently cased is a distinct name (AC-15), so it is accepted.
      const differentlyCased = await transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          roleId,
          name: 'site administrator',
          permissionIds: [],
        }),
      );
      expect(differentlyCased.name).toBe('site administrator');
    });

    it.each([
      ['empty after trimming', '   ', 'empty'],
      [
        'over 100 user-perceived characters',
        `${'a'.repeat(100)}\u{1F4BC}`,
        'grapheme_length',
      ],
      [
        'carrying a control or format character',
        'Valid​Name',
        'control_or_format_character',
      ],
    ] as const)(
      'rejects a Workspace Role name %s, naming the broken rule, and leaves the Role untouched (AC-15a)',
      async (_case, invalidName, rule) => {
        const { workspaceId } = await persistWorkspaceGraph();
        const roleId = await insertCustomRole(workspaceId, {
          workspaceId,
          name: 'Existing Name',
        });

        await expect(
          transactions.executeInTransaction({}, () =>
            createCommand().execute(actor(workspaceId), {
              roleId,
              name: invalidName,
              permissionIds: [],
            }),
          ),
        ).rejects.toMatchObject({
          code: ErrorCode.WORKSPACE_INVALID_INPUT,
          details: { field: 'name', rule },
        });

        const untouched = await storedRole(roleId);
        expect(untouched?.name).toBe('Existing Name');
      },
    );
  },
);

describeIntegration('UpdateWorkspaceRoleCommand — protections', () => {
  it('rejects renaming the protected Workspace Owner Role, explaining it is system-managed (AC-16)', async () => {
    const { workspaceId, ownerRoleId } = await persistWorkspaceGraph();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          roleId: ownerRoleId,
          name: 'Hijacked Owner Role',
          permissionIds: [],
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_PROTECTED_ROLE });

    const untouched = await storedRole(ownerRoleId);
    expect(untouched?.name).toBe('Workspace Owner');
  });

  it('rejects re-permissioning the protected Workspace Owner Role, explaining it is system-managed (AC-16)', async () => {
    const { workspaceId, ownerRoleId } = await persistWorkspaceGraph();
    const before = await storedPermissionIds(ownerRoleId);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          roleId: ownerRoleId,
          name: 'Workspace Owner',
          permissionIds: ['WAREHOUSES:WATCH'],
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_PROTECTED_ROLE });

    await expect(storedPermissionIds(ownerRoleId)).resolves.toEqual(before);
  });

  it('rejects a Workspace Permission absent from the system catalogue and leaves the Role untouched (AC-18)', async () => {
    const { workspaceId } = await persistWorkspaceGraph();
    const roleId = await insertCustomRole(workspaceId, {
      workspaceId,
      name: 'Site Administrator',
    });

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          roleId,
          name: 'Site Administrator',
          permissionIds: ['UNKNOWN_MODULE:UNKNOWN_ACTION'],
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_SYSTEM_MANAGED_PERMISSION,
    });

    await expect(storedPermissionIds(roleId)).resolves.toEqual([]);
  });

  it('rejects the reserved WORKSPACE_OWNER_ROLE:REASSIGN Permission and leaves the Role untouched (AC-18)', async () => {
    const { workspaceId } = await persistWorkspaceGraph();
    const roleId = await insertCustomRole(workspaceId, {
      workspaceId,
      name: 'Site Administrator',
    });

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          roleId,
          name: 'Site Administrator',
          permissionIds: ['WORKSPACE_OWNER_ROLE:REASSIGN'],
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_SYSTEM_MANAGED_PERMISSION,
    });

    await expect(storedPermissionIds(roleId)).resolves.toEqual([]);
  });

  it('denies updating a Role of another Workspace indistinguishably from a missing Role, changing nothing', async () => {
    const own = await persistWorkspaceGraph();
    const other = await persistWorkspaceGraph();
    const otherRoleId = await insertCustomRole(other.workspaceId, {
      workspaceId: other.workspaceId,
      name: 'Other Workspace’s Role',
    });
    const missingRoleId = randomUUID();

    const crossWorkspaceError = await transactions
      .executeInTransaction({}, () =>
        createCommand().execute(actor(own.workspaceId), {
          roleId: otherRoleId,
          name: 'Hijacked',
          permissionIds: [],
        }),
      )
      .catch((error: unknown) => error);

    const missingTargetError = await transactions
      .executeInTransaction({}, () =>
        createCommand().execute(actor(own.workspaceId), {
          roleId: missingRoleId,
          name: 'Hijacked',
          permissionIds: [],
        }),
      )
      .catch((error: unknown) => error);

    expect(crossWorkspaceError).toMatchObject({
      code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    });
    // Same failure shape for "exists in another Workspace" and "does not
    // exist at all" — existence is never disclosed.
    expect(crossWorkspaceError).toEqual(missingTargetError);

    const untouched = await storedRole(otherRoleId);
    expect(untouched?.name).toBe('Other Workspace’s Role');
  });
});
