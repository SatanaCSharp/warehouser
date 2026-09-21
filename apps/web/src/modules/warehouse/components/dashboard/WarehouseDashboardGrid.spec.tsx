import { waitFor, within } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import { WarehouseDashboardGrid } from 'modules/warehouse/components/dashboard/WarehouseDashboardGrid';
import { loadWarehouseDashboard } from 'modules/warehouse/loaders/warehouse-dashboard.loader';
import type { AppStore } from 'store';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import {
  allWatchPermissions,
  panelMarkers,
  panelPermissions,
  stubDashboardServer,
} from 'test/dashboard-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T16 — the Warehouse Dashboard's grid: the fixed Panel order, the reflow rule,
// the denial and the archived strip (AC-01, AC-02, AC-02a, AC-13, AC-23).
// Colocated with the component it covers (`placing-web-tests.md` §1).
//
// Every case enters through the real loader rather than seeding the cache by
// hand, so what the grid draws is what the actor's Permissions actually
// admitted — the test hole
// `docs/system/adr/19-08-2026-declarative-permission-gates.md` § Consequences
// names, where a spec asserts a surface the actor's real authority never
// granted.
//
// Nothing here matches translated copy. The four Panels are told apart by a
// figure each one is required to print — the Item name on a Coverage Gap row,
// the Reason wording, every Purchasing Pipeline segment's count, the Arrival
// Timing footnote's exclusion count (`design-handoff.md` § Panel
// specifications) — which is also what makes the **order** assertable.

type Verdict = Omit<WarehouseEntryVerdict, 'warehouseId'>;

const ENTERED: Verdict = { status: 'entered' };
const ARCHIVED: Verdict = { status: 'entered-read-only', reason: 'archived' };

/**
 * `renderInEnteredWarehouse` mounts a TanStack `RouterProvider`, and the
 * router's initial `load()` settles in a macrotask — so `render` returns before
 * the routed subtree has painted and `container` is still empty at that moment.
 * That is a property of the harness, not of the surface under test, so every
 * consumer of the helper awaits the first paint
 * (`shared/components/WarehousePermissionGate.spec.tsx` is the precedent).
 * Awaiting it once here is what lets each case below read `container`
 * synchronously.
 */
const painted = async (container: HTMLElement): Promise<HTMLElement> => {
  await waitFor(() => {
    expect(container).not.toBeEmptyDOMElement();
  });

  return container;
};

const enterDashboard = async (
  permissionIds: readonly PermissionId[],
  verdict: Verdict = ENTERED,
): Promise<HTMLElement> => {
  const archivedAt =
    verdict.status === 'entered-read-only' ? '2026-09-01T00:00:00.000Z' : null;
  stubDashboardServer({ archivedAt, permissionIds });

  const store: AppStore = authenticatedStore();
  await loadWarehouseDashboard({
    context: { ...verdict, store, warehouseId: accessIds.warehouse },
  });

  const { container } = renderInEnteredWarehouse(
    <WarehouseDashboardGrid />,
    store,
    accessIds.warehouse,
    verdict,
  );

  return painted(container);
};

const panelHeadings = (container: HTMLElement): HTMLElement[] =>
  within(container).queryAllByRole('heading', { level: 2 });

/**
 * Where each Panel's own printed figure appears in the rendered text, in the
 * order the document holds it. `-1` for a Panel that drew nothing at all.
 */
const markerPositions = (
  container: HTMLElement,
): Record<keyof typeof panelMarkers, number> => {
  const text = container.textContent ?? '';

  return {
    coverageGap: text.indexOf(panelMarkers.coverageGap),
    reasonConcentration: text.indexOf(panelMarkers.reasonConcentration),
    arrivalTiming: text.indexOf(panelMarkers.arrivalTiming),
    purchasingPipeline: text.indexOf(panelMarkers.purchasingPipeline),
  };
};

/**
 * The grid cell a Panel occupies, when that cell declares a column span. A row
 * holding a single Panel spans both columns
 * (`design-handoff.md` § Reflow when fewer Panels are permitted).
 */
const spanningCell = (heading: HTMLElement): Element | null =>
  heading.closest('[class*="col-span-2"], [class*="col-span-full"]');

