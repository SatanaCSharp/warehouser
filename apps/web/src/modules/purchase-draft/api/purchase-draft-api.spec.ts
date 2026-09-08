import { afterEach, describe, expect, it, vi } from 'vitest';

import { customerApi } from 'modules/customer/api/customer-api';
import { customerOrderApi } from 'modules/customer-order/api/customer-order-api';
import { itemApi } from 'modules/item/api/item-api';
import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { makeStore } from 'store';
import { accessIds } from 'test/access-fixtures';

import type {
  PurchaseDraftDetail,
  PurchaseDraftSummary,
} from '@warehouser/contracts/purchase-drafts';
import type { AppStore } from 'store';

// Every one of these twelve writes invalidated `PurchaseDrafts` and nothing
// else, so three surfaces went stale behind a member's back: the Demand
// table's `Covered by` chips (whose coverage counts links on drafts in
// `('draft','ready_for_ordering')` and carries each draft's state), and the
// Items table's `Named by … 1 draft line` figure.
//
// This pins the set **per mutation**, negatives included — a blanket
// `['Demand','Items','PurchaseDrafts']` on all twelve would satisfy a test that
// only asserted the positives, and would refetch two destinations every time
// somebody picked an expected arrival date.
//
// The assertion is a live subscriber refetching, as `customer-order-api.spec`
// makes it, rather than an introspection of the endpoint's config: a tag that
// nothing refetches on is not an invalidation.

const warehouseId = accessIds.warehouse;
const purchaseDraftId = '00000000-0000-4000-8000-000000000501';
const purchaseDraftLineId = '00000000-0000-4000-8000-000000000601';
const purchaseDraftLineLinkId = '00000000-0000-4000-8000-000000000701';
const itemId = '00000000-0000-4000-8000-000000000801';
const customerOrderId = '00000000-0000-4000-8000-000000000901';

const demandUrl = `/api/v1/warehouses/${warehouseId}/demand`;
const itemsUrl = `/api/v1/warehouses/${warehouseId}/items`;
const draftsUrl = `/api/v1/warehouses/${warehouseId}/purchase-drafts`;
// delivery-addresses — the Customers destination's detail read carries
// `awaitingCustomerOrders`, which `customerAwaitingOrderSchema` restricts to
// **Unfulfilled** orders with a positive `outstandingQuantity`. A line ending
// allocates against exactly those, so the two endings can make that read stale
// (ADR 02-08-2026 §Decision).
const customersUrl = `/api/v1/warehouses/${warehouseId}/customers`;
// T15 — the Rejection Reason catalogue is system-managed reference data, seeded by migration and
// never written by any of the twelve mutations below (contracts/openapi.yaml), so it is the
// negative case every row of this matrix now also proves: nothing here moves it.
const rejectionReasonsUrl = `/api/v1/warehouses/${warehouseId}/rejection-reasons`;

const summary: PurchaseDraftSummary = {
  id: purchaseDraftId,
  reference: 'PD-0143',
  state: 'draft',
  expectedArrivalDate: null,
  lineCount: 1,
  hasDriftSignal: false,
  hasDirectToCustomerAddressDrift: false,
  closureReason: null,
  createdByUserId: accessIds.actingUser,
  createdAt: '2026-08-01T09:00:00.000Z',
  readiedByUserId: null,
  readiedAt: null,
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
};

const detail: PurchaseDraftDetail = {
  ...summary,
  lines: [
    {
      id: purchaseDraftLineId,
      itemId,
      itemSku: 'WH-100420',
      itemDescription: 'Pallet wrap, 500mm',
      unitOfMeasure: 'pieces',
      orderedQuantity: 400,
      packagingTypeId: null,
      valueAddingNote: null,
      ending: null,
      deliveryMode: 'via_warehouse',
      warehouseDestination: {
        addressText: 'Test Warehouse North, Test Industrial Estate',
        accessNotes: null,
        frozen: false,
      },
      customerDestination: null,
      links: [],
    },
  ],
};

/** Which of the other three destinations each write actually moves. */
type AffectedReads = { customers: boolean; demand: boolean; items: boolean };

