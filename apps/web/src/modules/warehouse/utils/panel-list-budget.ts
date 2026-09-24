import { panelListHeightPx } from 'shared/utils/panel-list-density';

/**
 * The Warehouse Dashboard's own share of `design-handoff.md` § Grid geometry,
 * and what each of its two row-oriented Panels may spend on its list.
 *
 * The rule those heights are spent against — the row-height flex, the internal
 * scroll past its floor, the Card-chrome arithmetic — is
 * `shared/utils/panel-list-density.ts`, which both Dashboards read. What stays
 * here is only what is this surface's: the height § Grid geometry gives its
 * grid rows, and what each Panel draws beside its list.
 *
 * ### Where the numbers come from
 *
 * § Grid geometry spends the Warehouse Dashboard's 639 px grid as row 1
 * **355** + gap 16 + row 2 268. Coverage Gap and Reason Concentration are
 * row 1, so 355 is the height each of them may occupy; the Card chrome takes
 * 64 of it, leaving 291 px of `Card.Content`.
 *
 * Whatever a Panel draws beside its list comes out of that: Coverage Gap's
 * legend is one `text-xs` line (16) plus `.card__content`'s own `gap-1` (4),
 * so its list gets 271; Reason Concentration draws nothing beside its list, so
 * it gets all 291.
 *
 * The arithmetic that follows, at the row counts the seeded Warehouse
 * produces, with the list's own 40 px header row taken out first:
 *
 * - Coverage Gap, 11 rows: `(271 - 40) / 11` = 21 px, inside 20-26, so 11 x 21
 *   + 40 = 271 and the Panel lands on 355 exactly.
 * - Reason Concentration, 8 rows: `(291 - 40) / 8` = 31.4, clamped to 26 (the
 *   design's own row height for this Panel), so 8 x 26 + 40 = 248 and the
 *   Panel is 312 — under budget, which § Reflow allows, since only a row with
 *   all four Panels stretches.
 * - Reason Concentration, 11 rows: `(291 - 40) / 11` = 22.8, inside 20-26.
 */

/** Row 1 of the desktop grid (`design-handoff.md` § Grid geometry). */
export const ROW_ONE_PANEL_HEIGHT_PX = 355;

/**
 * Coverage Gap draws its legend above the list: one `text-xs` line (16) plus
 * `.card__content`'s own `gap-1` (4).
 */
export const COVERAGE_GAP_LIST_HEIGHT_PX = panelListHeightPx(
  ROW_ONE_PANEL_HEIGHT_PX,
  16 + 4,
);

/** Reason Concentration draws nothing beside its list. */
export const REASON_CONCENTRATION_LIST_HEIGHT_PX = panelListHeightPx(
  ROW_ONE_PANEL_HEIGHT_PX,
  0,
);
