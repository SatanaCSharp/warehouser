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
 * The scale's range. The frame draws the track at 88 px inside a 130 px bar
 * cell and narrower at 390, so a mark is measured onto the track's own width
 * rather than onto a pixel count that would overflow it at the other viewport.
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
    <span className="font-semibold tabular-nums text-foreground">
      <span
        className="mr-1.5 inline-flex h-2.5 w-10 align-middle sm:w-[88px]"
        style={{ backgroundColor: 'var(--chart-track)' }}
      >
        <span
          aria-hidden="true"
          className="h-full rounded-r-[3px]"
          style={{
            backgroundColor: 'var(--chart-ramp-3b)',
            width: `${linearScale(refusedQuantity, domainMax, FULL_TRACK)}%`,
          }}
        />
      </span>
      {quantity(refusedQuantity)}
    </span>
  );
};