type MutationName =
  | 'addPurchaseDraftLine'
  | 'addPurchaseDraftLineLink'
  | 'closePurchaseDraft'
  | 'recordPurchaseDraftLineArrival'
  | 'recordPurchaseDraftLineDirectDelivery'
  | 'createPurchaseDraft'
  | 'discardPurchaseDraft'
  | 'readyPurchaseDraft'
  | 'removePurchaseDraftLine'
  | 'removePurchaseDraftLineLink'
  | 'revisePurchaseDraft'
  | 'revisePurchaseDraftLine'
  | 'revisePurchaseDraftLineLink';

const draftIdArgs = { warehouseId, purchaseDraftId };
const lineIdArgs = { ...draftIdArgs, purchaseDraftLineId };
const linkIdArgs = { ...lineIdArgs, purchaseDraftLineLinkId };

const MUTATIONS: Record<MutationName, (store: AppStore) => Promise<unknown>> = {
  createPurchaseDraft: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.createPurchaseDraft.initiate({
          warehouseId,
        }),
      )
      .unwrap(),
  revisePurchaseDraft: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.revisePurchaseDraft.initiate({
          ...draftIdArgs,
          input: { expectedArrivalDate: '2026-09-05' },
        }),
      )
      .unwrap(),
  addPurchaseDraftLine: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.addPurchaseDraftLine.initiate({
          ...draftIdArgs,
          input: { itemId, orderedQuantity: 400 },
        }),
      )
      .unwrap(),
  revisePurchaseDraftLine: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.revisePurchaseDraftLine.initiate({
          ...lineIdArgs,
          input: { orderedQuantity: 500 },
        }),
      )
      .unwrap(),
  removePurchaseDraftLine: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.removePurchaseDraftLine.initiate(lineIdArgs),
      )
      .unwrap(),
  addPurchaseDraftLineLink: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.addPurchaseDraftLineLink.initiate({
          ...lineIdArgs,
          input: { customerOrderId, statedQuantity: 400 },
        }),
      )
      .unwrap(),
  revisePurchaseDraftLineLink: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.revisePurchaseDraftLineLink.initiate({
          ...linkIdArgs,
          statedQuantity: 300,
        }),
      )
      .unwrap(),
  removePurchaseDraftLineLink: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.removePurchaseDraftLineLink.initiate(
          linkIdArgs,
        ),
      )
      .unwrap(),
  readyPurchaseDraft: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.readyPurchaseDraft.initiate(draftIdArgs),
      )
      .unwrap(),
  recordPurchaseDraftLineArrival: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.recordPurchaseDraftLineArrival.initiate({
          ...draftIdArgs,
          purchaseDraftLineId,
          input: { receivedQuantity: 400 },
        }),
      )
      .unwrap(),
  recordPurchaseDraftLineDirectDelivery: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.recordPurchaseDraftLineDirectDelivery.initiate(
          {
            ...draftIdArgs,
            purchaseDraftLineId,
            input: { deliveredQuantity: 400 },
          },
        ),
      )
      .unwrap(),
  closePurchaseDraft: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.closePurchaseDraft.initiate({
          ...draftIdArgs,
          input: { closureReason: 'Supplier cannot source before October' },
        }),
      )
      .unwrap(),
  discardPurchaseDraft: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.discardPurchaseDraft.initiate(draftIdArgs),
      )
      .unwrap(),
};

