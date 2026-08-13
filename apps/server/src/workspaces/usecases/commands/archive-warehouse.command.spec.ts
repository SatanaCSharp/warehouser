import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError, SystemError } from '@warehouser/shared-types/errors';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
// RED for T43/AC-13 — `ArchiveWarehouseCommand` exists (T21) but does not yet
// translate an infrastructure write failure into openapi.yaml's documented
// 503 `workspace.archival_unavailable`. This unit spec proves that
// translation with a repository double, complementary to
// `archive-warehouse.command.integration.spec.ts`'s AC-13 case (which only
// asserts a generic rejection today and is Docker-gated, so it cannot run
// locally). server-error-handling.md §2 classifies this as a `SystemError`
// (a known infrastructure/technical failure), not an `ApplicationError`:
// `WORKSPACE_ARCHIVAL_UNAVAILABLE` is registered only in
// `global-http-exception.filter.ts`'s `systemErrors` map (503) — an
// `ApplicationError` with that code would fall through to the generic 500.
import { ArchiveWarehouseCommand } from 'workspaces/usecases/commands/archive-warehouse.command';

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

  it('AC-13: translates a write failure setting archived state into the documented 503 SystemError, preserving the cause', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    const writeFailure = new Error('connection terminated');
    warehouseLifecycleRepository.setArchivedAt.mockRejectedValueOnce(
      writeFailure,
    );
    const command = new ArchiveWarehouseCommand(warehouseLifecycleRepository);

    const rejection = command.execute(currentUser(), { warehouseId });

    await expect(rejection).rejects.toBeInstanceOf(SystemError);
    await expect(rejection).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_ARCHIVAL_UNAVAILABLE,
      cause: writeFailure,
    });
  });

  // RED for T52/AC-13 (review S1-03) — the failure boundary covered only
  // `setArchivedAt`, so an infrastructure failure in the AC-11a lock-and-count
  // read propagated raw to a generic 500 where openapi.yaml documents 503
  // `workspace.archival_unavailable`. "The change could not complete" covers
  // the whole archival attempt, not just its final write.
  it.each([
    ['lockWorkspaceAndCountNonArchivedWarehouses'],
    ['lockWarehouse'],
    ['setArchivedAt'],
  ])(
    'AC-13: translates an infrastructure failure in %s into the documented 503 SystemError, preserving the cause',
    async (failing) => {
      const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
      const failure = new Error('connection terminated');
      warehouseLifecycleRepository[
        failing as keyof typeof warehouseLifecycleRepository
      ].mockRejectedValueOnce(failure);
      const command = new ArchiveWarehouseCommand(warehouseLifecycleRepository);

      const rejection = command.execute(currentUser(), { warehouseId });

      await expect(rejection).rejects.toBeInstanceOf(SystemError);
      await expect(rejection).rejects.toMatchObject({
        code: ErrorCode.WORKSPACE_ARCHIVAL_UNAVAILABLE,
        cause: failure,
      });
    },
  );

  // The widened boundary must not swallow what it encloses: a business
  // rejection keeps its own 4xx code and a defect stays a defect
  // (server-error-handling.md §2, §6). Masking either as 503 would tell the
  // member "try again later" about a refusal that will never succeed.
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
    'AC-13: does not mask the business rejection for %s as an unavailable outcome',
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
