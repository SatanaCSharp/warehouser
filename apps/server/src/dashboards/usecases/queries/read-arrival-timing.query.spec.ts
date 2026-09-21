// T11 — `dashboards/usecases/queries/read-arrival-timing.query.ts` does not exist yet.
//
// Arrival Timing is the second conjunction Panel: `@RequiredPermission(CUSTOMER_ORDERS_WATCH)`
// admits at the guard, `@ObservedPermission(PURCHASE_DRAFTS_WATCH)` resolves the one remaining
// member, and this query asserts it before issuing any read (ADR 0001, sad.md §6.2/§6.4).
//
// `timezone` is composed by the query from the same `APP_TIMEZONE` value it binds into the
// repository call — the repository's own read shape carries `buckets`/`exclusions` only
// (`warehouse-demand-coverage.repository.ts` `ArrivalTimingRead`, data-model.md § "Time, timezone
// and the week") — so the response's `timezone` field is this layer's own composition, not a
// pass-through of anything the repository returns.
import { PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { ReadArrivalTimingQuery } from 'dashboards/usecases/queries/read-arrival-timing.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type {
  ArrivalTimingRead,
  WarehouseDemandCoverageRepository,
} from 'shared/domain/repositories/warehouse-demand-coverage.repository';
import { describe, expect, it, vi } from 'vitest';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const timezone = 'UTC';

const buildCurrentUser = (
  observedPermissionIds: readonly PermissionId[],
): AccessCurrentUser => ({
  userId: '00000000-0000-4000-8000-000000000002',
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: PermissionId.CUSTOMER_ORDERS_WATCH,
  observedPermissionIds,
  archived: false,
});

const arrivalTimingRead: ArrivalTimingRead = {
  buckets: [
    { kind: 'overdue', weekStart: null, owedQuantity: 3, expectedQuantity: 0 },
  ],
  exclusions: {
    beyondHorizon: { owedQuantity: 0, customerOrderCount: 0 },
    undatedReadyDrafts: { draftCount: 0, orderedQuantity: 0 },
    datedDraftsStillInDraft: { draftCount: 0, orderedQuantity: 0 },
    draftsSinceClosedOrDiscarded: { draftCount: 0 },
  },
};

const buildRepository = (): WarehouseDemandCoverageRepository =>
  ({
    readArrivalTiming: vi.fn().mockResolvedValue(arrivalTimingRead),
  }) as unknown as WarehouseDemandCoverageRepository;

describe('ReadArrivalTimingQuery', () => {
  it('reads Arrival Timing and composes the bound timezone onto the response when the conjunction holds (AC-02, AC-07)', async () => {
    const repository = buildRepository();
    const query = new ReadArrivalTimingQuery(repository, timezone);
    const currentUser = buildCurrentUser([PermissionId.PURCHASE_DRAFTS_WATCH]);

    const result = await query.execute(currentUser);

    expect(result).toEqual({ ...arrivalTimingRead, timezone });
    expect(repository.readArrivalTiming).toHaveBeenCalledTimes(1);
    expect(repository.readArrivalTiming).toHaveBeenCalledWith(
      warehouseId,
      timezone,
    );
  });

  it('denies before any read when PURCHASE_DRAFTS:WATCH is absent from the observed set (AC-02)', async () => {
    const repository = buildRepository();
    const query = new ReadArrivalTimingQuery(repository, timezone);
    const currentUser = buildCurrentUser([]);

    await expect(query.execute(currentUser)).rejects.toMatchObject({
      code: 'access.denied',
    });
    expect(repository.readArrivalTiming).not.toHaveBeenCalled();
  });

  it('discloses nothing about which Permission fell short (spec.md §6.1)', async () => {
    const repository = buildRepository();
    const query = new ReadArrivalTimingQuery(repository, timezone);
    const currentUser = buildCurrentUser([]);

    const failure: unknown = await query
      .execute(currentUser)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApplicationError);
    expect((failure as ApplicationError).details).toBeUndefined();
  });
});
