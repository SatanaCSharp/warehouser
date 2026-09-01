// T10 — `customer-orders/usecases/queries/read-consolidated-demand.query.ts` does not exist yet.
// AC-04/AC-17a/AC-20/AC-21a are use-case-level criteria exercised from one call site (opening the
// consolidated demand — sad.md §6.5 step 2) that needs the `CUSTOMER_ORDERS:WATCH`-gated
// projection scoped to the acting Warehouse, not the raw persistence rows. The repository-level
// proof of correctness (no fan-out, omission, Coverage exclusion) lives in
// `consolidated-demand.repository.integration.spec.ts`; this use-case spec is the thin adapter
// that scopes the read to the acting Warehouse and passes the repository's Demand Lines through
// unchanged — `sad.md` §6.5 step 5, "returns the Demand Lines whole, nothing paged".
import { ReadConsolidatedDemandQuery } from 'customer-orders/usecases/queries/read-consolidated-demand.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: 'CUSTOMER_ORDERS:WATCH',
  archived: false,
};

// openapi.yaml `DemandLine`/`DemandCoverage` — the response shape this thin adapter passes
// through unchanged. `purchaseDraftState` only ever admits `draft`/`ready_for_ordering` (a Closed
// or Discarded draft's links are absent from Coverage entirely, AC-21a); Coverage carries one
// entry per link (`purchaseDraftLineId`), not aggregated per draft (AC-20).
const demandLines = [
  {
    itemId: 'item-1',
    sku: 'TEST-SKU-0001',
    description: 'Cable reel, 50m',
    unitOfMeasure: 'each',
    totalOutstandingQuantity: 35,
    earliestNeededBy: '2026-09-01',
    onHandQuantity: 42,
    unfulfilledCustomerOrderCount: 2,
    coverage: [
      {
        purchaseDraftId: 'draft-1',
        purchaseDraftReference: 'PD-0142',
        purchaseDraftLineId: 'line-1',
        purchaseDraftState: 'ready_for_ordering',
        statedQuantity: 13,
      },
    ],
  },
];

const consolidatedDemandRepositoryDouble = () => ({
  readConsolidatedDemand: jest.fn().mockResolvedValue(demandLines),
});

describe('ReadConsolidatedDemandQuery', () => {
  // AC-04, AC-20 — scoped to the acting Warehouse, returned whole (nothing paged at this scale).
  it("reads the acting Warehouse's consolidated demand and returns the Demand Lines whole", async () => {
    const consolidatedDemandRepository = consolidatedDemandRepositoryDouble();
    const query = new ReadConsolidatedDemandQuery(
      consolidatedDemandRepository as never,
    );

    await expect(query.execute(currentUser)).resolves.toEqual(demandLines);
    expect(
      consolidatedDemandRepository.readConsolidatedDemand,
    ).toHaveBeenCalledWith(warehouseId);
    expect(
      consolidatedDemandRepository.readConsolidatedDemand,
    ).toHaveBeenCalledTimes(1);
  });

  // AC-04 — an empty demand (no Unfulfilled Customer Orders anywhere in the Warehouse) is an
  // empty list, not an error.
  it('returns an empty list when the Warehouse has no outstanding demand', async () => {
    const consolidatedDemandRepository = consolidatedDemandRepositoryDouble();
    consolidatedDemandRepository.readConsolidatedDemand.mockResolvedValue([]);
    const query = new ReadConsolidatedDemandQuery(
      consolidatedDemandRepository as never,
    );

    await expect(query.execute(currentUser)).resolves.toEqual([]);
  });
});
