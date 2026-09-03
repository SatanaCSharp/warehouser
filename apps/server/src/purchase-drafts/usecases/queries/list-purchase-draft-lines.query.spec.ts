// T18/AC-22 — the by-line read's application boundary. The repository
// (`purchase-draft-read.repository.integration.spec.ts`) proves the split itself is computed in
// one query; this spec proves what the use case above it owns: it scopes strictly to the acting
// Warehouse, passes the caller's filters through untouched, and derives each link's Drift Signals
// from the same value comparison `ReadPurchaseDraftQuery` uses — so the by-line view and the
// opened draft can never name a different signal for the same link (openapi.yaml
// `PurchaseDraftLineListEntry`, `DriftSignalKind`).
import { ListPurchaseDraftLinesQuery } from 'purchase-drafts/usecases/queries/list-purchase-draft-lines.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const addressA = '00000000-0000-4000-8000-000000000501';
const addressB = '00000000-0000-4000-8000-000000000502';

const currentUser: AccessCurrentUser = {
  userId: '00000000-0000-4000-8000-000000000002',
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:WATCH',
  observedPermissionIds: [],
  archived: false,
};

const destination = (deliveryAddressId: string) => ({
  deliveryAddressId,
  addressText: 'Test Address, Test City',
  accessNotes: null,
  isMain: true,
  deactivatedAt: null,
});

const linkWithCurrentAddress = (deliveryAddressId: string) => ({
  id: 'link-1',
  customerOrderId: 'order-1',
  customerName: 'Buyer One',
  statedQuantity: 10,
  snapshot: {
    capturedQuantity: 10,
    capturedNeededBy: '2026-09-30',
    capturedState: 'unfulfilled',
    capturedDeliveryAddressId: addressA,
    capturedDeliveryAddressText: 'Test Address, Test City',
  },
  current: {
    quantity: 10,
    neededBy: '2026-09-30',
    state: 'unfulfilled',
    outstandingQuantity: 10,
    lastChangedAt: null,
    deliveryAddress: destination(deliveryAddressId),
  },
  allocation: null,
});

const entryWith = (deliveryMode: string, links: readonly unknown[]) => ({
  purchaseDraftId: '00000000-0000-4000-8000-000000000301',
  purchaseDraftReference: 'PD-0143',
  purchaseDraftState: 'ready_for_ordering',
  expectedArrivalDate: '2026-09-18',
  line: {
    id: 'line-1',
    itemId: 'item-1',
    itemSku: 'TEST-SKU-0001',
    itemDescription: 'Cable reel, 50m',
    unitOfMeasure: 'each',
    orderedQuantity: 10,
    packagingTypeId: null,
    valueAddingNote: null,
    receivedQuantity: null,
    deliveryMode,
    customerDeliveryAddressId:
      deliveryMode === 'direct_to_customer' ? addressA : null,
    frozenDeliveryAddressText: 'Test Address, Test City',
    frozenAccessNotes: null,
    frozenCustomerName:
      deliveryMode === 'direct_to_customer' ? 'Test Customer North' : null,
    links,
  },
});

const repositoryDouble = (entries: readonly unknown[]) => ({
  listLines: jest.fn().mockResolvedValue(entries),
});

const firstLinkOf = (entries: { line: { links: unknown[] } }[]) =>
  entries[0]?.line.links[0] as { readonly driftSignals: readonly string[] };

describe('ListPurchaseDraftLinesQuery', () => {
  // AC-22 — every line the read returns keeps its own delivery mode, which is what places it in
  // one half of the view or the other. The use case narrows nothing itself.
  it('reads the by-line split scoped to the acting Warehouse, passing the filters through', async () => {
    const repository = repositoryDouble([
      entryWith('direct_to_customer', [linkWithCurrentAddress(addressA)]),
    ]);
    const query = new ListPurchaseDraftLinesQuery(repository as never);

    const result = await query.execute(currentUser, {
      deliveryMode: 'direct_to_customer',
      state: 'ready_for_ordering',
    });

    expect(repository.listLines).toHaveBeenCalledWith(warehouseId, {
      deliveryMode: 'direct_to_customer',
      state: 'ready_for_ordering',
    });
    expect(result[0]?.line.deliveryMode).toBe('direct_to_customer');
  });

  // AC-18/AC-18a — the same value comparison the opened draft derives, so the two surfaces can
  // never disagree about one link.
  it('names "delivery_address_changed" on a line whose linked Customer Order was redirected', async () => {
    const repository = repositoryDouble([
      entryWith('direct_to_customer', [linkWithCurrentAddress(addressB)]),
    ]);
    const query = new ListPurchaseDraftLinesQuery(repository as never);

    const result = await query.execute(currentUser);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'delivery_address_changed',
    ]);
  });

  it('reports no Drift Signal once the linked Customer Order is redirected back to the frozen address', async () => {
    const repository = repositoryDouble([
      entryWith('via_warehouse', [linkWithCurrentAddress(addressA)]),
    ]);
    const query = new ListPurchaseDraftLinesQuery(repository as never);

    const result = await query.execute(currentUser);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });
});
