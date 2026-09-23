import type { CSSProperties } from 'react';

/**
 * The density rule every row-oriented Dashboard Panel is drawn to.
 *
 * `design-handoff.md` § Responsive behavior → "Row-count pressure" records
 * what was ruled at the `tasks` gate on 2026-09-21: **list rows flex between
 * 20 px and 26 px; below 20 px the Panel scrolls internally while the surface
 * does not.** Nothing implemented it, so a row took whatever height
 * `@heroui/styles`' `.table__cell` gives it (`px-4 py-3 text-sm` — 20 px of
 * line plus 24 px of padding, measured at 45 px), and enough of those pushed
 * both Dashboards past one screen. The one-screen requirement is § Grid
 * geometry's whole point, so the rule is expressed here once and read by every
 * Panel that lists rows.
 *
 * It is expressed as **declared CSS**, not as a measurement: the row height is
 * a `clamp()` whose bounds are the ruled 20 and 26, and the list region
 * carries the Panel's own height budget as a `max-height` with
 * `overflow-y: auto`. A row count the budget cannot seat at the floor
 * therefore floors there and the list region scrolls inside the Card, which is
 * the second half of the rule.
 *
 * ### Where a Panel's own budget comes from, and why it is a parameter
 *
 * `design-handoff.md` § Grid geometry fixes the desktop budget at 1280 x 800:
 * header 80 + footer 33 + main padding 48 leaves a grid of 639, spent as
 * row 1 + gap 16 + row 2 — **355 / 268 on the Warehouse Dashboard and
 * 311 / 312 on the Workspace one**. Four different budgets, so the height a
 * Panel may occupy is an argument to {@link panelListHeightPx} rather than a
 * constant baked in here; each surface declares its own rows in its module's
 * `utils/panel-list-budget.ts`.
 *
 * Inside whichever budget applies, HeroUI's `Card` contract — which
 * § Component mapping forbids restyling — spends a fixed amount before the
 * list starts ({@link PANEL_CARD_CHROME_PX}), and whatever the Panel draws
 * beside its list comes out of the rest.
 *
 * ### Why the row bounds are a parameter too
 *
 * The ruled 20-26 flex is the default and is what a single-line row takes. Two
 * Panels cannot reach the 20 px floor, and neither conflict is resolved by
 * crushing a mark the design fixes:
 *
 * - **Purchasing Spread**'s cells are the heat grid, whose geometry
 *   § Type and mark specs fixes at "84 x 30, radius 6, count printed in every
 *   cell". A 30 px cell in a 20 px row is not the rule applied, it is the cell
 *   spec abandoned.
 * - **Demand Pressure**'s row stacks a bar — 12 px by the same table — over
 *   the three Urgency Band quantities § Accessibility requires printed, which
 *   is 24 px before anything else.
 *
 * Where a Panel's own marks are taller than the ruled floor, that Panel's
 * floor is what its marks need and the **second half of the rule carries the
 * rest**: the list region scrolls inside the Card while the surface does not.
 * Lowering the floor under a mark would not save the pixel anyway — the cell
 * declares `overflow-hidden`, so the mark would be sliced rather than shrunk.
 */

/** The ruled floor: no single-line list row is drawn shorter than this. */
export const PANEL_ROW_MIN_HEIGHT_PX = 20;

/** The ruled ceiling: a list with room to spare stops growing its rows here. */
export const PANEL_ROW_MAX_HEIGHT_PX = 26;

/**
 * The height a list row may flex between. The ruled 20-26 is
 * {@link PANEL_ROW_BOUNDS}; a Panel whose own marks are taller declares its
 * own, and scrolls internally rather than slicing them.
 */
export type PanelRowBounds = {
  maxPx: number;
  minPx: number;
};

/** The ruled flex, and the default every single-line row takes. */
export const PANEL_ROW_BOUNDS: PanelRowBounds = {
  minPx: PANEL_ROW_MIN_HEIGHT_PX,
  maxPx: PANEL_ROW_MAX_HEIGHT_PX,
};

/**
 * The list's header row: two wrapped lines of `text-xs` plus `py-1`. Budgeted
 * for two lines so a column head that does not fit on one wraps instead of
 * being clipped, without the Panel growing past its row budget when it does.
 */
export const PANEL_LIST_HEADER_HEIGHT_PX = 40;

/** `Card` `p-4` x 2 + one `text-sm` header line + `Card` `gap-3`. */
export const PANEL_CARD_CHROME_PX = 64;

/**
 * How much of a Panel is left for its list once the Card chrome and whatever
 * the Panel draws beside the list — a legend above it, a scale legend and a
 * footnote below it, and `.card__content`'s own `gap-1` between each — are
 * taken out of the height § Grid geometry gives that Panel's grid row.
 */
export const panelListHeightPx = (
  panelHeightPx: number,
  drawnAsideTheListPx: number,
): number => panelHeightPx - PANEL_CARD_CHROME_PX - drawnAsideTheListPx;

/**
 * Every column head: the design's inter-column gap expressed as padding each
 * neighbour contributes half of, `text-xs` per § Type and mark specs, and a
 * head that wraps to the second budgeted line rather than being sliced.
 */
export const PANEL_LIST_COLUMN_CLASS =
  'whitespace-normal px-1 py-1 align-bottom text-xs leading-4';

/**
 * Every list cell: the bounded row height, no vertical padding of its own, and
 * `text-xs` — `.table__cell` declares `text-sm`, which § Type and mark specs
 * does not give a data label.
 */
export const PANEL_LIST_CELL_CLASS =
  'h-[var(--dashboard-row-height)] overflow-hidden px-1 py-0 text-xs leading-4';

/** The custom property `PANEL_LIST_CELL_CLASS` reads its height from. */
export type PanelListStyle = CSSProperties & {
  '--dashboard-row-height': string;
};

/**
 * The list region's declared constraints: the Panel's height budget as a
 * ceiling it scrolls inside, and the row height as a `clamp()` between the
 * bounds that Panel's own marks admit.
 *
 * The division is left to CSS rather than resolved here so the rule is legible
 * in the element it governs, and so a fractional row height is the browser's
 * subpixel layout rather than a rounded number that drifts the list off its
 * budget over eleven rows.
 */
export const panelListStyle = (
  listHeightPx: number,
  rowCount: number,
  bounds: PanelRowBounds = PANEL_ROW_BOUNDS,
): PanelListStyle => ({
  maxHeight: `${listHeightPx}px`,
  '--dashboard-row-height': `clamp(${bounds.minPx}px, calc((${listHeightPx}px - ${PANEL_LIST_HEADER_HEIGHT_PX}px) / ${Math.max(rowCount, 1)}), ${bounds.maxPx}px)`,
});
