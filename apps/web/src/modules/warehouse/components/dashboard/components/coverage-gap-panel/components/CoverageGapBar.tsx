import type { CoverageGapQuantities } from 'modules/warehouse/utils/coverage-gap-series';
import { COVERAGE_GAP_SERIES } from 'modules/warehouse/utils/coverage-gap-series';
import type { ReactElement } from 'react';
import { linearScale } from 'shared/utils/chart-scale';

/**
 * One row's stacked bar: On hand → On order → Uncovered, dark to light.
 *
 * A component rather than an expression in the cell, for the rule in
 * `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` §Decision 2
 * — a cell renders a component, because a row's element tree is cached per
 * record and an expression would freeze whatever it closed over.
 *
 * The series are ids and token names with no labels
 * (`modules/warehouse/utils/coverage-gap-series.ts`), so this file reads no
 * translation at all. The legend above the table states the same
 * three series as text and every quantity is printed in its own column, so
 * removing colour entirely loses no figure (`design-handoff.md`
 * § Accessibility, "Never colour alone") — which is why every mark here is
 * `aria-hidden`.
 */

/**
 * The scale's range. Every segment is a percentage of the track, so the track
 * itself is sized by the cell it sits in (`w-full`) and a mark never needs a
 * pixel count that would overflow it at another viewport.
 *
 * It used to be `w-16 sm:w-[150px]`: the same pixel width stated twice, once
 * here and once on the column, with neither statement accounting for the
 * padding `.table__cell` spends inside that width. The track was therefore wider
 * than the content box holding it — a 166 px `scrollWidth` in a 150 px
 * `clientWidth`, measured at 1348 x 812 — and the bar ran into the numeric
 * column beside it. `w-full` states the width once, where the browser already
 * knows the answer.
 */
const FULL_TRACK = 100;

/**
 * The segments a row actually draws. A quantity of zero draws no segment at
 * all, which is how an Item with nothing uncovered "simply has no third
 * segment" (AC-05) rather than a zero-width mark nobody can see but every
 * reader still counts.
 */
const drawnSegments = (
  quantities: CoverageGapQuantities,
): { colorVar: string; id: string; value: number }[] =>
  [
    { ...COVERAGE_GAP_SERIES[0], value: quantities.onHandQuantity },
    { ...COVERAGE_GAP_SERIES[1], value: quantities.inboundQuantity },
    { ...COVERAGE_GAP_SERIES[2], value: quantities.uncoveredQuantity },
  ].filter(({ value }) => value > 0);

type CoverageGapBarProps = {
  /** The largest total on the Panel — every row is measured against it. */
  domainMax: number;
  quantities: CoverageGapQuantities;
};

export const CoverageGapBar = ({
  domainMax,
  quantities,
}: CoverageGapBarProps): ReactElement => {
  const drawn = drawnSegments(quantities);

  return (
    <span
      className="flex h-2.5 w-full items-center gap-[2px]"
      style={{ backgroundColor: 'var(--chart-track)' }}
    >
      {drawn.map(({ colorVar, id, value }, index) => (
        <span
          aria-hidden="true"
          className={
            index === drawn.length - 1 ? 'h-full rounded-r-[3px]' : 'h-full'
          }
          key={id}
          style={{
            backgroundColor: `var(${colorVar})`,
            width: `${linearScale(value, domainMax, FULL_TRACK)}%`,
          }}
        />
      ))}
    </span>
  );
};
