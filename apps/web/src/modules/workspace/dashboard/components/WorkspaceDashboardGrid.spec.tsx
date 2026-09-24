import { waitFor, within } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { WorkspaceDashboardGrid } from 'modules/workspace/dashboard/components/WorkspaceDashboardGrid';
import { loadWorkspaceDashboard } from 'modules/workspace/dashboard/loaders/workspace-dashboard.loader';
import type { AppStore } from 'store';
import { authenticatedStore } from 'test/access-fixtures';
import {
  DEMAND_PRESSURE_URL,
  stubWorkspaceDashboardServer,
  workspacePanelMarkers,
} from 'test/dashboard-fixtures';
import { renderWithProviders } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The Workspace Dashboard's grid: the fixed Panel order, the reflow rule, the
// denial, and what a Panel does when its own read fails (AC-14, AC-15, AC-22).
//
// It had no colocated spec until the `dashboards` front-end conformance
// review: its four Panels each had one and `modules/warehouse`'s equivalent
// grid had one, but the grid's own denial arm and `xl:col-span-2` reflow were
// exercised only from `page.spec.tsx`, one level above the subject
// (`docs/system/guides/placing-web-tests.md` §1–§2).
//
// Every case enters through the **real loader** rather than seeding the cache
// by hand, so what the grid draws is what the actor's Workspace Role actually
// admitted — the test hole
// `docs/system/adr/19-08-2026-declarative-permission-gates.md` § Consequences
// names.
//
// Nothing here matches translated copy: the Panels are told apart by the
// Warehouse name each is required to print, which is what makes the fixed
// order assertable.

const WATCH_PERFORMANCE = [
  WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
] as const;

/** RTK Query's default `keepUnusedDataFor`, in milliseconds. */
const KEEP_UNUSED_DATA_FOR_MS = 60_000;

const enterDashboard = async ({
  failing = [],
  workspacePermissionIds = WATCH_PERFORMANCE,
}: {
  failing?: readonly string[];
  workspacePermissionIds?: readonly WorkspacePermissionId[];
} = {}): Promise<HTMLElement> => {
  stubWorkspaceDashboardServer({ failing, workspacePermissionIds });

  const store: AppStore = authenticatedStore();
  await loadWorkspaceDashboard({ context: { store } });

  const { container } = renderWithProviders(<WorkspaceDashboardGrid />, store);

  await waitFor(() => {
    expect(container).not.toBeEmptyDOMElement();
  });

  return container;
};

const panelHeadings = (container: HTMLElement): HTMLElement[] =>
  within(container).queryAllByRole('heading', { level: 2 });

describe('WorkspaceDashboardGrid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // AC-14 — the four Panels in the order `design-handoff.md` § Panel order
  // fixes, written out rather than derived from the fixture so the case cannot
  // pass by comparing the rendering against itself.
  it('draws the four Panels in the order the design fixed', async () => {
    const container = await enterDashboard();

    expect(panelHeadings(container)).toHaveLength(4);

    const text = container.textContent ?? '';
    expect(text.indexOf(workspacePanelMarkers.demandPressure)).toBeGreaterThan(
      -1,
    );
    expect(
      text.indexOf(workspacePanelMarkers.purchasingSpread),
    ).toBeGreaterThan(text.indexOf(workspacePanelMarkers.demandPressure));
    expect(
      text.indexOf(workspacePanelMarkers.receiptReliability),
    ).toBeGreaterThan(text.indexOf(workspacePanelMarkers.purchasingSpread));
  });

  // AC-15/AC-22 — a Workspace Member whose Role does not carry the observation
  // Permission reaches the denial **at** the address, and the grid draws no
  // Panel at all. Read from the Permission rather than from the cache being
  // empty, which is what makes the next two cases distinguishable from it.
  it('presents the denial to an actor whose Role does not admit the Dashboard', async () => {
    const container = await enterDashboard({ workspacePermissionIds: [] });

    expect(panelHeadings(container)).toHaveLength(0);
    expect(container.textContent).not.toContain(
      workspacePanelMarkers.demandPressure,
    );
  });

  // The eviction defect the conformance review found. The loader dispatches
  // with `subscribe: false`, so without the destination's own subscription RTK
  // Query collects every entry 60 s after it settles — and the surface, which
  // used to infer the denial from an empty grid, replaced itself with the
  // authorization refusal while the member was still looking at it.
  //
  // The clock is faked before the loader runs, because the removal timeout is
  // scheduled the moment a subscriber-less read settles.
  it('keeps every Panel past keepUnusedDataFor, so dwelling does not turn into a denial', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const container = await enterDashboard();
    expect(panelHeadings(container)).toHaveLength(4);

    await vi.advanceTimersByTimeAsync(KEEP_UNUSED_DATA_FOR_MS + 5_000);

    expect(panelHeadings(container)).toHaveLength(4);
    expect(container.textContent).toContain(
      workspacePanelMarkers.demandPressure,
    );
  });

  // `docs/system/frontend-architecture.md` §Page — "a permitted actor whose
  // read failed still reaches that component's own error arm rather than an
  // empty surface". The failed Panel keeps its cell, so an absence still means
  // "not permitted" and nothing else, and no denial is presented.
  it('gives a permitted Panel whose read failed its own arm, not an absence', async () => {
    const container = await enterDashboard({ failing: [DEMAND_PRESSURE_URL] });

    await waitFor(() => {
      expect(within(container).getByRole('status')).toBeInTheDocument();
    });

    expect(panelHeadings(container)).toHaveLength(4);
    expect(container.textContent).not.toContain(
      workspacePanelMarkers.demandPressure,
    );
    expect(container.textContent).toContain(
      workspacePanelMarkers.purchasingSpread,
    );
  });
});
