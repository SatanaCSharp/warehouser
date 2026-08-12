import { ErrorCode } from '@warehouser/shared-types/enums';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
// RED for T20 — the command does not exist yet. This unit spec covers AC-08
// only (spec.md §5): name validation must reject before the Warehouse is
// touched, matching the `AccessName`-first idiom already used by
// `CreateRoleCommand`/`UpdateRoleCommand`. AC-09 (trimmed/un-normalized
// rename) and AC-10 (cross-Workspace denial, indistinguishable from a
// missing target) are covered at integration level per test-plan.md's
// chosen level for those rows, since proving Workspace ownership needs a
// real target row to be absent or present.
import { RenameWarehouseCommand } from 'workspaces/usecases/commands/rename-warehouse.command';

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
  permissionId: WorkspacePermissionId.WAREHOUSES_RENAME,
});

const warehouseLifecycleRepositoryDouble = () => ({
  createWarehouse: jest.fn().mockResolvedValue(undefined),
  renameWarehouse: jest.fn().mockResolvedValue(undefined),
  setArchivedAt: jest.fn().mockResolvedValue(undefined),
  lockWorkspaceAndCountNonArchivedWarehouses: jest.fn().mockResolvedValue(1),
});

describe('RenameWarehouseCommand', () => {
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
    'AC-08: rejects a name %s, naming the broken rule, and touches nothing',
    async (_case, name, rule) => {
      const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
      const command = new RenameWarehouseCommand(warehouseLifecycleRepository);

      await expect(
        command.execute(currentUser(), { warehouseId, name }),
      ).rejects.toMatchObject({
        code: ErrorCode.WORKSPACE_INVALID_INPUT,
        details: { field: 'name', rule },
      });

      expect(
        warehouseLifecycleRepository.renameWarehouse,
      ).not.toHaveBeenCalled();
    },
  );

  it('runs inside its own transaction boundary (server-architecture.md: the command owning the complete atomic operation)', () => {
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        RenameWarehouseCommand.prototype.execute,
      ) as TransactionalMetadata | undefined,
    ).toBeDefined();
  });
});
