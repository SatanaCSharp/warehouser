import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { repositoryDouble } from 'test/doubles/repository-double';
import { ArchiveWarehouseCommand } from 'warehouses/usecases/commands/archive-warehouse.command';

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
    lockWorkspaceAndCountNonArchivedWarehouses: jest.fn().mockResolvedValue(2),
    lockWarehouse: jest.fn().mockResolvedValue({
      id: warehouseId,
      workspaceId,
      name: 'Test Warehouse North',
      archivedAt: null,
    }),
    setArchivedAt: jest.fn().mockResolvedValue(undefined),
  });

describe('ArchiveWarehouseCommand', () => {
  it('runs inside its own transaction boundary (server-architecture.md: the command owning the complete atomic operation)', () => {
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        ArchiveWarehouseCommand.prototype.execute,
      ) as TransactionalMetadata | undefined,
    ).toBeDefined();
  });

  // AC-13 — every step of the archival attempt (the AC-11a lock-and-count
  // read, the Warehouse lock, the write) can fail for an infrastructure
  // reason. The failure propagates untouched; the global exception filter is
  // the single place it is classified (server-use-case-boundaries.md §3).
  // `@Transactional()` is what makes the attempt all-or-nothing.
  it.each([
    ['lockWorkspaceAndCountNonArchivedWarehouses'],
    ['lockWarehouse'],
    ['setArchivedAt'],
  ] as const)(
    'AC-13: propagates an infrastructure failure in %s unchanged',
    async (failing) => {
      const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
      const failure = new Error('connection terminated');
      warehouseLifecycleRepository[failing].mockRejectedValueOnce(failure);
      const command = new ArchiveWarehouseCommand(warehouseLifecycleRepository);

      await expect(
        command.execute(currentUser(), { warehouseId }),
      ).rejects.toBe(failure);
    },
  );

  // The business rejections this command owns keep their own 4xx codes
  // (server-error-handling.md §2, §6).
  it.each([
    [
      'a target outside the actor Workspace',
      (double: ReturnType<typeof warehouseLifecycleRepositoryDouble>): void => {
        double.lockWarehouse.mockResolvedValueOnce({
          id: warehouseId,
          workspaceId: '00000000-0000-4000-8000-0000000000ff',
          name: 'Another Workspace Warehouse',
          archivedAt: null,
        });
      },
      ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    ],
    [
      'the last non-archived Warehouse',
      (double: ReturnType<typeof warehouseLifecycleRepositoryDouble>): void => {
        double.lockWorkspaceAndCountNonArchivedWarehouses.mockResolvedValueOnce(
          1,
        );
      },
      ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE,
    ],
  ])(
    'AC-13: answers the business rejection for %s with its own code',
    async (_case, arrange, code) => {
      const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
      arrange(warehouseLifecycleRepository);
      const command = new ArchiveWarehouseCommand(warehouseLifecycleRepository);

      const rejection = command.execute(currentUser(), { warehouseId });

      await expect(rejection).rejects.toBeInstanceOf(ApplicationError);
      await expect(rejection).rejects.toMatchObject({ code });
    },
  );

  // RED for T44/AC-11 — openapi.yaml documents `PUT .../archival` as `200`
  // with the full `Warehouse` body, and the already-shipped web client
  // (`workspace-warehouses-api.ts`) Zod-validates the response against
  // `warehouseSchema`, which requires `archivedAt`. The command must confirm
  // the value it just wrote rather than a bare identifier, so the REST
  // handler stops needing to fabricate a field no command result carries.
  it('AC-11: returns the full Warehouse record, including the archivedAt it just wrote', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    const command = new ArchiveWarehouseCommand(warehouseLifecycleRepository);

    const result = await command.execute(currentUser(), { warehouseId });

    expect(result).toEqual({
      id: warehouseId,
      name: 'Test Warehouse North',
      archivedAt: expect.any(Date),
    });
  });
});
