// T18/AC-22 — the by-line read's application boundary. The repository
// (`purchase-draft-read.repository.integration.spec.ts`) proves the split itself is computed in
// one query; this spec proves what the use case above it owns: it scopes strictly to the acting
// Warehouse, passes the caller's filters through untouched, and derives each link's Drift Signals
// from the same value comparison `ReadPurchaseDraftQuery` uses — so the by-line view and the
// opened draft can never name a different signal for the same link (openapi.yaml
// `PurchaseDraftLineListEntry`, `DriftSignalKind`).
//
// T19 — and that the by-line read redacts on the same terms the opened draft does, through the
// same predicate over the same principal, while still serving every Via Warehouse line's
// `warehouseDestination` in full to a member who holds no `CUSTOMERS:WATCH` at all: the Warehouse's
// own address is the operator's premises data, not customer identity (AC-09a, AC-10, sad.md §7).
import { PermissionId } from '@warehouser/shared-types/enums';
import { RejectionReasonLabelService } from 'purchase-drafts/domain/services/rejection-reason-label.service.js';
import { ListPurchaseDraftLinesQuery } from 'purchase-drafts/usecases/queries/list-purchase-draft-lines.query.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { describe, expect, it, vi } from 'vitest';

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

const identifiedUser: AccessCurrentUser = {
  ...currentUser,
  observedPermissionIds: [PermissionId.CUSTOMERS_WATCH],
};

const linkWithCurrentAddress = (deliveryAddressId: string) => ({
  id: 'link-1',
  customerOrderId: 'order-1',
  customer: { id: 'customer-1', name: 'Buyer One' },
  customerName: null,
  statedQuantity: 10,
  // T19 — the repository reports the captured/current address comparison as one boolean, so the
  // redacted read can keep naming the drift while selecting neither address.
  addressDrift: deliveryAddressId !== addressA,
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
    warehouseDestination:
      deliveryMode === 'via_warehouse'
        ? {
            addressText: 'Test Warehouse Dock, Test City',
            accessNotes: 'Gate code on the intercom',
            frozen: true,
          }
        : null,
    customerDestination:
      deliveryMode === 'direct_to_customer'
        ? {
            customerDeliveryAddressId: addressA,
            customerId: 'customer-1',
            customerName: 'Test Customer North',
            addressText: 'Test Address, Test City',
            accessNotes: null,
            frozen: true,
          }
        : null,
    links,
  },
});

// The rows the **redacted** query produces: the line keeps its Warehouse destination and drops
// `customerDestination`, and its links drop the customer and both sides of the address comparison.
// The properties do not exist rather than holding `null`, because the columns were never selected.
const redactedEntryWith = (deliveryMode: string) => {
  const entry = entryWith(deliveryMode, []);

  return {
    ...entry,
    line: {
      id: entry.line.id,
      itemId: entry.line.itemId,
      itemSku: entry.line.itemSku,
      itemDescription: entry.line.itemDescription,
      unitOfMeasure: entry.line.unitOfMeasure,
      orderedQuantity: entry.line.orderedQuantity,
      packagingTypeId: entry.line.packagingTypeId,
      valueAddingNote: entry.line.valueAddingNote,
      receivedQuantity: entry.line.receivedQuantity,
      deliveryMode: entry.line.deliveryMode,
      warehouseDestination: entry.line.warehouseDestination,
      links: [
        {
          id: 'link-1',
          customerOrderId: 'order-1',
          statedQuantity: 10,
          snapshot: {
            capturedQuantity: 10,
            capturedNeededBy: '2026-09-30',
            capturedState: 'unfulfilled',
          },
          current: {
            quantity: 10,
            neededBy: '2026-09-30',
            state: 'unfulfilled',
            outstandingQuantity: 10,
            lastChangedAt: null,
          },
          allocation: null,
          addressDrift: true,
        },
      ],
    },
  };
};

const repositoryDouble = (
  entries: readonly unknown[],
  redactedEntries: readonly unknown[] = entries,
) => ({
  listIdentifiedLines: vi.fn().mockResolvedValue(entries),
  listRedactedLines: vi.fn().mockResolvedValue(redactedEntries),
});

const firstLinkOf = (entries: { line: { links: unknown[] } }[]) =>
  entries[0]?.line.links[0] as { readonly driftSignals: readonly string[] };

