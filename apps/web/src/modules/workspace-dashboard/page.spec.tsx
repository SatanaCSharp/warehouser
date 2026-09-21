import { within } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { loadWorkspaceDashboard } from 'modules/workspace-dashboard/loaders/workspace-dashboard.loader';
import { WorkspaceDashboardPage } from 'modules/workspace-dashboard/page';
import type { AppStore } from 'store';
import { authenticatedStore } from 'test/access-fixtures';
import {
  amendedDemandPressurePanel,
  demandPressurePanel,
  stubWorkspaceDashboardServer,
  workspacePanelMarkers,
} from 'test/dashboard-fixtures';
import { renderWithProviders } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T19 — the Workspace Dashboard destination (AC-14, AC-15, AC-22, AC-26).
// Colocated with the page it covers (`placing-web-tests.md` §1).
//
// Every case enters through the **real loader** rather than seeding the cache
// by hand, so what the destination draws is what the actor's Workspace Role
// actually admitted — the test hole
// `docs/system/adr/19-08-2026-declarative-permission-gates.md` § Consequences
// names, where a spec asserts a surface the actor's real authority never
// granted.
//
// Nothing here matches translated copy. The three Warehouse-listing Panels are
// told apart by the Warehouse name each of them is required to print
// (`design-handoff.md` § Panel specifications, § Accessibility), which is also
// what makes the fixed **order** assertable.

const WATCH_PERFORMANCE = [
  WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
] as const;

/**
 * Runs the real loader for an actor holding `workspacePermissionIds`, then
 * mounts the destination over the cache that loader filled.
 */
const enterDashboard = async ({
  workspacePermissionIds = WATCH_PERFORMANCE,
}: {
  workspacePermissionIds?: readonly WorkspacePermissionId[];
} = {}): Promise<{
  container: HTMLElement;
  /**
   * What the route had issued at the moment the loader settled — snapshotted
   * before the destination mounts, so the surface's own paint cannot be
   * compared against itself.
   */
  issuedByTheLoader: string[];
  /** The live list, still growing with every request the stub serves. */
  requestedUrls: string[];
  store: AppStore;
}> => {
  const requestedUrls = stubWorkspaceDashboardServer({
    workspacePermissionIds,
  });
  const store = authenticatedStore();

  await loadWorkspaceDashboard({ context: { store } });
  const issuedByTheLoader = [...requestedUrls];

  const { container } = renderWithProviders(<WorkspaceDashboardPage />, store);

  return { container, issuedByTheLoader, requestedUrls, store };
};

const panelHeadings = (container: HTMLElement): HTMLElement[] =>
  within(container).queryAllByRole('heading', { level: 2 });

/**
 * Which Panel of the grid printed `marker`, counted in Panel headings rather
 * than in characters: the index of the last `h2` standing before the marker in
 * document order. `-1` for a marker nothing printed.
 *
 * Counting headings rather than string positions is what lets Order Flow's
 * position be asserted at all — it names no Warehouse (AC-16) and its column
 * plot prints bucket labels rather than values, so it carries no marker of its
 * own and is pinned by the three around it.
 */
const panelIndexOf = (container: HTMLElement, marker: string): number => {
  const elements = [...container.querySelectorAll('*')];
  const holder = elements.findIndex(
    (element) =>
      element.children.length === 0 &&
      (element.textContent ?? '').includes(marker),
  );

  if (holder === -1) {
    return -1;
  }

  return (
    panelHeadings(container).filter(
      (heading) => elements.indexOf(heading) < holder,
    ).length - 1
  );
};