const AFFECTED_READS: Record<MutationName, AffectedReads> = {
  // An empty draft names no Item and holds no link.
  createPurchaseDraft: { customers: false, demand: false, items: false },
  // The expected arrival date is the draft's alone.
  revisePurchaseDraft: { customers: false, demand: false, items: false },
  // A line names an Item, and its create body may carry links with it. A link
  // claims nothing (AC-11a), so no order's Outstanding Quantity moves and the
  // Customer's awaiting list is unchanged — which is true of every link write
  // below for the same reason.
  addPurchaseDraftLine: { customers: false, demand: true, items: true },
  // Restating `itemId` moves a naming count; no link moves with it.
  revisePurchaseDraftLine: { customers: false, demand: false, items: true },
  // The line stops naming its Item and takes its links with it.
  removePurchaseDraftLine: { customers: false, demand: true, items: true },
  // A link, and the quantity on it, is what a `Covered by` chip reads.
  addPurchaseDraftLineLink: { customers: false, demand: true, items: false },
  revisePurchaseDraftLineLink: { customers: false, demand: true, items: false },
  removePurchaseDraftLineLink: { customers: false, demand: true, items: false },
  // The chips carry the covering draft's state, so freezing changes them.
  readyPurchaseDraft: { customers: false, demand: true, items: false },
  // The Allocations fulfil Customer Orders, which leave the demand entirely;
  // on-hand quantities are deliberately untouched, so Items is unchanged.
  // AC-21 — neither ending touches an Item's On-hand Quantity, so the Item catalogue is
  // never invalidated by one.
  // The Allocations are also what a Customer is still waiting for: an order
  // fulfilled by one leaves `awaitingCustomerOrders` altogether, and a partial
  // Allocation lowers the `outstandingQuantity` reported there.
  recordPurchaseDraftLineArrival: {
    customers: true,
    demand: true,
    items: false,
  },
  recordPurchaseDraftLineDirectDelivery: {
    customers: true,
    demand: true,
    items: false,
  },
  // A closed or discarded draft leaves the two states coverage counts over;
  // its lines survive and keep naming their Items. Neither allocates, so no
  // order's Outstanding Quantity moves.
  closePurchaseDraft: { customers: false, demand: true, items: false },
  discardPurchaseDraft: { customers: false, demand: true, items: false },
};

const stubServer = (): ((url: string) => number) => {
  const fetchMock = vi.fn(
    (input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (
        url === demandUrl ||
        url === itemsUrl ||
        url === customersUrl ||
        url === rejectionReasonsUrl
      ) {
        return Promise.resolve(Response.json([]));
      }
      if (url.startsWith(draftsUrl)) {
        // Discarding answers with the draft's own summary rather than its full
        // detail (contracts/openapi.yaml), and it is the one write addressed to
        // the draft's own path with `DELETE`.
        const isDiscard =
          url === `${draftsUrl}/${purchaseDraftId}` &&
          init?.method === 'DELETE';
        return Promise.resolve(Response.json(isDiscard ? summary : detail));
      }
      return Promise.resolve(Response.json({}, { status: 404 }));
    },
  );
  vi.stubGlobal('fetch', fetchMock);

  return (url) =>
    fetchMock.mock.calls.filter(([input]) => {
      const requested = String(input instanceof Request ? input.url : input);
      return requested === url;
    }).length;
};

describe('purchaseDraftApi tag invalidation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(
    Object.entries(AFFECTED_READS).map(
      ([name, affected]) => [name as MutationName, affected] as const,
    ),
  )(
    '%s refetches the reads it moves and only those',
    async (name, affected) => {
      const countOf = stubServer();
      const store = makeStore();

      // Live subscribers on every other destination, exactly as the Demand,
      // Items and Customers destinations keep one while mounted.
      const demand = store.dispatch(
        customerOrderApi.endpoints.readDemand.initiate(warehouseId),
      );
      const items = store.dispatch(
        itemApi.endpoints.listItems.initiate(warehouseId),
      );
      const customers = store.dispatch(
        customerApi.endpoints.listCustomers.initiate(warehouseId),
      );
      const rejectionReasons = store.dispatch(
        purchaseDraftApi.endpoints.listRejectionReasons.initiate(warehouseId),
      );
      await Promise.all([demand, items, customers, rejectionReasons]);

      expect(countOf(demandUrl)).toBe(1);
      expect(countOf(itemsUrl)).toBe(1);
      expect(countOf(customersUrl)).toBe(1);
      expect(countOf(rejectionReasonsUrl)).toBe(1);

      await MUTATIONS[name](store);
      // RTK Query's tag invalidation refetches on the next tick.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(countOf(demandUrl)).toBe(affected.demand ? 2 : 1);
      expect(countOf(itemsUrl)).toBe(affected.items ? 2 : 1);
      expect(countOf(customersUrl)).toBe(affected.customers ? 2 : 1);
      // The catalogue is written by no mutation this feature adds, so it never refetches.
      expect(countOf(rejectionReasonsUrl)).toBe(1);

      demand.unsubscribe();
      items.unsubscribe();
      customers.unsubscribe();
      rejectionReasons.unsubscribe();
    },
  );
});
