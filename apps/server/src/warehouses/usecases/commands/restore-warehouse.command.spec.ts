import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user.js';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator.js';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository.js';
import { repositoryDouble } from 'test/doubles/repository-double.js';
import { describe, expect, it, vi } from 'vitest';
import { RestoreWarehouseCommand } from 'warehouses/usecases/commands/restore-warehouse.command.js';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const warehouseId = '00000000-0000-4000-8000-000000000003';

const currentUser = (): WorkspaceCurrentUser => ({
  userId: actorId,
  workspaceId,
  workspaceRoleId: '00000000-0000-4000-8000-000000000004',
  workspaceRoleKind: 'custom',
  permissionId: 'WAREHOUSES:ARCHIVE',
});

const warehouseLifecycleRepositoryDouble = () =>
  repositoryDouble<WarehouseLifecycleRepository>()({
    lockWarehouse: vi.fn().mockResolvedValue({
      id: warehouseId,
      workspaceId,
      name: 'Test Warehouse North',
      archivedAt: new Date('2026-08-01T09:00:00.000Z'),
    }),
    setArchivedAt: vi.fn().mockResolvedValue(undefined),
  });

describe('RestoreWarehouseCommand', () => {
  it('runs inside its own transaction boundary (server-architecture.md: the command owning the complete atomic operation)', () => {
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        RestoreWarehouseCommand.prototype.execute,
      ) as TransactionalMetadata | undefined,
    ).toBeDefined();
  });

  // AC-13 — resolving the Warehouse and clearing its archived state can both
  // fail for an infrastructure reason. The failure propagates untouched; the
  // global exception filter is the single place it is classified
  // (server-use-case-boundaries.md §3).
  it.each([['lockWarehouse'], ['setArchivedAt']] as const)(
    'AC-13: propagates an infrastructure failure in %s unchanged',
    async (failing) => {
      const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
      const failure = new Error('connection terminated');
      warehouseLifecycleRepository[failing].mockRejectedValueOnce(failure);
      const command = new RestoreWarehouseCommand(warehouseLifecycleRepository);

      await expect(
        command.execute(currentUser(), { warehouseId }),
      ).rejects.toBe(failure);
    },
  );

  // The business rejection this command owns keeps its own 4xx code
  // (server-error-handling.md §2, §6).
  it('AC-13: answers a cross-Workspace target with its own rejection code', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    warehouseLifecycleRepository.lockWarehouse.mockResolvedValueOnce({
      id: warehouseId,
      workspaceId: '00000000-0000-4000-8000-0000000000ff',
      name: 'Another Workspace Warehouse',
      archivedAt: new Date('2026-08-01T09:00:00.000Z'),
    });
    const command = new RestoreWarehouseCommand(warehouseLifecycleRepository);

    const rejection = command.execute(currentUser(), { warehouseId });

    await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    });
  });

  // RED for T44/AC-11 — openapi.yaml documents `PUT .../archival` as `200`
  // with the full `Warehouse` body, and the already-shipped web client
  // (`workspace-warehouses-api.ts`) Zod-validates the response against
  // `warehouseSchema`, which requires `archivedAt`. The command must confirm
  // the value it just wrote (`null`) rather than a bare identifier.
  it('AC-11: returns the full Warehouse record, with archivedAt cleared to null', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    const command = new RestoreWarehouseCommand(warehouseLifecycleRepository);

    const result = await command.execute(currentUser(), { warehouseId });

    expect(result).toEqual({
      id: warehouseId,
      name: 'Test Warehouse North',
      archivedAt: null,
    });
  });
});