describe('WorkspaceDashboardPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // AC-14 + `design-handoff.md` § Panel order — one fixed order governs the
  // grid: Demand Pressure, Order Flow, Purchasing Spread, Receipt Reliability.
  // The three markers land at 0, 2 and 3, which places Order Flow at 1 by
  // exclusion and states the whole order.
  it('draws the four Panels in the fixed order', async () => {
    const { container } = await enterDashboard();

    expect(panelHeadings(container)).toHaveLength(4);
    expect([
      panelIndexOf(container, workspacePanelMarkers.demandPressure),
      panelIndexOf(container, workspacePanelMarkers.purchasingSpread),
      panelIndexOf(container, workspacePanelMarkers.receiptReliability),
    ]).toStrictEqual([0, 2, 3]);
  });

  // `design-handoff.md` § Accessibility — no visible page heading, lede or chip
  // row above the grid; the accessible name is a visually-hidden `h1`, so the
  // heading order stays `h1 -> h2 x 4`.
  it('names the destination with a visually-hidden h1 and no visible masthead', async () => {
    const { container } = await enterDashboard();

    const headings = within(container).getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].className).toMatch(/\bsr-only\b/u);
  });

  // `design-handoff.md` § States — no controls, filters, drill-through or
  // refresh: the surface is read on entering and offers no route out of a
  // figure.
  it('offers no control on the surface', async () => {
    const { container } = await enterDashboard();

    expect(within(container).queryAllByRole('button')).toStrictEqual([]);
    expect(within(container).queryAllByRole('link')).toStrictEqual([]);
    expect(within(container).queryAllByRole('combobox')).toStrictEqual([]);
    expect(within(container).queryAllByRole('textbox')).toStrictEqual([]);
  });

  // AC-15 — a Workspace Member whose Workspace Role does not carry the
  // observation Permission reaches a **denial rendered at the address**. It
  // draws no Panel, no frame, no axis and no total; the statement itself is
  // present.
  it('presents a denial in place of every Panel without the Permission', async () => {
    const { container } = await enterDashboard({ workspacePermissionIds: [] });

    expect(panelHeadings(container)).toStrictEqual([]);
    expect(container.querySelectorAll('table')).toHaveLength(0);
    expect(within(container).queryAllByRole('figure')).toStrictEqual([]);
    expect((container.textContent ?? '').trim()).not.toBe('');
  });

  // AC-15 — and the denial "presents no Warehouse name, quantity, count or
  // share, and reveals nothing about how many Warehouses the Workspace holds or
  // whether any of them has anything outstanding". No digit at all is the
  // mechanical form of that: a count the member could read is a count the
  // denial disclosed.
  it('names no Warehouse and states no figure in the denial', async () => {
    const { container } = await enterDashboard({ workspacePermissionIds: [] });
    const text = container.textContent ?? '';

    for (const marker of Object.values(workspacePanelMarkers)) {
      expect(text).not.toContain(marker);
    }
    expect(text).not.toContain('Main Warehouse');
    expect(text).not.toMatch(/\d/u);
    for (const permission of Object.values(WorkspacePermissionId)) {
      expect(text).not.toContain(permission);
    }
  });

  // AC-22 — a Warehouse Member holding every watch Permission in their own
  // Warehouse and **no Workspace Role at all** reaches exactly the same denial:
  // authority in one Warehouse says nothing about the Workspace above it. The
  // stub answers that Warehouse's projection with every watch Permission, so
  // the Warehouse authority is genuinely present and genuinely ignored.
  it('denies a Warehouse Member holding every watch Permission and no Workspace Role', async () => {
    const { container, issuedByTheLoader } = await enterDashboard({
      workspacePermissionIds: [],
    });

    expect(panelHeadings(container)).toStrictEqual([]);
    expect(
      issuedByTheLoader.filter((url) => url.includes('/workspace/dashboard/')),
    ).toStrictEqual([]);
  });

  // `spec.md` §6 "Read shape" — every figure is awaited by the route, so the
  // destination mounts with all four present and issues **nothing** afterwards.
  // A per-Panel read fired on mount would also be a per-Panel waiting window,
  // which `frontend-architecture.md` §Page gives the route rather than a
  // component.
  it('issues no read after the surface is presented', async () => {
    const { container, issuedByTheLoader, requestedUrls } =
      await enterDashboard();

    // The snapshot is taken before the destination mounts, so this is a real
    // comparison rather than a list against itself: the Workspace context plus
    // the four Panels, and nothing added by the paint.
    expect(issuedByTheLoader).toHaveLength(5);
    expect(container.textContent).toContain(
      workspacePanelMarkers.demandPressure,
    );
    expect(requestedUrls).toStrictEqual(issuedByTheLoader);
  });

  // AC-26 — entering again after a Customer Order is recorded shows the change.
  // Freshness is refetch-on-entry and no mutation invalidates a tag here, so the
  // second entry must present the amended figure and nothing carried over from
  // before it (sad.md §8 "Freshness").
  it('shows the amended figure on re-entry and carries nothing over', async () => {
    const supersededOutstanding = String(
      demandPressurePanel.warehouses[0].totalOutstandingQuantity,
    );
    const amendedOutstanding = String(
      amendedDemandPressurePanel.warehouses[0].totalOutstandingQuantity,
    );
    const { store } = await enterDashboard();

    vi.unstubAllGlobals();
    stubWorkspaceDashboardServer({
      demandPressure: amendedDemandPressurePanel,
      workspacePermissionIds: WATCH_PERFORMANCE,
    });
    await loadWorkspaceDashboard({ context: { store } });
    const { container } = renderWithProviders(
      <WorkspaceDashboardPage />,
      store,
    );

    expect(container.textContent).toContain(amendedOutstanding);
    expect(container.textContent).not.toContain(supersededOutstanding);
  });
});
