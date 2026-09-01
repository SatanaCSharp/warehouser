// T14 — `purchase-drafts/usecases/queries/read-purchase-draft.query.ts` does not exist yet. AC-16
// is a use-case-level criterion: the repository (`purchase-draft-read.repository.integration.spec.ts`)
// proves it reads the right raw snapshot-vs-current values in one query; this spec proves the
// **naming** decision on top of them — a Drift Signal is a value comparison, computed on read and
// never stored (tasks/purchase-draft-drift-read.md "What"), so this use case derives
// `driftSignals` per link from `snapshot`/`current` alone, never from a touch log. That is what
// makes "a value amended and then put back as it was reports no drift" true: the comparison only
// ever sees the two endpoints, not the history in between (spec.md AC-16,
// openapi.yaml `DriftSignalKind`).
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const purchaseDraftId = '00000000-0000-4000-8000-000000000301';

const currentUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:WATCH',
  archived: false,
};

const baseLink = {
  id: 'link-1',
  customerOrderId: 'order-1',
  customerName: 'Buyer One',
  statedQuantity: 10,
  allocation: null,
};

const baseSnapshot = {
  capturedQuantity: 10,
  capturedNeededBy: '2026-09-30',
  capturedState: 'unfulfilled',
};

const baseCurrent = {
  quantity: 10,
  neededBy: '2026-09-30',
  state: 'unfulfilled',
  outstandingQuantity: 10,
  // Carried by the repository read and passed through untouched: naming a Drift Signal is a value
  // comparison between `snapshot` and `current`, never a question of when the order moved (AC-16).
  lastChangedAt: null,
};

const draftDetailWith = (links: readonly unknown[]) => ({
  id: purchaseDraftId,
  reference: 'PD-0143',
  state: 'ready_for_ordering',
  expectedArrivalDate: null,
  lineCount: 1,
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
  lines: [
    {
      id: 'line-1',
      itemId: 'item-1',
      itemSku: 'TEST-SKU-0001',
      itemDescription: 'Cable reel, 50m',
      unitOfMeasure: 'each',
      orderedQuantity: 10,
      packagingTypeId: null,
      valueAddingNote: null,
      receivedQuantity: null,
      links,
    },
  ],
});

const purchaseDraftReadRepositoryDouble = (detail: unknown) => ({
  readDraft: jest.fn().mockResolvedValue(detail),
});

const firstLinkOf = (detail: { lines: { links: unknown[] }[] }) =>
  detail.lines[0]?.links[0] as {
    readonly driftSignals: readonly string[];
  };

describe('ReadPurchaseDraftQuery', () => {
  // AC-16 — the draft never frozen (`snapshot: null`) reports no Drift Signal for that link.
  it('reports no Drift Signal for a link that carries no snapshot', async () => {
    const detail = draftDetailWith([
      { ...baseLink, snapshot: null, current: baseCurrent },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });

  // AC-16 — a value amended and then put back as it was reports no drift: the comparison is
  // between the snapshot and the current value only, never a touch log.
  it('reports no Drift Signal when the current value equals the snapshot exactly', async () => {
    const detail = draftDetailWith([
      { ...baseLink, snapshot: baseSnapshot, current: baseCurrent },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });

  // AC-16 — cancellation.
  it('names "cancelled" when the linked Customer Order was cancelled after the freeze', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, state: 'cancelled' },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual(['cancelled']);
  });

  // AC-16 — quantity change.
  it('names "quantity_changed" when the linked Customer Order\'s quantity changed after the freeze', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, quantity: 25, outstandingQuantity: 25 },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'quantity_changed',
    ]);
  });

  // AC-16 — needed-by moved.
  it('names "needed_by_moved" when the linked Customer Order\'s needed-by date moved after the freeze', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, neededBy: '2026-10-20' },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'needed_by_moved',
    ]);
  });

  // AC-16 — became Fulfilled through a different draft's arrival.
  it('names "became_fulfilled" when the linked Customer Order became Fulfilled after the freeze', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, state: 'fulfilled', outstandingQuantity: 0 },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'became_fulfilled',
    ]);
  });

  // AC-16 — became Fulfilled through *this* draft's own arrival is not drift: the link carries an
  // Allocation, the discriminator that tells the two cases apart.
  it('reports no "became_fulfilled" when the link carries an Allocation from this draft\'s own arrival', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: { ...baseCurrent, state: 'fulfilled', outstandingQuantity: 0 },
        allocation: {
          allocatedQuantity: 10,
          allocatedByUserId: actorId,
          createdAt: '2026-08-20T09:00:00.000Z',
        },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });

  // AC-16 — several signals can co-occur: the quantity changed and the order was then cancelled.
  it('names every Drift Signal that applies when more than one value changed', async () => {
    const detail = draftDetailWith([
      {
        ...baseLink,
        snapshot: baseSnapshot,
        current: {
          ...baseCurrent,
          quantity: 25,
          neededBy: '2026-10-20',
          state: 'cancelled',
        },
      },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    const result = await query.execute(currentUser, purchaseDraftId);

    expect(
      firstLinkOf(result as never)
        .driftSignals.slice()
        .sort(),
    ).toEqual(['cancelled', 'needed_by_moved', 'quantity_changed'].sort());
  });

  // The read is a thin scoped pass-through: it never mutates the raw repository row it received
  // beyond attaching `driftSignals`, and it scopes strictly to the acting Warehouse.
  it('reads the named draft scoped to the acting Warehouse', async () => {
    const detail = draftDetailWith([
      { ...baseLink, snapshot: baseSnapshot, current: baseCurrent },
    ]);
    const repository = purchaseDraftReadRepositoryDouble(detail);
    const query = new ReadPurchaseDraftQuery(repository as never);

    await query.execute(currentUser, purchaseDraftId);

    expect(repository.readDraft).toHaveBeenCalledWith(
      purchaseDraftId,
      warehouseId,
    );
  });
});
