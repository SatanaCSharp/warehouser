/**
 * The Coverage Gap Panel's three series, and the quantities each row carries.
 *
 * Declared here rather than beside the bar that draws them because a component
 * file exports components and nothing else (`react/only-export-components`),
 * and because a file that declares no hook belongs in a `utils/` directory
 * (`docs/system/guides/placing-web-hooks.md` §3). The Panel builds its legend
 * from the same ids, so the legend's text and the marks' colours cannot drift
 * apart.
 *
 * No label lives here. The series are ids and token names only, which is what
 * lets `CoverageGapBar` read no translation and therefore hold nothing a
 * cached row could freeze
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
 * §Decision 2).
 */

/** The quantities a named row and the Remainder Row both carry (AC-03). */
export type CoverageGapQuantities = {
  inboundQuantity: number;
  onHandQuantity: number;
  uncoveredQuantity: number;
};

/** The three series in drawing order, dark → light. */
export const COVERAGE_GAP_SERIES = [
  { id: 'onHand', colorVar: '--chart-ramp-3a' },
  { id: 'onOrder', colorVar: '--chart-ramp-3b' },
  { id: 'uncovered', colorVar: '--chart-ramp-3c' },
] as const;
