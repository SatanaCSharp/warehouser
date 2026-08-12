import { ErrorCode } from '@warehouser/shared-types/enums';
import { SystemError } from '@warehouser/shared-types/errors';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
// RED for T43/AC-13 — `RestoreWarehouseCommand` exists (T21) but does not yet
// translate an infrastructure write failure into openapi.yaml's documented
// 503 `workspace.archival_unavailable` (the same route/code covers both
// archiving and restoring — sad.md §6.5). This unit spec proves that
// translation with a repository double, complementary to
// `restore-warehouse.command.integration.spec.ts`, which is Docker-gated and
// cannot run locally. server-error-handling.md §2 classifies this as a
// `SystemError` (a known infrastructure/technical failure), not an
// `ApplicationError`: `WORKSPACE_ARCHIVAL_UNAVAILABLE` is registered only in
// `global-http-exception.filter.ts`'s `systemErrors` map (503) — an
// `ApplicationError` with that code would fall through to the generic 500.
import { RestoreWarehouseCommand } from 'workspaces/usecases/commands/restore-warehouse.command';

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

const warehouseLifecycleRepositoryDouble = () => ({
  lockWarehouse: jest.fn().mockResolvedValue({
    id: warehouseId,
    workspaceId,
    archivedAt: new Date('2026-08-01T09:00:00.000Z'),
  }),
  setArchivedAt: jest.fn().mockResolvedValue(undefined),
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

  it('AC-13: translates a write failure clearing archived state into the documented 503 SystemError, preserving the cause', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    const writeFailure = new Error('connection terminated');
    warehouseLifecycleRepository.setArchivedAt.mockRejectedValueOnce(
      writeFailure,
    );
    const command = new RestoreWarehouseCommand(warehouseLifecycleRepository);

    const rejection = command.execute(currentUser(), { warehouseId });

    await expect(rejection).rejects.toBeInstanceOf(SystemError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_ARCHIVAL_UNAVAILABLE,
      cause: writeFailure,
    });
  });
});