describe('WarehouseDashboardGrid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // AC-01 + `design-handoff.md` § Panel order — one fixed order governs the
  // grid and every reflow: Coverage Gap, Reason Concentration, Arrival Timing,
  // Purchasing Pipeline.
  it('draws the four permitted Panels in the fixed order', async () => {
    const container = await enterDashboard(allWatchPermissions);

    expect(panelHeadings(container)).toHaveLength(4);

    const at = markerPositions(container);
    expect(at.coverageGap).toBeGreaterThanOrEqual(0);
    expect(at.reasonConcentration).toBeGreaterThan(at.coverageGap);
    expect(at.arrivalTiming).toBeGreaterThan(at.reasonConcentration);
    expect(at.purchasingPipeline).toBeGreaterThan(at.arrivalTiming);
  });

  // AC-01 — with all four permitted the surface is a two-column grid, so no
  // Panel spans both columns.
  it('spans no Panel across both columns while four are permitted', async () => {
    const container = await enterDashboard(allWatchPermissions);

    expect(panelHeadings(container).map(spanningCell)).toStrictEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  // AC-01 — no controls, and nothing the member must choose before reading.
  it('offers no control on the surface', async () => {
    const container = await enterDashboard(allWatchPermissions);

    expect(within(container).queryAllByRole('button')).toStrictEqual([]);
    expect(within(container).queryAllByRole('link')).toStrictEqual([]);
    expect(within(container).queryAllByRole('combobox')).toStrictEqual([]);
    expect(within(container).queryAllByRole('textbox')).toStrictEqual([]);
  });

  // AC-02a — the Purchasing Pipeline is the only Panel every one of whose
  // figures a Purchase-Drafts-only member may read. It occupies the surface as
  // though the other three had never been part of it: it spans both columns,
  // and nothing says a Panel was withheld.
  it('presents the one admitted Panel spanning both columns with no trace of the withheld three', async () => {
    const container = await enterDashboard(panelPermissions.purchasingPipeline);

    const headings = panelHeadings(container);
    expect(headings).toHaveLength(1);
    expect(spanningCell(headings[0])).not.toBeNull();

    const at = markerPositions(container);
    expect(at.purchasingPipeline).toBeGreaterThanOrEqual(0);
    expect(at.coverageGap).toBe(-1);
    expect(at.reasonConcentration).toBe(-1);
    expect(at.arrivalTiming).toBe(-1);
  });

  // AC-13 — a member lacking only REJECTIONS:WATCH sees the three Panels they
  // may read and **nothing at all** in place of Reason Concentration: no
  // frame, no title and no count. Three Panels, so the third spans both
  // columns on the second row.
  it('reflows to three Panels with nothing standing where Reason Concentration would', async () => {
    const container = await enterDashboard([
      PermissionId.CUSTOMER_ORDERS_WATCH,
      PermissionId.ITEMS_WATCH,
      PermissionId.PURCHASE_DRAFTS_WATCH,
    ]);

    const headings = panelHeadings(container);
    expect(headings).toHaveLength(3);
    expect(spanningCell(headings[2])).not.toBeNull();

    const at = markerPositions(container);
    expect(at.reasonConcentration).toBe(-1);
    expect(at.coverageGap).toBeGreaterThanOrEqual(0);
    expect(at.arrivalTiming).toBeGreaterThan(at.coverageGap);
    expect(at.purchasingPipeline).toBeGreaterThan(at.arrivalTiming);
  });

  // AC-02 — a member carrying some watch Permissions and no Panel's whole set
  // reaches a denial. ITEMS:WATCH alone admits nothing: Coverage Gap also needs
  // Customer Orders and Purchase Drafts.
  it('presents a denial carrying no frame, no axis and no total', async () => {
    const container = await enterDashboard([PermissionId.ITEMS_WATCH]);

    expect(panelHeadings(container)).toStrictEqual([]);
    // The shipped denial pattern draws one icon, an `h1` and a muted `p`
    // (`design-handoff.md` § Component mapping), so what must be absent is the
    // chart apparatus: no Panel frame, no tabular row-oriented Panel, no
    // figure. The statement itself is present.
    expect(container.querySelectorAll('table')).toHaveLength(0);
    expect(within(container).queryAllByRole('figure')).toStrictEqual([]);
    expect((container.textContent ?? '').trim()).not.toBe('');
  });

  // AC-02 — and the statement reveals neither which Permission fell short nor
  // anything the Warehouse holds.
  it('names no Permission and nothing the Warehouse holds in the denial', async () => {
    const container = await enterDashboard([PermissionId.ITEMS_WATCH]);
    const text = container.textContent ?? '';

    for (const permission of Object.values(PermissionId)) {
      expect(text).not.toContain(permission);
    }
    expect(markerPositions(container)).toStrictEqual({
      coverageGap: -1,
      reasonConcentration: -1,
      arrivalTiming: -1,
      purchasingPipeline: -1,
    });
  });

  // AC-23 — an archived Warehouse is served on exactly the Permission terms
  // that applied before it was archived: the same four Panels, in the same
  // order, plus the shipped `ArchivedWarehouseChip` strip above the grid.
  it('adds the archived strip and changes no Permission term', async () => {
    const container = await enterDashboard(allWatchPermissions, ARCHIVED);

    expect(panelHeadings(container)).toHaveLength(4);
    expect(
      within(container).getByText('Archived warehouse'),
    ).toBeInTheDocument();
  });

  // AC-23 — and it offers nothing that would change what the Warehouse holds.
  it('offers no operation in an archived Warehouse', async () => {
    const container = await enterDashboard(allWatchPermissions, ARCHIVED);

    expect(within(container).queryAllByRole('button')).toStrictEqual([]);
    expect(within(container).queryAllByRole('menuitem')).toStrictEqual([]);
  });
});
