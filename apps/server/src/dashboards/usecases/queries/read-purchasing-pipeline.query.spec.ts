// T11 — `dashboards/usecases/queries/read-purchasing-pipeline.query.ts` does not exist yet.
//
// Purchasing Pipeline is not a conjunction Panel (sad.md §6.5): `@RequiredPermission
// (PURCHASE_DRAFTS_WATCH)` alone admits it, and the query asserts no observed Permission at all.
// Its own rule is composing the repository's eight flat (state, Age Band) rows
// (`WarehousePurchasingPipelineBandRead[]`) into `openapi.yaml`'s fixed two-state/four-band nesting
// — `states.length === 2` in `draft`, `ready_for_ordering` order, each with `bands.length === 4` in
// the four Age Bands' own order (`purchasingPipelinePanelSchema`). That order is asserted against a
// repository double whose rows arrive in a *different* order, which is what makes this the query's
// own contract-shape rule rather than an accident of however the repository happened to order them.
import { PermissionId } from '@warehouser/shared-types/enums';
import { ReadPurchasingPipelineQuery } from 'dashboards/usecases/queries/read-purchasing-pipeline.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type {
  WarehousePurchasingPipelineBandRead,
  WarehousePurchasingReadRepository,
} from 'shared/domain/repositories/warehouse-purchasing-read.repository';
import { describe, expect, it, vi } from 'vitest';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const timezone = 'UTC';

const currentUser: AccessCurrentUser = {
  userId: '00000000-0000-4000-8000-000000000002',
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: PermissionId.PURCHASE_DRAFTS_WATCH,
  observedPermissionIds: [],
  archived: false,
};

// Deliberately out of the contract's fixed order — `ready_for_ordering` before `draft`, bands
// scrambled within each — so a query that merely echoes the repository's row order fails this
// assertion rather than passing it by coincidence.
const scrambledRows: WarehousePurchasingPipelineBandRead[] = [
  { state: 'ready_for_ordering', ageBand: 'over_30_days', draftCount: 1 },
  { state: 'draft', ageBand: 'from_15_to_30_days', draftCount: 2 },
  { state: 'ready_for_ordering', ageBand: 'up_to_7_days', draftCount: 5 },
  { state: 'draft', ageBand: 'up_to_7_days', draftCount: 3 },
  { state: 'ready_for_ordering', ageBand: 'from_8_to_14_days', draftCount: 0 },
  { state: 'draft', ageBand: 'over_30_days', draftCount: 0 },
  { state: 'ready_for_ordering', ageBand: 'from_15_to_30_days', draftCount: 4 },
  { state: 'draft', ageBand: 'from_8_to_14_days', draftCount: 1 },
];

describe('ReadPurchasingPipelineQuery', () => {
  it('nests the repository rows into the fixed two-state, four-band order (AC-10, AC-11)', async () => {
    const repository = {
      readPurchasingPipeline: vi.fn().mockResolvedValue(scrambledRows),
    } as unknown as WarehousePurchasingReadRepository;
    const query = new ReadPurchasingPipelineQuery(repository, timezone);

    const result = await query.execute(currentUser);

    expect(result).toEqual({
      states: [
        {
          state: 'draft',
          bands: [
            { ageBand: 'up_to_7_days', draftCount: 3 },
            { ageBand: 'from_8_to_14_days', draftCount: 1 },
            { ageBand: 'from_15_to_30_days', draftCount: 2 },
            { ageBand: 'over_30_days', draftCount: 0 },
          ],
        },
        {
          state: 'ready_for_ordering',
          bands: [
            { ageBand: 'up_to_7_days', draftCount: 5 },
            { ageBand: 'from_8_to_14_days', draftCount: 0 },
            { ageBand: 'from_15_to_30_days', draftCount: 4 },
            { ageBand: 'over_30_days', draftCount: 1 },
          ],
        },
      ],
    });
  });

  it('issues exactly one bounded read per Panel, never one per row it composes (spec.md §6 "Read shape")', async () => {
    const repository = {
      readPurchasingPipeline: vi.fn().mockResolvedValue(scrambledRows),
    } as unknown as WarehousePurchasingReadRepository;
    const query = new ReadPurchasingPipelineQuery(repository, timezone);

    await query.execute(currentUser);

    expect(repository.readPurchasingPipeline).toHaveBeenCalledTimes(1);
    expect(repository.readPurchasingPipeline).toHaveBeenCalledWith(
      warehouseId,
      timezone,
    );
  });
});
