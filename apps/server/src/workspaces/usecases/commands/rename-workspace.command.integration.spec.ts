import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceLifecycleRepository } from 'shared/domain/repositories/workspace-lifecycle.repository';
import {
  buildWorkspace,
  persistWorkspaceGraph,
} from 'test/factories/entity-factories';
// `RenameWorkspaceCommand` does not exist yet — this is the RED step for
// T15. The implementer creates it at this path per sad.md §6.2a and
// workspace-identity-and-reads.md, coordinating `WorkspaceLifecycleRepository`
// (mirroring `WarehouseLifecycleRepository` per data-model.md "Repository
// boundaries") to record the trimmed, non-normalized name.
import { RenameWorkspaceCommand } from 'workspaces/usecases/commands/rename-workspace.command';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

describeIntegration('RenameWorkspaceCommand', () => {
  // Registers the transaction storage `getEntityManager` reads, so the
  // repository joins whatever ambient transaction a caller opens; none of
  // the tests below open one, so every repository call reaches
  // `dataSource.manager` directly.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- registers ambient transaction storage as a side effect of construction
  const context = new DbTransactionContext(dataSource);
  const workspaceLifecycleRepository = new WorkspaceLifecycleRepository(
    dataSource,
  );

  const createCommand = (): RenameWorkspaceCommand =>
    new RenameWorkspaceCommand(workspaceLifecycleRepository);

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, warehouses, workspace_memberships, workspace_role_permissions, workspace_roles, workspace_permissions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const currentUserFor = (workspaceId: string): WorkspaceCurrentUser => ({
    userId: '00000000-0000-4000-8000-000000000900',
    workspaceId,
    workspaceRoleId: '00000000-0000-4000-8000-000000000901',
    workspaceRoleKind: 'workspace_owner',
    permissionId: WorkspacePermissionId.WORKSPACE_RENAME,
  });

  const findStoredName = (workspaceId: string): Promise<string | null> =>
    dataSource.manager
      .getRepository(WorkspaceEntity)
      .findOneByOrFail({ id: workspaceId })
      .then((workspace) => workspace.name);

  it('sets a name on an unnamed Workspace, replacing the placeholder (AC-29)', async () => {
    const { workspaceId } = await persistWorkspaceGraph();
    await expect(findStoredName(workspaceId)).resolves.toBeNull();

    const result = await createCommand().execute(currentUserFor(workspaceId), {
      name: '  Приймальний Склад é  ',
    });

    expect(result).toEqual({
      id: workspaceId,
      name: 'Приймальний Склад é',
    });
    await expect(findStoredName(workspaceId)).resolves.toBe(
      'Приймальний Склад é',
    );
  });

  it('changes an already-named Workspace to a new trimmed, non-normalized name (AC-29)', async () => {
    const { workspaceId } = await persistWorkspaceGraph({
      name: 'Original Name',
    });

    const result = await createCommand().execute(currentUserFor(workspaceId), {
      name: '  Renamed Workspace  ',
    });

    expect(result).toEqual({ id: workspaceId, name: 'Renamed Workspace' });
    await expect(findStoredName(workspaceId)).resolves.toBe(
      'Renamed Workspace',
    );
  });

  it('permits a name that duplicates another Workspace’s name (AC-29)', async () => {
    const first = await persistWorkspaceGraph({ name: 'Shared Name' });
    const second = await persistWorkspaceGraph();

    const result = await createCommand().execute(
      currentUserFor(second.workspaceId),
      { name: 'Shared Name' },
    );

    expect(result).toEqual({
      id: second.workspaceId,
      name: 'Shared Name',
    });
    await expect(findStoredName(first.workspaceId)).resolves.toBe(
      'Shared Name',
    );
  });

  it.each([
    ['empty after trimming', '   '],
    // 100 letters plus a trailing astral emoji: 101 grapheme clusters but
    // 102 UTF-16 code units, so a correct rejection here proves the check
    // counts user-perceived characters rather than code units (AC-29a).
    ['over 100 user-perceived characters', `${'a'.repeat(100)}\u{1F4BC}`],
    ['carrying a control or format character', 'Valid​Name'],
  ] as const)(
    'rejects a Workspace name %s and leaves the existing name untouched (AC-29a)',
    async (_case, invalidName) => {
      const { workspaceId } = await persistWorkspaceGraph({
        name: 'Existing Name',
      });

      await expect(
        createCommand().execute(currentUserFor(workspaceId), {
          name: invalidName,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_INVALID_INPUT });
      await expect(findStoredName(workspaceId)).resolves.toBe('Existing Name');
    },
  );

  it('rejects an empty-after-trim name on an unnamed Workspace, leaving it unnamed (AC-29a)', async () => {
    const { workspaceId } = await persistWorkspaceGraph();

    await expect(
      createCommand().execute(currentUserFor(workspaceId), { name: '   ' }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKSPACE_INVALID_INPUT });
    await expect(findStoredName(workspaceId)).resolves.toBeNull();
  });

  it('names which specific rule was broken, distinctly per violation (AC-29a)', async () => {
    const { workspaceId } = await persistWorkspaceGraph({
      name: 'Existing Name',
    });

    const rules = new Set<string>();
    for (const invalidName of [
      '   ',
      `${'a'.repeat(100)}\u{1F4BC}`,
      'Valid​Name',
    ]) {
      try {
        await createCommand().execute(currentUserFor(workspaceId), {
          name: invalidName,
        });
        throw new Error('expected rejection did not occur');
      } catch (error) {
        expect(error).toMatchObject({
          code: ErrorCode.WORKSPACE_INVALID_INPUT,
        });
        const details = (error as { details?: { rule?: unknown } }).details;
        expect(typeof details?.rule).toBe('string');
        rules.add(details?.rule as string);
      }
    }

    // Three distinct broken rules produce three distinct explanations, so
    // the member is told *which* rule failed rather than one generic
    // rejection (AC-29a).
    expect(rules.size).toBe(3);
  });

  it("constrains the rename to the actor's own Workspace via principal.workspaceId, never a caller-supplied target", async () => {
    const { workspaceId } = await persistWorkspaceGraph();
    const other = buildWorkspace({ name: 'Untouched Workspace' });
    await dataSource.manager.getRepository(WorkspaceEntity).insert(other);

    await createCommand().execute(currentUserFor(workspaceId), {
      name: 'My Workspace',
    });

    await expect(findStoredName(other.id as string)).resolves.toBe(
      'Untouched Workspace',
    );
  });
});
