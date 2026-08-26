// T14 — `purchase-drafts/usecases/queries/list-purchase-drafts.query.ts` does not exist yet. AC-16a
// is exercised from one call site (opening the Warehouse's Purchase Drafts —
// sad.md §6.8 step 2): a thin adapter that scopes the read to the acting Warehouse, passes the
// optional `state` filter through, and returns the repository's `hasDriftSignal`-carrying rows
// unchanged — the repository already derives which drafts carry a Drift Signal (test-plan.md
// "read from the projection the destination already fetches").
import { ListPurchaseDraftsQuery } from 'purchase-drafts/usecases/queries/list-purchase-drafts.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:WATCH',
  archived: false,
};

// openapi.yaml `PurchaseDraftSummary` — one carrying a Drift Signal, one that still matches.
const draftSummaries = [
  {
    id: 'draft-1',
    state: 'ready_for_ordering',
    expectedArrivalDate: '2026-09-02',
    lineCount: 2,
    hasDriftSignal: true,
    closureReason: null,
    createdByUserId: actorId,
    createdAt: '2026-08-12T08:00:00.000Z',
    readiedByUserId: actorId,
    readiedAt: '2026-08-14T09:00:00.000Z',
    closedByUserId: null,
    closedAt: null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    discardedByUserId: null,
    discardedAt: null,
  },
  {
    id: 'draft-2',
    state: 'draft',
    expectedArrivalDate: null,
    lineCount: 1,
    hasDriftSignal: false,
    closureReason: null,
    createdByUserId: actorId,
    createdAt: '2026-08-22T08:00:00.000Z',
    readiedByUserId: null,
    readiedAt: null,
    closedByUserId: null,
    closedAt: null,
    arrivalConfirmedByUserId: null,
    arrivalConfirmedAt: null,
    discardedByUserId: null,
    discardedAt: null,
  },
];

const purchaseDraftReadRepositoryDouble = () => ({
  listDrafts: jest.fn().mockResolvedValue(draftSummaries),
});

describe('ListPurchaseDraftsQuery', () => {
  // AC-16a — drafts carrying a Drift Signal are distinguishable from those that still match their
  // demand, read straight from the repository's projection.
  it("lists the acting Warehouse's Purchase Drafts, distinguishing those carrying a Drift Signal", async () => {
    const repository = purchaseDraftReadRepositoryDouble();
    const query = new ListPurchaseDraftsQuery(repository as never);

    await expect(query.execute(currentUser)).resolves.toEqual(draftSummaries);
    expect(repository.listDrafts).toHaveBeenCalledWith(warehouseId, undefined);
    expect(repository.listDrafts).toHaveBeenCalledTimes(1);
  });

  // openapi.yaml `GET /purchase-drafts` `state` query parameter narrows to one state.
  it('passes an explicit state filter through to the repository', async () => {
    const repository = purchaseDraftReadRepositoryDouble();
    const query = new ListPurchaseDraftsQuery(repository as never);

    await query.execute(currentUser, 'closed');

    expect(repository.listDrafts).toHaveBeenCalledWith(warehouseId, 'closed');
  });

  // An empty Warehouse (no drafts at all) is an empty list, not an error.
  it('returns an empty list when the Warehouse holds no Purchase Drafts', async () => {
    const repository = purchaseDraftReadRepositoryDouble();
    repository.listDrafts.mockResolvedValue([]);
    const query = new ListPurchaseDraftsQuery(repository as never);

    await expect(query.execute(currentUser)).resolves.toEqual([]);
  });
});
