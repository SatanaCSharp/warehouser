import { ErrorCode } from '@warehouser/shared-types/enums';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { repositoryDouble } from 'test/doubles/repository-double';
import { describe, expect, it, vi } from 'vitest';
// RED for T20 — neither command exists yet. This unit spec covers AC-08 only
// (spec.md §5): name validation must reject before any persistence is
// attempted, matching the established `AccessName`-first idiom already used
// by `CreateRoleCommand`/`UpdateRoleCommand` (access/usecases/commands). The
// atomic-creation (AC-06/AC-07) and cross-Workspace (AC-10 — n/a to create)
// behaviour is covered at integration level per test-plan.md's chosen level
// for those rows.
import { CreateWarehouseCommand } from 'warehouses/usecases/commands/create-warehouse.command';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const warehouseId = '00000000-0000-4000-8000-000000000003';

const BELL = String.fromCodePoint(0x0007);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);

const currentUser = (): WorkspaceCurrentUser => ({
  userId: actorId,
  workspaceId,
  workspaceRoleId: '00000000-0000-4000-8000-000000000004',
  workspaceRoleKind: 'custom',
  permissionId: WorkspacePermissionId.WAREHOUSES_CREATE,
});

const warehouseLifecycleRepositoryDouble = () =>
  repositoryDouble<WarehouseLifecycleRepository>()({
    createWarehouse: vi.fn().mockResolvedValue(undefined),
    renameWarehouse: vi.fn().mockResolvedValue(undefined),
    setArchivedAt: vi.fn().mockResolvedValue(undefined),
    lockWorkspaceAndCountNonArchivedWarehouses: vi.fn().mockResolvedValue(1),
  });

// The provisioning delegate is `access`'s exported command (T12); this
// double never runs because name validation must fail first.
const provisionInitialAccessDouble = () => ({
  execute: vi.fn().mockResolvedValue({
    warehouseId,
    roleId: '00000000-0000-4000-8000-000000000005',
    roleKind: 'warehouse_manager',
    permissionIds: [],
  }),
});

describe('CreateWarehouseCommand', () => {
  it.each([
    ['empty after trimming', '   ', 'empty'],
    ['over 100 user-perceived characters', 'a'.repeat(101), 'grapheme_length'],
    [
      'containing a control character',
      `Ware${BELL}house`,
      'control_or_format_character',
    ],
    [
      'containing a format character',
      `Ware${SOFT_HYPHEN}house`,
      'control_or_format_character',
    ],
  ] as const)(
    'AC-08: rejects a name %s, naming the broken rule, and persists nothing',
    async (_case, name, rule) => {
      const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
      const provisionInitialAccess = provisionInitialAccessDouble();
      const command = new CreateWarehouseCommand(
        warehouseLifecycleRepository,
        provisionInitialAccess,
        { warehouseId: () => warehouseId },
      );

      await expect(
        command.execute(currentUser(), { name }),
      ).rejects.toMatchObject({
        code: ErrorCode.WORKSPACE_INVALID_INPUT,
        details: { field: 'name', rule },
      });

      expect(
        warehouseLifecycleRepository.createWarehouse,
      ).not.toHaveBeenCalled();
      expect(provisionInitialAccess.execute).not.toHaveBeenCalled();
    },
  );

  it('AC-08: a valid name is accepted by the value object before delegation proceeds', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    const provisionInitialAccess = provisionInitialAccessDouble();
    const command = new CreateWarehouseCommand(
      warehouseLifecycleRepository,
      provisionInitialAccess,
      { warehouseId: () => warehouseId },
    );

    await expect(
      command.execute(currentUser(), { name: '  Test Warehouse North  ' }),
    ).resolves.toMatchObject({ id: warehouseId, name: 'Test Warehouse North' });

    expect(warehouseLifecycleRepository.createWarehouse).toHaveBeenCalledWith({
      id: warehouseId,
      workspaceId,
      name: 'Test Warehouse North',
    });
    expect(provisionInitialAccess.execute).toHaveBeenCalledWith({
      warehouseId,
      userId: actorId,
    });
  });

  it('runs inside its own transaction boundary (server-architecture.md: the command owning the complete atomic operation)', () => {
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        CreateWarehouseCommand.prototype.execute,
      ) as TransactionalMetadata | undefined,
    ).toBeDefined();
  });

  // AC-07 — the Warehouse row write and the delegated Manager Role/assignment
  // provisioning share one `@Transactional()` boundary, so either failing
  // leaves no Warehouse behind. The failure itself propagates untouched; the
  // global exception filter is the single place it is classified
  // (server-use-case-boundaries.md §3).
  it('AC-07: propagates a Warehouse-row write failure unchanged, without provisioning access', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    const writeFailure = new Error('connection terminated');
    warehouseLifecycleRepository.createWarehouse.mockRejectedValueOnce(
      writeFailure,
    );
    const provisionInitialAccess = provisionInitialAccessDouble();
    const command = new CreateWarehouseCommand(
      warehouseLifecycleRepository,
      provisionInitialAccess,
      { warehouseId: () => warehouseId },
    );

    await expect(
      command.execute(currentUser(), { name: 'Test Warehouse North' }),
    ).rejects.toBe(writeFailure);
    expect(provisionInitialAccess.execute).not.toHaveBeenCalled();
  });

  it('AC-07: propagates a failure establishing the Manager Role/assignment unchanged', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    const provisionInitialAccess = provisionInitialAccessDouble();
    const provisioningFailure = new Error('manager role assignment failed');
    provisionInitialAccess.execute.mockRejectedValueOnce(provisioningFailure);
    const command = new CreateWarehouseCommand(
      warehouseLifecycleRepository,
      provisionInitialAccess,
      { warehouseId: () => warehouseId },
    );

    await expect(
      command.execute(currentUser(), { name: 'Test Warehouse North' }),
    ).rejects.toBe(provisioningFailure);
  });
});
