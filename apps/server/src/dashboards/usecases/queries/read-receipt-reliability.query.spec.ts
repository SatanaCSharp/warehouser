// T13 — `dashboards/usecases/queries/read-receipt-reliability.query.ts` does not exist yet.
//
// AC-20a is the case this spec exists for: a Warehouse none of whose Purchase Draft Lines can
// enter either rate is presented as having **no rate to report**, rather than placed at nothing or
// at everything — so it is never read as the worst or the best performer. The repository already
// returns `null` for such a Warehouse (`CASE WHEN denominator = 0 THEN NULL …`), which makes the
// query's rule a negative one: it must not coalesce that `null` into a number on its way out. A
// `?? 0` slipped in anywhere would still satisfy `receiptReliabilityPanelSchema`, whose rate fields
// are `.nullable()` and therefore admit `0` too, so `null` is asserted by identity below and the
// two rates are asserted independently — a Warehouse may have one and not the other (test-plan.md,
// "one rate reported and one reported as none, independently").
//
// Not a conjunction Panel, and the Workspace is resolved from the session rather than named by the
// request (AC-22, sad.md §6.6).
import { receiptReliabilityPanelSchema } from '@warehouser/contracts/dashboards';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { ReadReceiptReliabilityQuery } from 'dashboards/usecases/queries/read-receipt-reliability.query';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { workspaceCurrentUser } from 'shared/access/workspace-current-user';
import type {
  ReceiptReliabilityExclusionsRead,
  ReceiptReliabilityPanelRead,
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

const noExclusions: ReceiptReliabilityExclusionsRead = {
  undatedLineCount: 0,
  noEndingRecordedLineCount: 0,
  nothingReceivedLineCount: 0,
  directToCustomerLineCount: 0,
  unrecordedConformanceLineCount: 0,
  notApplicableConformanceLineCount: 0,
};

// Kyiv reports both rates. Lviv admits no line into either — every one of its lines is undated,
// carries no recorded conformance, or was sent Direct to Customer (AC-20a). Odesa is the mixed
// case the test plan names: dated lines give it an On-time Arrival Rate while nothing it holds can
// enter the Conformance Rate, so exactly one of its two rates is reportable.
const panelRead: ReceiptReliabilityPanelRead = {
  archivedWarehouseCount: 3,
  warehouses: [
    {
      warehouseId: '00000000-0000-4000-8000-000000000201',
      warehouseName: 'Kyiv',
      onTimeArrivalRatePercent: 87.5,
      conformanceRatePercent: 100,
      receivedQuantity: 4200,
      exclusions: noExclusions,
    },
    {
      warehouseId: '00000000-0000-4000-8000-000000000202',
      warehouseName: 'Lviv',
      onTimeArrivalRatePercent: null,
      conformanceRatePercent: null,
      receivedQuantity: 0,
      exclusions: {
        ...noExclusions,
        undatedLineCount: 4,
        unrecordedConformanceLineCount: 6,
        directToCustomerLineCount: 2,
      },
    },
    {
      warehouseId: '00000000-0000-4000-8000-000000000203',
      warehouseName: 'Odesa',
      onTimeArrivalRatePercent: 50,
      conformanceRatePercent: null,
      receivedQuantity: 120,
      exclusions: { ...noExclusions, unrecordedConformanceLineCount: 9 },
    },
  ],
};

const buildRepository = (): WorkspacePerformanceReadRepository =>
  ({
    readReceiptReliability: vi.fn().mockResolvedValue(panelRead),
  }) as unknown as WorkspacePerformanceReadRepository;

const readWarehouses = async (): Promise<
  ReceiptReliabilityPanelRead['warehouses']
> => {
  const query = new ReadReceiptReliabilityQuery(buildRepository(), timezone);
  const result = await query.execute(buildCurrentUser(workspaceId));

  return result.warehouses;
};

describe('ReadReceiptReliabilityQuery', () => {
  it('positions one labelled mark per Warehouse, sized by the quantity it received (AC-19)', async () => {
    const repository = buildRepository();
    const query = new ReadReceiptReliabilityQuery(repository, timezone);

    const result = await query.execute(buildCurrentUser(workspaceId));

    expect(receiptReliabilityPanelSchema.parse(result)).toEqual(panelRead);
  });

  it('reports a Warehouse admitting no line as having no On-time Arrival Rate, never zero (AC-20a)', async () => {
    const warehouses = await readWarehouses();

    expect(warehouses[1].onTimeArrivalRatePercent).toBeNull();
  });

  it('reports a Warehouse admitting no line as having no Conformance Rate, never zero (AC-20a)', async () => {
    const warehouses = await readWarehouses();

    expect(warehouses[1].conformanceRatePercent).toBeNull();
  });

  it('keeps the two rates independent, one reported and one not (AC-20a)', async () => {
    const warehouses = await readWarehouses();

    expect(warehouses[2].onTimeArrivalRatePercent).toBe(50);
    expect(warehouses[2].conformanceRatePercent).toBeNull();
  });

  it('keeps the exclusion counts of a Warehouse with no rate (AC-20)', async () => {
    const warehouses = await readWarehouses();

    expect(warehouses[1].exclusions).toEqual({
      ...noExclusions,
      undatedLineCount: 4,
      unrecordedConformanceLineCount: 6,
      directToCustomerLineCount: 2,
    });
  });

  it('reports the archived-Warehouse count as a field of its own (sad.md §6.6)', async () => {
    const repository = buildRepository();
    const query = new ReadReceiptReliabilityQuery(repository, timezone);

    const result = await query.execute(buildCurrentUser(workspaceId));

    expect(result.archivedWarehouseCount).toBe(3);
  });

  it('scopes the read to the Workspace on the principal and the bound timezone (AC-22)', async () => {
    const repository = buildRepository();
    const query = new ReadReceiptReliabilityQuery(repository, timezone);

    await query.execute(buildCurrentUser(workspaceId));

    expect(repository.readReceiptReliability).toHaveBeenCalledTimes(1);
    expect(repository.readReceiptReliability).toHaveBeenCalledWith(
      workspaceId,
      timezone,
    );
  });

  it('follows the principal rather than a fixed Workspace (AC-22)', async () => {
    const repository = buildRepository();
    const query = new ReadReceiptReliabilityQuery(repository, timezone);

    await query.execute(buildCurrentUser(workspaceId));
    await query.execute(buildCurrentUser(otherWorkspaceId));

    expect(repository.readReceiptReliability).toHaveBeenNthCalledWith(
      2,
      otherWorkspaceId,
      timezone,
    );
  });

  it('accepts no Workspace identifier from the request in any form (AC-22)', () => {
    expect(ReadReceiptReliabilityQuery.prototype.execute).toHaveLength(1);
  });
});
