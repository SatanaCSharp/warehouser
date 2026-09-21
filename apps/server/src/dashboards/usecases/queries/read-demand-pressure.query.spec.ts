// T13 — `dashboards/usecases/queries/read-demand-pressure.query.ts` does not exist yet.
//
// Demand Pressure is a Workspace Panel. It is not a conjunction Panel: the single Workspace
// Permission `WAREHOUSE_PERFORMANCE:WATCH` admits the whole surface at `WorkspaceAccessGuard`, so
// this query asserts no observed set and `WorkspaceCurrentUser` carries none to assert
// (workspace-current-user.ts, and the task's "One entry, not one per record family").
//
// Its own rules are the two the Workspace surface adds. The Workspace is resolved from the session
// and **never** named by the request (AC-22, sad.md §6.6), so `execute` takes the principal and
// nothing else, and the Workspace identifier the repository is handed is read off that principal.
// And the response carries the archived-Warehouse count as a field of its own rather than leaving
// the client to infer it.
import { demandPressurePanelSchema } from '@warehouser/contracts/dashboards';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { ReadDemandPressureQuery } from 'dashboards/usecases/queries/read-demand-pressure.query';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { workspaceCurrentUser } from 'shared/access/workspace-current-user';
import type {
  DemandPressurePanelRead,
  WorkspacePerformanceReadRepository,
} from 'shared/domain/repositories/workspace-performance-read.repository';
import { describe, expect, it, vi } from 'vitest';

const workspaceId = '00000000-0000-4000-8000-000000000101';
const otherWorkspaceId = '00000000-0000-4000-8000-000000000102';
const timezone = 'Europe/Kyiv';

const buildCurrentUser = (currentWorkspaceId: string): WorkspaceCurrentUser =>
  workspaceCurrentUser({
    userId: '00000000-0000-4000-8000-000000000002',
    workspaceId: currentWorkspaceId,
    workspaceRoleId: '00000000-0000-4000-8000-000000000004',
    workspaceRoleKind: 'custom',
    permissionId: WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
  });

// A small Warehouse in trouble beside a large healthy one (AC-14): the bands are absolute
// quantities, and `totalOutstandingQuantity` is their sum rather than a scale the client
// normalizes against.
const panelRead: DemandPressurePanelRead = {
  archivedWarehouseCount: 3,
  warehouses: [
    {
      warehouseId: '00000000-0000-4000-8000-000000000201',
      warehouseName: 'Kyiv',
      overdueQuantity: 40,
      dueSoonQuantity: 5,
      laterQuantity: 5,
      totalOutstandingQuantity: 50,
    },
    {
      warehouseId: '00000000-0000-4000-8000-000000000202',
      warehouseName: 'Lviv',
      overdueQuantity: 0,
      dueSoonQuantity: 100,
      laterQuantity: 9900,
      totalOutstandingQuantity: 10000,
    },
  ],
};

const buildRepository = (): WorkspacePerformanceReadRepository =>
  ({
    readDemandPressure: vi.fn().mockResolvedValue(panelRead),
  }) as unknown as WorkspacePerformanceReadRepository;

describe('ReadDemandPressureQuery', () => {
  it('carries the Workspace read through as the contract Panel, bands absolute (AC-14)', async () => {
    const repository = buildRepository();
    const query = new ReadDemandPressureQuery(repository, timezone);

    const result = await query.execute(buildCurrentUser(workspaceId));

    expect(demandPressurePanelSchema.parse(result)).toEqual(panelRead);
  });

  it('reports the archived-Warehouse count as a field of its own (sad.md §6.6)', async () => {
    const repository = buildRepository();
    const query = new ReadDemandPressureQuery(repository, timezone);

    const result = await query.execute(buildCurrentUser(workspaceId));

    expect(result.archivedWarehouseCount).toBe(3);
  });

  it('scopes the read to the Workspace on the principal and the bound timezone (AC-22)', async () => {
    const repository = buildRepository();
    const query = new ReadDemandPressureQuery(repository, timezone);

    await query.execute(buildCurrentUser(workspaceId));

    expect(repository.readDemandPressure).toHaveBeenCalledTimes(1);
    expect(repository.readDemandPressure).toHaveBeenCalledWith(
      workspaceId,
      timezone,
    );
  });

  it('follows the principal rather than a fixed Workspace, so authority is never assembled elsewhere (AC-22)', async () => {
    const repository = buildRepository();
    const query = new ReadDemandPressureQuery(repository, timezone);

    await query.execute(buildCurrentUser(workspaceId));
    await query.execute(buildCurrentUser(otherWorkspaceId));

    expect(repository.readDemandPressure).toHaveBeenNthCalledWith(
      2,
      otherWorkspaceId,
      timezone,
    );
  });

  it('accepts no Workspace identifier from the request in any form (AC-22)', () => {
    expect(ReadDemandPressureQuery.prototype.execute).toHaveLength(1);
  });
});
