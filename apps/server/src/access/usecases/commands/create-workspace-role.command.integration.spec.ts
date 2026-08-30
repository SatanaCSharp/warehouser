import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
// `CreateWorkspaceRoleCommand` does not exist yet — this is the RED step for
// T16. Expected to accept the caller's `WorkspaceCurrentUser` plus
// `{ name, permissionIds }`, create the custom Workspace Role scoped to
// `principal.workspaceId` via `WorkspaceRoleLifecycleRepository`, validate
// the name through `AccessName` (T4/T3 rules) and the submitted Permission
// ids against `WorkspaceReadRepository.listWorkspacePermissionCatalogue()`
// (assignable-only, AC-18), mirroring `access/usecases/commands/create-role.command.ts`'s
// shape at the Workspace authority level (sad.md §6.7).
import { CreateWorkspaceRoleCommand } from 'access/usecases/commands/create-workspace-role.command';
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

// Same grapheme composed (U+00E9) vs. decomposed (e + U+0301) — storing must
// not fold one into the other (AC-14a), matching `AccessName`/
// `workspace-name.spec.ts`'s own proof of the same rule.
const COMPOSED_E_ACUTE = `Caf${String.fromCodePoint(0x00e9)}`;

describe('CreateWorkspaceRoleCommand', () => {
  // Registers the transaction storage `getEntityManager` reads, so the
  // repository joins whatever ambient transaction a caller opens.

  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const workspaceRoleLifecycleRepository = new WorkspaceRoleLifecycleRepository(
    dataSource,
  );
  const workspaceReadRepository = new WorkspaceReadRepository(dataSource);

  const createCommand = (): CreateWorkspaceRoleCommand =>
    new CreateWorkspaceRoleCommand(
      workspaceRoleLifecycleRepository,
      workspaceReadRepository,
    );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    // Never truncates `workspace_permissions` — that catalogue table is
    // restored globally by `src/test/restore-catalogues.setup.ts`.
    // Truncating it here would wipe the real catalogue for every later
    // suite in this process (this bug has already been found twice).
    await dataSource.query(
      'TRUNCATE warehouse_memberships, warehouses, workspace_memberships, workspace_role_permissions, workspace_roles, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const actor = (workspaceId: string) =>
    workspaceCurrentUser({
      userId: randomUUID(),
      workspaceId,
      workspaceRoleId: randomUUID(),
      workspaceRoleKind: 'custom',
      permissionId: WorkspacePermissionId.WORKSPACE_ROLES_CREATE,
    });

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

  it('creates a custom Workspace Role with zero Permissions, available for assignment (AC-14)', async () => {
    const { workspaceId } = await persistWorkspaceGraph();

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor(workspaceId), {
        name: 'Site Administrator',
        permissionIds: [],
      }),
    );

    expect(result).toMatchObject({
      name: 'Site Administrator',
      permissionIds: [],
    });
    const stored = await storedRole(result.id);
    expect(stored).toMatchObject({
      workspaceId,
      name: 'Site Administrator',
      kind: 'custom',
    });
    await expect(storedPermissionIds(result.id)).resolves.toEqual([]);
  });

  it('creates a custom Workspace Role with several assignable Permissions, available for assignment (AC-14)', async () => {
    const { workspaceId } = await persistWorkspaceGraph();

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor(workspaceId), {
        name: 'Warehouse Coordinator',
        permissionIds: ['WAREHOUSES:WATCH', 'WAREHOUSES:CREATE'],
      }),
    );

    expect(result.permissionIds.slice().sort()).toEqual([
      'WAREHOUSES:CREATE',
      'WAREHOUSES:WATCH',
    ]);
    await expect(storedPermissionIds(result.id)).resolves.toEqual([
      'WAREHOUSES:CREATE',
      'WAREHOUSES:WATCH',
    ]);
  });

  it('preserves a submitted name’s Unicode without normalization (AC-14)', async () => {
    const { workspaceId } = await persistWorkspaceGraph();

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor(workspaceId), {
        name: `  ${COMPOSED_E_ACUTE}  `,
        permissionIds: [],
      }),
    );

    expect(result.name).toBe(COMPOSED_E_ACUTE);
    const stored = await storedRole(result.id);
    expect(stored?.name).toBe(COMPOSED_E_ACUTE);
  });

  it('rejects an exact name conflict within the Workspace but accepts a differently cased name (AC-15)', async () => {
    const { workspaceId } = await persistWorkspaceGraph();
    const existing = buildWorkspaceRole({
      workspaceId,
      name: 'Site Administrator',
    });
    await dataSource.manager
      .getRepository(WorkspaceRoleEntity)
      .insert(existing);

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          name: 'Site Administrator',
          permissionIds: [],
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_ROLE_NAME_CONFLICT });

    // Differently cased is a distinct name (AC-15), so it is accepted.
    const differentlyCased = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor(workspaceId), {
        name: 'site administrator',
        permissionIds: [],
      }),
    );
    expect(differentlyCased.name).toBe('site administrator');
  });

  it.each([
    ['empty after trimming', '   ', 'empty'],
    // 100 letters plus a trailing astral emoji: 101 grapheme clusters but
    // 102 UTF-16 code units, so a correct rejection here proves the check
    // counts user-perceived characters rather than code units.
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
    'rejects a Workspace Role name %s, naming the broken rule (AC-15a)',
    async (_case, invalidName, rule) => {
      const { workspaceId } = await persistWorkspaceGraph();

      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(actor(workspaceId), {
            name: invalidName,
            permissionIds: [],
          }),
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.WORKSPACE_INVALID_INPUT,
        details: { field: 'name', rule },
      });

      await expect(
        dataSource.manager
          .getRepository(WorkspaceRoleEntity)
          .countBy({ workspaceId, kind: 'custom' }),
      ).resolves.toBe(0);
    },
  );

  it('rejects a Workspace Permission absent from the system catalogue and creates nothing (AC-18)', async () => {
    const { workspaceId } = await persistWorkspaceGraph();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          name: 'Unknown Permission Role',
          permissionIds: ['UNKNOWN_MODULE:UNKNOWN_ACTION'],
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_SYSTEM_MANAGED_PERMISSION,
    });

    await expect(
      dataSource.manager
        .getRepository(WorkspaceRoleEntity)
        .countBy({ workspaceId, kind: 'custom' }),
    ).resolves.toBe(0);
  });

  it('rejects the reserved WORKSPACE_OWNER_ROLE:REASSIGN Permission and creates nothing (AC-18)', async () => {
    const { workspaceId } = await persistWorkspaceGraph();

    await expect(
      transactions.executeInTransaction({}, () =>
        createCommand().execute(actor(workspaceId), {
          name: 'Aspiring Owner Role',
          permissionIds: ['WORKSPACE_OWNER_ROLE:REASSIGN'],
        }),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_SYSTEM_MANAGED_PERMISSION,
    });

    await expect(
      dataSource.manager
        .getRepository(WorkspaceRoleEntity)
        .countBy({ workspaceId, kind: 'custom' }),
    ).resolves.toBe(0);
  });
});
