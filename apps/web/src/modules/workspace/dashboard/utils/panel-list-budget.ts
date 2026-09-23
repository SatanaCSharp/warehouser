import type { PanelRowBounds } from 'shared/utils/panel-list-density';
import { panelListHeightPx } from 'shared/utils/panel-list-density';

/**
 * The Workspace Dashboard's own share of `design-handoff.md` § Grid geometry,
 * and what each of its two row-oriented Panels may spend on its list.
 *
 * The rule those heights are spent against — the row-height flex, the internal
 * scroll past its floor, the Card-chrome arithmetic — is
 * `shared/utils/panel-list-density.ts`, which both Dashboards read. What stays
 * here is only what is this surface's: the height § Grid geometry gives its
 * grid rows, what each Panel draws beside its list, and the two row heights
 * this surface's own marks fix.
 *
 * ### Where the numbers come from
 *
 * § Grid geometry spends the 639 px grid as row 1 **311** + gap 16 + row 2
 * **312**, and § Panel order fixes which Panel sits where: Demand Pressure and
 * Order Flow on row 1, Purchasing Spread and Receipt Reliability on row 2. So
 * Demand Pressure may occupy 311 and Purchasing Spread 312. Neither did: they
 * drew 357 and 348 at rows of 51 px and 45 px — the `.table__cell` default
 * (`px-4 py-3 text-sm`) that
 * `design-handoff.md` § Responsive behavior → "Row-count pressure" was ruled
 * against — which overflowed the surface by about 80 px at the design's own
 * 800 px viewport.
 *
 * The Card chrome takes 64 px of each budget. Both Panels draw the same three
 * things in `Card.Content` and therefore spend the same 40 px beside the list:
 * a one-line `text-xs` legend (16), a one-line `text-xs` footnote (16), and
 * `.card__content`'s own `gap-1` twice (8). That leaves **207** for Demand
 * Pressure's list and **208** for Purchasing Spread's.
 *
 * The arithmetic that follows, with the list's own 40 px header row taken out
 * first and the seeded Workspace's four active Warehouses in it:
 *
 * - Demand Pressure, 4 rows: `(207 - 40) / 4` = 41.75, clamped to the ruled
 *   ceiling 26, so 4 x 26 + 40 = 144 and the Panel is 248 — under its 311,
 *   which § Reflow allows, since only a row with all four Panels stretches.
 * - Purchasing Spread, 4 rows: its cells are fixed at 30 (below), so
 *   4 x 30 + 40 = 160 and the Panel is 264 — under its 312.
 *
 * § 6 bounds a Workspace at 20 Warehouses, and neither Panel seats 20 rows
 * inside its budget: Demand Pressure scrolls internally past 6 and Purchasing
 * Spread past 5, which is the second half of the ruled behaviour and is why
 * the list region and not the surface is what carries the ceiling.
 */

/** Row 1 of the desktop grid (`design-handoff.md` § Grid geometry). */
export const ROW_ONE_PANEL_HEIGHT_PX = 311;

/** Row 2 of the desktop grid (`design-handoff.md` § Grid geometry). */
export const ROW_TWO_PANEL_HEIGHT_PX = 312;

/**
 * What both Panels draw beside their list: a legend line (16), a footnote line
 * (16), and `.card__content`'s own `gap-1` on each side of the list (4 + 4).
 */
const LEGEND_FOOTNOTE_AND_GAPS_PX = 16 + 16 + 4 + 4;

/** Demand Pressure is row 1, and draws a legend above and a footnote below. */
export const DEMAND_PRESSURE_LIST_HEIGHT_PX = panelListHeightPx(
  ROW_ONE_PANEL_HEIGHT_PX,
  LEGEND_FOOTNOTE_AND_GAPS_PX,
);

/**
 * Purchasing Spread is row 2, and draws its scale legend and its footnote
 * below the grid.
 */
export const PURCHASING_SPREAD_LIST_HEIGHT_PX = panelListHeightPx(
  ROW_TWO_PANEL_HEIGHT_PX,
  LEGEND_FOOTNOTE_AND_GAPS_PX,
);

/**
 * Demand Pressure's row cannot reach the ruled 20 px floor, and neither half
 * of what fills it may be given up to get there: § Type and mark specs fixes
 * this Panel's bar at **12 px**, and § Accessibility ("Never colour alone")
 * requires each of the three Urgency Band quantities printed, which the row
 * sets on its own line beneath the bar. 12 + a 2 px gap + a 10 px line of
 * figures is 24 before the row holds anything else, and the list cell declares
 * `overflow-hidden`, so a 20 px row would slice the figures rather than shrink
 * them.
 *
 * So this Panel's floor is 24 and its ceiling stays the ruled 26. Below 24 the
 * Panel scrolls internally while the surface does not, which is the half of
 * the rule written for exactly this.
 */
export const DEMAND_PRESSURE_ROW_BOUNDS: PanelRowBounds = {
  minPx: 24,
  maxPx: 26,
};

/**
 * Purchasing Spread's row is one heat-grid cell tall, and § Type and mark
 * specs fixes that cell at **84 x 30, radius 6, count printed in every cell**.
 * The count is printed inside the fill, so the cell is the row: flexing the
 * row between 20 and 26 would be shrinking a mark the design states in pixels,
 * not applying the density rule to it.
 *
 * The bounds are therefore a point rather than a range. Five Warehouses seat
 * inside the 208 px budget at 30 px; past that the grid scrolls inside the
 * Card while the surface does not — the second half of the ruled behaviour,
 * taken deliberately in preference to crushing the cell spec.
 */
export const PURCHASING_SPREAD_ROW_BOUNDS: PanelRowBounds = {
  minPx: 30,
  maxPx: 30,
};
