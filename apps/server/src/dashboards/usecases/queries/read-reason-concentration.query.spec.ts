// T11 — `dashboards/usecases/queries/read-reason-concentration.query.ts` does not exist yet.
//
// Reason Concentration is the second non-conjunction Panel (sad.md §6.5): `@RequiredPermission
// (REJECTIONS_WATCH)` alone admits it, and the query asserts no observed Permission. The
// repository's own read (`WarehouseRejectionReadRepository.readReasonConcentration`) already
// carries the row bound, the ordering and the Remainder Row rule (AC-12), so this query's own job
// is the one round trip and carrying the repository's response through unchanged — proven end to
// end here with a distinctive fixture value rather than asserted "truthy", so a query that drops or
// reshapes a field is caught (the "unbound seam" the standing brief names).
import { PermissionId } from '@warehouser/shared-types/enums';
import { ReadReasonConcentrationQuery } from 'dashboards/usecases/queries/read-reason-concentration.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type {
  WarehouseReasonConcentrationRead,
  WarehouseRejectionReadRepository,
} from 'shared/domain/repositories/warehouse-rejection-read.repository';
import { describe, expect, it, vi } from 'vitest';

const warehouseId = '00000000-0000-4000-8000-000000000001';

const currentUser: AccessCurrentUser = {
  userId: '00000000-0000-4000-8000-000000000002',
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: PermissionId.REJECTIONS_WATCH,
  observedPermissionIds: [],
  archived: false,
};

const reasonConcentrationRead: WarehouseReasonConcentrationRead = {
  totalRefusedQuantity: 42,
  rows: [
    {
      rejectionReasonId: '00000000-0000-4000-8000-000000000601',
      label: 'Distinctive Reason Label',
      refusedQuantity: 42,
      sharePercent: 100,
      cumulativeSharePercent: 100,
      undecidedQuantity: 5,
      customerReportedQuantity: 7,
    },
  ],
  remainder: null,
};

describe('ReadReasonConcentrationQuery', () => {
  it('carries the repository response through unchanged (AC-12)', async () => {
    const repository = {
      readReasonConcentration: vi
        .fn()
        .mockResolvedValue(reasonConcentrationRead),
    } as unknown as WarehouseRejectionReadRepository;
    const query = new ReadReasonConcentrationQuery(repository);

    const result = await query.execute(currentUser);

    expect(result).toEqual(reasonConcentrationRead);
  });

  it('issues exactly one bounded read per Panel (spec.md §6 "Read shape")', async () => {
    const repository = {
      readReasonConcentration: vi
        .fn()
        .mockResolvedValue(reasonConcentrationRead),
    } as unknown as WarehouseRejectionReadRepository;
    const query = new ReadReasonConcentrationQuery(repository);

    await query.execute(currentUser);

    expect(repository.readReasonConcentration).toHaveBeenCalledTimes(1);
    expect(repository.readReasonConcentration).toHaveBeenCalledWith(
      warehouseId,
    );
  });
});
