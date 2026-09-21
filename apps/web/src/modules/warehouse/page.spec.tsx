import { waitFor, within } from '@testing-library/react';
import { loadWarehouseDashboard } from 'modules/warehouse/loaders/warehouse-dashboard.loader';
import { WarehousePage } from 'modules/warehouse/page';
import type { AppStore } from 'store';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import {
  allWatchPermissions,
  amendedCoverageGapPanel,
  coverageGapPanel,
  panelMarkers,
  stubDashboardServer,
} from 'test/dashboard-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T16 — the Warehouse Dashboard destination. The page replaces
// `DesignSystemExample` and owns only what the grid does not: the
// visually-hidden `h1`, and the absence of a masthead. Colocated with the page
// it covers (`placing-web-tests.md` §1).
//
// It also carries the two facts that are only observable at the destination:
// **0 reads issued after the surface is presented** (`spec.md` §6 read shape),
// and AC-26's refetch-on-entry seen end to end.

/**
 * `renderInEnteredWarehouse` mounts a TanStack `RouterProvider`, and the
 * router's initial `load()` settles in a macrotask — so `render` returns before
 * the routed subtree has painted and `container` is still empty at that moment.
 * That is a property of the harness, not of the destination under test, so
 * every consumer of the helper awaits the first paint
 * (`shared/components/WarehousePermissionGate.spec.tsx` is the precedent).
 */
const painted = async (container: HTMLElement): Promise<HTMLElement> => {
  await waitFor(() => {
    expect(container).not.toBeEmptyDOMElement();
  });

  return container;
};

const enterWarehouse = async (): Promise<{
  container: HTMLElement;
  /** What the route had issued at the moment the loader settled — snapshotted
   * before the destination mounts, so the surface's own paint cannot be
   * compared against itself. */
  issuedByTheLoader: string[];
  /** The live list, still growing with every request the stub serves. */
  requestedUrls: string[];
  store: AppStore;
}> => {
  const requestedUrls = stubDashboardServer({
    permissionIds: allWatchPermissions,
  });
  const store = authenticatedStore();

  await loadWarehouseDashboard({
    context: { status: 'entered', store, warehouseId: accessIds.warehouse },
  });
  const issuedByTheLoader = [...requestedUrls];

  const { container } = renderInEnteredWarehouse(
    <WarehousePage />,
    store,
    accessIds.warehouse,
  );
  await painted(container);

  return { container, issuedByTheLoader, requestedUrls, store };
};

describe('WarehousePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // AC-01 / `design-handoff.md` § Accessibility — no visible page heading, no
  // lede and no chip row above the grid, because the criterion admits no words
  // beyond each Panel's own labels. The accessible name is a visually-hidden
  // `h1`, so the heading order stays `h1 -> h2 x n`.
  it('names the destination with a visually-hidden h1 and no visible masthead', async () => {
    const { container } = await enterWarehouse();

    const headings = within(container).getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].className).toMatch(/\bsr-only\b/u);
    expect(
      within(container).getAllByRole('heading', { level: 2 }),
    ).toHaveLength(4);
  });

  // `spec.md` §6 "Read shape" — every figure is awaited by the route, so the
  // destination mounts with all four present and issues **nothing** afterwards.
  // A per-Panel read fired on mount would also be a per-Panel waiting window,
  // which `frontend-architecture.md` §Page gives the route rather than a
  // component.
  it('issues no read after the surface is presented', async () => {
    const { container, issuedByTheLoader, requestedUrls } =
      await enterWarehouse();

    // The snapshot is taken before the destination mounts, so this is a real
    // comparison rather than a list against itself: the projection plus the
    // four Panels, and nothing added by the paint.
    expect(issuedByTheLoader).toHaveLength(5);
    expect(container.textContent).toContain(panelMarkers.coverageGap);
    expect(requestedUrls).toStrictEqual(issuedByTheLoader);
  });

  // AC-26 — entering again after a Customer Order is recorded shows the change.
  // Freshness is refetch-on-entry and no mutation invalidates a tag here, so the
  // second entry must present the amended figure and nothing carried over from
  // before it (sad.md §8 "Freshness").
  it('shows the amended figure on re-entry and carries nothing over', async () => {
    const supersededUncovered = String(
      coverageGapPanel.rows[0].uncoveredQuantity,
    );
    const amendedUncovered = String(
      amendedCoverageGapPanel.rows[0].uncoveredQuantity,
    );
    const { store } = await enterWarehouse();

    vi.unstubAllGlobals();
    stubDashboardServer({
      coverageGap: amendedCoverageGapPanel,
      permissionIds: allWatchPermissions,
    });
    await loadWarehouseDashboard({
      context: { status: 'entered', store, warehouseId: accessIds.warehouse },
    });
    const { container } = renderInEnteredWarehouse(
      <WarehousePage />,
      store,
      accessIds.warehouse,
    );
    await painted(container);

    expect(container.textContent).toContain(amendedUncovered);
    expect(container.textContent).not.toContain(supersededUncovered);
  });
});
