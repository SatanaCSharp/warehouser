// T13 — `dashboards/usecases/queries/read-order-flow.query.ts` does not exist yet.
//
// Order Flow is the one Panel on either surface that reports the Workspace's own trend rather than
// setting its Warehouses beside one another, so its response **names no Warehouse at all** (AC-16,
// sad.md §6.6). That is asserted two ways below, because either alone can pass while the other
// fails: `orderFlowPanelSchema` is a `strictObject` and rejects an unknown key on the Panel or on a
// week, and a whole-response key scan catches a Warehouse smuggled in somewhere the schema has no
// strict object to guard.
//
// Not a conjunction Panel: `WAREHOUSE_PERFORMANCE:WATCH` admits the whole Workspace surface, so
// this query asserts no observed set. The Workspace comes from the resolved principal and is never
// named by the request (AC-22).
import type { OrderFlowWeek } from '@warehouser/contracts/dashboards';
import { orderFlowPanelSchema } from '@warehouser/contracts/dashboards';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { ReadOrderFlowQuery } from 'dashboards/usecases/queries/read-order-flow.query';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { workspaceCurrentUser } from 'shared/access/workspace-current-user';
import type {
  OrderFlowPanelRead,
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

// Twelve weeks, oldest first, ending with the week in progress. The eleventh took on 100, has had
// 30 assigned to arrived goods and 20 withdrawn by cancellation — the cancelled part being part of
// the whole the week really took on rather than a quantity the Workspace still owes (AC-04, AC-16).
const weekStarts = [
  '2026-07-06',
  '2026-07-13',
  '2026-07-20',
  '2026-07-27',
  '2026-08-03',
  '2026-08-10',
  '2026-08-17',
  '2026-08-24',
  '2026-08-31',
  '2026-09-07',
  '2026-09-14',
  '2026-09-21',
] as const;

const activeWeek: Omit<OrderFlowWeek, 'weekStart'> = {
  recordedQuantity: 100,
  assignedQuantity: 30,
  cancelledQuantity: 20,
  stillAwaitedQuantity: 50,
};

const emptyWeek: Omit<OrderFlowWeek, 'weekStart'> = {
  recordedQuantity: 0,
  assignedQuantity: 0,
  cancelledQuantity: 0,
  stillAwaitedQuantity: 0,
};

// A week with nothing recorded in it is present and reports zero — the axis is fixed, never a
// truncated tail.
const weeks: readonly OrderFlowWeek[] = weekStarts.map((weekStart, index) => ({
  weekStart,
  ...(index === 10 ? activeWeek : emptyWeek),
}));

// The repository read carries no `timezone`: it is a bound query parameter, not a column, and the
// query composes it onto the response itself. Asserting the panel against `{ timezone, ...panelRead }`
// below is therefore a real check that the query supplies it, not a pass-through of a field the
// double already returned.
const panelRead: OrderFlowPanelRead = {
  archivedWarehouseCount: 3,
  weeks,
};

const buildRepository = (): WorkspacePerformanceReadRepository =>
  ({
    readOrderFlow: vi.fn().mockResolvedValue(panelRead),
  }) as unknown as WorkspacePerformanceReadRepository;

describe('ReadOrderFlowQuery', () => {
  it('pools twelve weeks for the Workspace as a whole (AC-16)', async () => {
    const repository = buildRepository();
    const query = new ReadOrderFlowQuery(repository, timezone);

    const result = await query.execute(buildCurrentUser(workspaceId));

    expect(orderFlowPanelSchema.parse(result)).toEqual({
      timezone,
      ...panelRead,
    });
  });

  // `archivedWarehouseCount` is the one permitted mention, and it names no Warehouse: it is a
  // count of how many were left out, not an identity. Identity is what AC-16 forbids.
  it('names no Warehouse anywhere in the response (AC-16)', async () => {
    const repository = buildRepository();
    const query = new ReadOrderFlowQuery(repository, timezone);

    const result = await query.execute(buildCurrentUser(workspaceId));

    expect(JSON.stringify(result)).not.toMatch(/warehouseId|warehouseName/iu);
  });

  it('reports the archived-Warehouse count as a field of its own (sad.md §6.6)', async () => {
    const repository = buildRepository();
    const query = new ReadOrderFlowQuery(repository, timezone);

    const result = await query.execute(buildCurrentUser(workspaceId));

    expect(result.archivedWarehouseCount).toBe(3);
  });

  it('scopes the read to the Workspace on the principal and the bound timezone (AC-22)', async () => {
    const repository = buildRepository();
    const query = new ReadOrderFlowQuery(repository, timezone);

    await query.execute(buildCurrentUser(workspaceId));

    expect(repository.readOrderFlow).toHaveBeenCalledTimes(1);
    expect(repository.readOrderFlow).toHaveBeenCalledWith(
      workspaceId,
      timezone,
    );
  });

  it('follows the principal rather than a fixed Workspace (AC-22)', async () => {
    const repository = buildRepository();
    const query = new ReadOrderFlowQuery(repository, timezone);

    await query.execute(buildCurrentUser(workspaceId));
    await query.execute(buildCurrentUser(otherWorkspaceId));

    expect(repository.readOrderFlow).toHaveBeenNthCalledWith(
      2,
      otherWorkspaceId,
      timezone,
    );
  });

  it('accepts no Workspace identifier from the request in any form (AC-22)', () => {
    expect(ReadOrderFlowQuery.prototype.execute).toHaveLength(1);
  });
});