// The catalogue double every instantiation below hands the query's second constructor
// parameter — none of these cases assert on a Rejection's resolved label, so it never needs to
// resolve anything.
const catalogueDouble = () => ({
  resolveRejectionReasons: vi.fn().mockResolvedValue([]),
});

describe('ListPurchaseDraftLinesQuery', () => {
  // AC-22 — every line the read returns keeps its own delivery mode, which is what places it in
  // one half of the view or the other. The use case narrows nothing itself.
  it('reads the by-line split scoped to the acting Warehouse, passing the filters through', async () => {
    const repository = repositoryDouble([
      entryWith('direct_to_customer', [linkWithCurrentAddress(addressA)]),
    ]);
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(identifiedUser, {
      deliveryMode: 'direct_to_customer',
      state: 'ready_for_ordering',
    });

    expect(repository.listIdentifiedLines).toHaveBeenCalledWith(
      warehouseId,
      { deliveryMode: 'direct_to_customer', state: 'ready_for_ordering' },
      // T12/AC-22 — `identifiedUser` carries no observed `REJECTIONS:WATCH`.
      'cause_withheld',
    );
    expect(result[0]?.line.deliveryMode).toBe('direct_to_customer');
  });

  // AC-18/AC-18a — the same value comparison the opened draft derives, so the two surfaces can
  // never disagree about one link.
  it('names "delivery_address_changed" on a line whose linked Customer Order was redirected', async () => {
    const repository = repositoryDouble([
      entryWith('direct_to_customer', [linkWithCurrentAddress(addressB)]),
    ]);
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(identifiedUser);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'delivery_address_changed',
    ]);
  });

  it('reports no Drift Signal once the linked Customer Order is redirected back to the frozen address', async () => {
    const repository = repositoryDouble([
      entryWith('via_warehouse', [linkWithCurrentAddress(addressA)]),
    ]);
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(identifiedUser);

    expect(firstLinkOf(result as never).driftSignals).toEqual([]);
  });

  // ---- AC-09a/AC-10: the two projection forms ---------------------------------------------------

  // ADR 0001 — the redacted form is a different query, and the by-line read chooses between the two
  // through exactly the predicate the opened draft uses. A member preparing the dock who holds no
  // `CUSTOMERS:WATCH` reads the Warehouse's own Delivery Address in full and no customer at all.
  it('reads the redacted by-line projection for an actor without the observed CUSTOMERS:WATCH', async () => {
    const repository = repositoryDouble(
      [entryWith('direct_to_customer', [linkWithCurrentAddress(addressB)])],
      [redactedEntryWith('via_warehouse')],
    );
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(currentUser, {
      deliveryMode: 'via_warehouse',
    });

    expect(repository.listRedactedLines).toHaveBeenCalledWith(
      warehouseId,
      { deliveryMode: 'via_warehouse' },
      // T12/AC-22 — `currentUser` carries no observed `REJECTIONS:WATCH` either.
      'cause_withheld',
    );
    expect(repository.listIdentifiedLines).not.toHaveBeenCalled();

    // T11's precondition, asserted end to end: a member holding `PURCHASE_DRAFTS:WATCH` and no
    // Workspace Role at all reads the Warehouse's Delivery Address through the line projection.
    expect(result[0]?.line.warehouseDestination?.addressText).toBe(
      'Test Warehouse Dock, Test City',
    );

    // And reads no customer identity through it. The property names are matched with their quotes
    // so `customerOrderId`, which the redacted form legitimately carries, cannot decide this either
    // way.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('"customerDestination"');
    expect(serialized).not.toContain('"customer"');
    expect(serialized).not.toContain('"customerName"');
    expect(serialized).not.toContain('"deliveryAddress"');
    expect(serialized).not.toContain('"capturedDeliveryAddressId"');
    expect(serialized).not.toContain('Buyer One');
    expect(serialized).not.toContain('Test Customer North');
    expect(serialized).not.toContain('Test Address');
  });

  // AC-18a — the drift is still named, because that a drift exists is a fact about the draft.
  it('still names Address Drift in the redacted by-line projection', async () => {
    const repository = repositoryDouble(
      [],
      [redactedEntryWith('via_warehouse')],
    );
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(currentUser);

    expect(firstLinkOf(result as never).driftSignals).toEqual([
      'delivery_address_changed',
    ]);
  });
});
