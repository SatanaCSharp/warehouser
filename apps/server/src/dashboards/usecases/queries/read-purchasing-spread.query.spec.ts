// T13 — `dashboards/usecases/queries/read-purchasing-spread.query.ts` does not exist yet.
//
// Purchasing Spread is the one Panel on either surface that counts a Purchase Draft the open-state
// rule excludes everywhere else: every Warehouse against **all four** states, `closed` and
// `discarded` included, so a Warehouse that discards most of what it starts is distinguishable
// from one that cannot get goods (AC-18, sad.md §6.6). A query that quietly applied the open-state
// rule the other three Panels live under would still return a well-formed Panel, so the closed and
// discarded cells are asserted by value rather than by shape alone.
//
// It takes no timezone: `readPurchasingSpread` counts drafts by state and measures no "today"
// (workspace-performance-read.repository.ts). Not a conjunction Panel, and the Workspace comes from
// the resolved principal (AC-22).
import { purchasingSpreadPanelSchema } from '@warehouser/contracts/dashboards';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { ReadPurchasingSpreadQuery } from 'dashboards/usecases/queries/read-purchasing-spread.query';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { workspaceCurrentUser } from 'shared/access/workspace-current-user';
import type {
  PurchasingSpreadPanelRead,
  WorkspacePerformanceReadRepository,
} from 'shared/domain/repositories/workspace-performance-read.repository';
import { describe, expect, it, vi } from 'vitest';

const workspaceId = '00000000-0000-4000-8000-000000000101';
const otherWorkspaceId = '00000000-0000-4000-8000-000000000102';

const buildCurrentUser = (currentWorkspaceId: string): WorkspaceCurrentUser =>
  workspaceCurrentUser({
    userId: '00000000-0000-4000-8000-000000000002',
    workspaceId: currentWorkspaceId,
    workspaceRoleId: '00000000-0000-4000-8000-000000000004',
    workspaceRoleKind: 'custom',
    permissionId: WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
  });

// Kyiv abandons most of what it starts; Lviv cannot get goods started at all. The two are only
// distinguishable while `closed` and `discarded` survive the query (AC-18).
const panelRead: PurchasingSpreadPanelRead = {
  archivedWarehouseCount: 3,
  warehouses: [
    {
      warehouseId: '00000000-0000-4000-8000-000000000201',
      warehouseName: 'Kyiv',
      counts: [
        { state: 'draft', draftCount: 2 },
        { state: 'ready_for_ordering', draftCount: 1 },
        { state: 'closed', draftCount: 7 },
        { state: 'discarded', draftCount: 11 },
      ],
    },
    {
      warehouseId: '00000000-0000-4000-8000-000000000202',
      warehouseName: 'Lviv',
      counts: [
        { state: 'draft', draftCount: 0 },
        { state: 'ready_for_ordering', draftCount: 0 },
        { state: 'closed', draftCount: 0 },
        { state: 'discarded', draftCount: 0 },
      ],
    },
  ],
};

const buildRepository = (): WorkspacePerformanceReadRepository =>
  ({
    readPurchasingSpread: vi.fn().mockResolvedValue(panelRead),
  }) as unknown as WorkspacePerformanceReadRepository;

const kyivCounts = async (): Promise<
  readonly { state: string; draftCount: number }[]
> => {
  const query = new ReadPurchasingSpreadQuery(buildRepository());
  const result = await query.execute(buildCurrentUser(workspaceId));

  return result.warehouses[0].counts;
};

describe('ReadPurchasingSpreadQuery', () => {
  it('carries every Warehouse against every draft state through as the contract Panel (AC-18)', async () => {
    const repository = buildRepository();
    const query = new ReadPurchasingSpreadQuery(repository);

    const result = await query.execute(buildCurrentUser(workspaceId));

    expect(purchasingSpreadPanelSchema.parse(result)).toEqual(panelRead);
  });

  it('admits Closed drafts, which every other Panel excludes (AC-18)', async () => {
    expect(await kyivCounts()).toContainEqual({
      state: 'closed',
      draftCount: 7,
    });
  });

  it('admits Discarded drafts, which every other Panel excludes (AC-18)', async () => {
    expect(await kyivCounts()).toContainEqual({
      state: 'discarded',
      draftCount: 11,
    });
  });

  it('presents a pairing with no draft as zero rather than omitting it (AC-18)', async () => {
    const repository = buildRepository();
    const query = new ReadPurchasingSpreadQuery(repository);

    const result = await query.execute(buildCurrentUser(workspaceId));

    expect(result.warehouses[1].counts).toHaveLength(4);
  });

  it('reports the archived-Warehouse count as a field of its own (sad.md §6.6)', async () => {
    const repository = buildRepository();
    const query = new ReadPurchasingSpreadQuery(repository);

    const result = await query.execute(buildCurrentUser(workspaceId));

    expect(result.archivedWarehouseCount).toBe(3);
  });

  it('scopes the read to the Workspace on the principal (AC-22)', async () => {
    const repository = buildRepository();
    const query = new ReadPurchasingSpreadQuery(repository);

    await query.execute(buildCurrentUser(workspaceId));

    expect(repository.readPurchasingSpread).toHaveBeenCalledTimes(1);
    expect(repository.readPurchasingSpread).toHaveBeenCalledWith(workspaceId);
  });

  it('follows the principal rather than a fixed Workspace (AC-22)', async () => {
    const repository = buildRepository();
    const query = new ReadPurchasingSpreadQuery(repository);

    await query.execute(buildCurrentUser(workspaceId));
    await query.execute(buildCurrentUser(otherWorkspaceId));

    expect(repository.readPurchasingSpread).toHaveBeenNthCalledWith(
      2,
      otherWorkspaceId,
    );
  });

  it('accepts no Workspace identifier from the request in any form (AC-22)', () => {
    expect(ReadPurchasingSpreadQuery.prototype.execute).toHaveLength(1);
  });
});
