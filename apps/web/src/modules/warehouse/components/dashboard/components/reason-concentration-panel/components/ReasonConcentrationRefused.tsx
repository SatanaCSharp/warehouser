import type { ReactElement } from 'react';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { linearScale } from 'shared/utils/chart-scale';

/**
 * A Reason's refused quantity: the bar that measures it, then the figure
 * itself.
 *
 * The two belong in one cell because the design draws them in one
 * (`design-handoff.md` § Panel specifications), and in one component because a
 * cell renders a component rather than an expression — the figure is formatted
 * by `useLocaleFormat`, which a cached row must not close over
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
 * §Decision 2).
 *
 * The mark is `aria-hidden`: the figure beside it states the same value, so
 * removing colour loses nothing (`design-handoff.md` § Accessibility, "Never
 * colour alone").
 */

/**
 * The scale's range. Every mark is a percentage of the track, so the track is
 * sized by what the cell has left after the figure rather than by a pixel count
 * stated here.
 *
 * The frame draws the bar cell as 130 = track 88 + value 36
 * (`design-handoff.md` § Panel specifications). The Panel draws it at 92 —
 * `ReasonConcentrationPanel.tsx` § Geometry records why the track funds the
 * Reason column rather than the other way round — which is a width this file
 * never needs to know, because the track takes whatever the cell has left
 * after the figure.
 *
 * It used to state the 88
 * as a fixed `w-10 sm:w-[88px]` on an `inline-flex` track followed by the
 * figure as a sibling text node. An `inline-flex` box plus text is one inline
 * formatting context, so the moment 88 + the figure exceeded the cell's content
 * width the figure **wrapped below the bar** — which is what made a 26 px row
 * 65 px tall. A flex row with a growing track and a `flex-none` figure cannot
 * wrap, keeps the two on one line at any width, and still gives every row a
 * track of identical width, so the bars go on comparing with each other.
 */
const FULL_TRACK = 100;

type ReasonConcentrationRefusedProps = {
  /** The largest refused quantity on the Panel — every bar is measured on it. */
  domainMax: number;
  refusedQuantity: number;
};

export const ReasonConcentrationRefused = ({
  domainMax,
  refusedQuantity,
}: ReasonConcentrationRefusedProps): ReactElement => {
  const { quantity } = useLocaleFormat();

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold tabular-nums text-foreground">
      <span
        className="h-2.5 min-w-0 flex-1"
        style={{ backgroundColor: 'var(--chart-track)' }}
      >
        <span
          aria-hidden="true"
          className="block h-full rounded-r-[3px]"
          style={{
            backgroundColor: 'var(--chart-ramp-3b)',
            width: `${linearScale(refusedQuantity, domainMax, FULL_TRACK)}%`,
          }}
        />
      </span>
      <span className="flex-none">{quantity(refusedQuantity)}</span>
    </span>
  );
};
