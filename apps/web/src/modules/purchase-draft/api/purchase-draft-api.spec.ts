import { afterEach, describe, expect, it, vi } from 'vitest';

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
      receivedQuantity: null,
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

/** Which of the other two destinations each write actually moves. */
type AffectedReads = { demand: boolean; items: boolean };

type MutationName =
  | 'addPurchaseDraftLine'
  | 'addPurchaseDraftLineLink'
  | 'closePurchaseDraft'
  | 'confirmPurchaseDraftArrival'
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
  confirmPurchaseDraftArrival: (store) =>
    store
      .dispatch(
        purchaseDraftApi.endpoints.confirmPurchaseDraftArrival.initiate({
          ...draftIdArgs,
          input: { lines: [{ purchaseDraftLineId, receivedQuantity: 400 }] },
        }),
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
  createPurchaseDraft: { demand: false, items: false },
  // The expected arrival date is the draft's alone.
  revisePurchaseDraft: { demand: false, items: false },
  // A line names an Item, and its create body may carry links with it.
  addPurchaseDraftLine: { demand: true, items: true },
  // Restating `itemId` moves a naming count; no link moves with it.
  revisePurchaseDraftLine: { demand: false, items: true },
  // The line stops naming its Item and takes its links with it.
  removePurchaseDraftLine: { demand: true, items: true },
  // A link, and the quantity on it, is what a `Covered by` chip reads.
  addPurchaseDraftLineLink: { demand: true, items: false },
  revisePurchaseDraftLineLink: { demand: true, items: false },
  removePurchaseDraftLineLink: { demand: true, items: false },
  // The chips carry the covering draft's state, so freezing changes them.
  readyPurchaseDraft: { demand: true, items: false },
  // The Allocations fulfil Customer Orders, which leave the demand entirely;
  // on-hand quantities are deliberately untouched, so Items is unchanged.
  confirmPurchaseDraftArrival: { demand: true, items: false },
  // A closed or discarded draft leaves the two states coverage counts over;
  // its lines survive and keep naming their Items.
  closePurchaseDraft: { demand: true, items: false },
  discardPurchaseDraft: { demand: true, items: false },
};

const stubServer = (): ((url: string) => number) => {
  const fetchMock = vi.fn(
    (input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === demandUrl || url === itemsUrl) {
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

      // Live subscribers on both other destinations, exactly as the Demand and
      // Items destinations keep one while mounted.
      const demand = store.dispatch(
        customerOrderApi.endpoints.readDemand.initiate(warehouseId),
      );
      const items = store.dispatch(
        itemApi.endpoints.listItems.initiate(warehouseId),
      );
      await Promise.all([demand, items]);

      expect(countOf(demandUrl)).toBe(1);
      expect(countOf(itemsUrl)).toBe(1);

      await MUTATIONS[name](store);
      // RTK Query's tag invalidation refetches on the next tick.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(countOf(demandUrl)).toBe(affected.demand ? 2 : 1);
      expect(countOf(itemsUrl)).toBe(affected.items ? 2 : 1);

      demand.unsubscribe();
      items.unsubscribe();
    },
  );
});
