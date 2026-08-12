import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { workspaceCurrentUser } from 'shared/access/workspace-current-user';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
// This command does not exist yet — this is the RED step for T20. Expected
// to accept the caller's `WorkspaceCurrentUser` plus
// `{ warehouseId, name }`, prove the target Warehouse belongs to
// `principal.workspaceId` itself (not only the transport guard), store the
// trimmed/un-normalized name via `WarehouseLifecycleRepository`, and run
// inside its own `@Transactional()` boundary (sad.md §6.4a).
import { RenameWarehouseCommand } from 'workspaces/usecases/commands/rename-warehouse.command';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-12T12:00:00.000Z');

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

// Workspace A is the actor's own Workspace; Workspace B exists only to
// prove cross-Workspace denial without disclosure (AC-10) — the actor never
// legitimately touches its Warehouse.
const workspaceAId = uuid('000000000001');
const workspaceBId = uuid('000000000002');
const warehouseAId = uuid('100000000001');
const namesakeWarehouseAId = uuid('100000000002');
const warehouseBId = uuid('100000000003');
const actorId = uuid('300000000001');
const missingWarehouseId = uuid('900000000001');

// Same grapheme composed (U+00E9) vs. decomposed (e + U+0301) — storing
// must not fold one into the other (AC-09), matching
// `AccessName`/`workspace-name.spec.ts`'s own proof of the same rule.
const COMPOSED_E_ACUTE = `Caf${String.fromCodePoint(0x00e9)}`;

describeIntegration('RenameWarehouseCommand', () => {
  const context = new DbTransactionContext(dataSource);
  const transactions = new DbTransactionService(dataSource, context);
  const warehouseLifecycleRepository = new WarehouseLifecycleRepository(
    dataSource,
  );

  const createCommand = (): RenameWarehouseCommand =>
    new RenameWarehouseCommand(warehouseLifecycleRepository);

  beforeAll(async () => {
    await dataSource.initialize();
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const seedBaseline = async (): Promise<void> => {
    const manager = dataSource.manager;

    await manager.getRepository(WorkspaceEntity).insert([
      { id: workspaceAId, name: null, createdAt: now, updatedAt: now },
      { id: workspaceBId, name: null, createdAt: now, updatedAt: now },
    ]);

    await manager.getRepository(WarehouseEntity).insert([
      {
        id: warehouseAId,
        workspaceId: workspaceAId,
        name: 'Test Warehouse North',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: namesakeWarehouseAId,
        workspaceId: workspaceAId,
        name: 'Test Warehouse South',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: warehouseBId,
        workspaceId: workspaceBId,
        name: 'Other Workspace Warehouse',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };

  const actor = () =>
    workspaceCurrentUser({
      userId: actorId,
      workspaceId: workspaceAId,
      workspaceRoleId: uuid('200000000001'),
      workspaceRoleKind: 'custom',
      permissionId: WorkspacePermissionId.WAREHOUSES_RENAME,
    });

  it('AC-09: records the trimmed name preserving submitted Unicode without normalization', async () => {
    await seedBaseline();

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor(), {
        warehouseId: warehouseAId,
        name: `  ${COMPOSED_E_ACUTE}  `,
      }),
    );

    expect(result).toMatchObject({ id: warehouseAId, name: COMPOSED_E_ACUTE });

    // What another member of the same Warehouse reads back is the same
    // stored row — this command is the only writer of it (AC-09).
    const stored = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: warehouseAId });
    expect(stored?.name).toBe(COMPOSED_E_ACUTE);
  });

  it('AC-08: a valid name that duplicates another Warehouse of the same Workspace is accepted', async () => {
    await seedBaseline();

    const result = await transactions.executeInTransaction({}, () =>
      createCommand().execute(actor(), {
        warehouseId: warehouseAId,
        name: 'Test Warehouse South',
      }),
    );

    expect(result).toMatchObject({ name: 'Test Warehouse South' });

    const namesakes = await dataSource.manager
      .getRepository(WarehouseEntity)
      .countBy({ workspaceId: workspaceAId, name: 'Test Warehouse South' });
    expect(namesakes).toBe(2);
  });

  it('AC-10: denies renaming a Warehouse of another Workspace, indistinguishably from a missing one, and changes nothing', async () => {
    await seedBaseline();

    const crossWorkspaceError = await transactions
      .executeInTransaction({}, () =>
        createCommand().execute(actor(), {
          warehouseId: warehouseBId,
          name: 'Hijacked',
        }),
      )
      .catch((error: unknown) => error);

    const missingTargetError = await transactions
      .executeInTransaction({}, () =>
        createCommand().execute(actor(), {
          warehouseId: missingWarehouseId,
          name: 'Hijacked',
        }),
      )
      .catch((error: unknown) => error);

    expect(crossWorkspaceError).toMatchObject({
      code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    });
    // Same failure shape for "exists in another Workspace" and "does not
    // exist at all" — existence is never disclosed (AC-10).
    expect(crossWorkspaceError).toEqual(missingTargetError);

    const untouchedWarehouseB = await dataSource.manager
      .getRepository(WarehouseEntity)
      .findOneBy({ id: warehouseBId });
    expect(untouchedWarehouseB?.name).toBe('Other Workspace Warehouse');
  });

  it.each([
    ['empty after trimming', '   ', 'empty'],
    ['over 100 user-perceived characters', 'a'.repeat(101), 'grapheme_length'],
  ] as const)(
    'AC-08: rejects a name %s and leaves the Warehouse unchanged (command-level, real target present)',
    async (_case, name, rule) => {
      await seedBaseline();

      await expect(
        transactions.executeInTransaction({}, () =>
          createCommand().execute(actor(), { warehouseId: warehouseAId, name }),
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.WORKSPACE_INVALID_INPUT,
        details: { field: 'name', rule },
      });

      const untouched = await dataSource.manager
        .getRepository(WarehouseEntity)
        .findOneBy({ id: warehouseAId });
      expect(untouched?.name).toBe('Test Warehouse North');
    },
  );
});
