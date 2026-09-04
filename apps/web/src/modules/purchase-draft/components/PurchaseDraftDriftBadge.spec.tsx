import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PurchaseDraftDriftBadge } from 'modules/purchase-draft/components/PurchaseDraftDriftBadge';
import { makeStore } from 'store';
import { accessIds } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { PurchaseDraftSummary } from '@warehouser/contracts/purchase-drafts';

// US-08 from outside the drafts destination (frame `yGhkK`): the sidebar entry
// carries the count of frozen drafts whose demand has moved.

const draftsUrl = `/api/v1/warehouses/${accessIds.warehouse}/purchase-drafts`;

const summary = (
  overrides: Partial<PurchaseDraftSummary>,
): PurchaseDraftSummary => ({
  id: '00000000-0000-4000-8000-000000000501',
  reference: 'PD-0142',
  state: 'ready_for_ordering',
  expectedArrivalDate: null,
  lineCount: 1,
  hasDriftSignal: false,
  hasDirectToCustomerAddressDrift: false,
  closureReason: null,
  createdByUserId: accessIds.actingUser,
  createdAt: '2026-08-01T09:00:00.000Z',
  readiedByUserId: accessIds.actingUser,
  readiedAt: '2026-08-02T09:00:00.000Z',
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  ...overrides,
});

// The list response is validated against `purchaseDraftSummarySchema` at the
// API boundary, so a fixture that is not a real projection never reaches the
// badge at all — every id below is a well-formed identifier for that reason.
const stubDrafts = (
  drafts: PurchaseDraftSummary[],
): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn((input: Request | string | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    return Promise.resolve(
      url.startsWith(draftsUrl)
        ? Response.json(drafts)
        : Response.json({}, { status: 404 }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const draftsRequestCount = (fetchMock: ReturnType<typeof vi.fn>): number =>
  fetchMock.mock.calls.filter(([input]) =>
    String(input instanceof Request ? input.url : input).startsWith(draftsUrl),
  ).length;

describe('PurchaseDraftDriftBadge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing at all when no draft carries a drift signal', async () => {
    const fetchMock = stubDrafts([summary({ hasDriftSignal: false })]);
    renderInEnteredWarehouse(<PurchaseDraftDriftBadge />, makeStore());

    await waitFor(() => expect(draftsRequestCount(fetchMock)).toBe(1));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('counts the drafts whose demand moved, and says what the numeral counts', async () => {
    stubDrafts([
      summary({
        id: '00000000-0000-4000-8000-000000000511',
        hasDriftSignal: true,
      }),
      summary({
        id: '00000000-0000-4000-8000-000000000512',
        hasDriftSignal: true,
      }),
      summary({
        id: '00000000-0000-4000-8000-000000000513',
        hasDriftSignal: false,
      }),
    ]);
    renderInEnteredWarehouse(<PurchaseDraftDriftBadge />, makeStore());

    const badge = await screen.findByRole('status', {
      name: '2 drafts whose demand moved',
    });
    expect(badge).toHaveTextContent('2');
  });

  // It must read the projection the destination already uses rather than ask a
  // second question: RTK Query deduplicates the subscription, so the badge and
  // the drafts page share one request and one cache entry.
  it('issues no request of its own beyond the drafts projection', async () => {
    const fetchMock = stubDrafts([summary({ hasDriftSignal: true })]);
    const store = makeStore();
    renderInEnteredWarehouse(
      <>
        <PurchaseDraftDriftBadge />
        <PurchaseDraftDriftBadge />
      </>,
      store,
    );

    await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(2));

    expect(draftsRequestCount(fetchMock)).toBe(1);
    expect(fetchMock.mock.calls).toHaveLength(1);
  });
});
