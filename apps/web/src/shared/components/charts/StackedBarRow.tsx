import type { ReactElement } from 'react';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

export type StackedBarSegment = {
  id: string;
  /** The series name a `ChartLegend` states alongside this row; not printed
   * here, so a Rejection or an Item never double-carries it. */
  label: string;
  value: number;
  /** One of the `--chart-*` custom properties. Never a status colour. */
  colorVar: string;
};

type StackedBarRowProps = {
  /** The Item, Reason or Warehouse this row is about. */
  label: string;
  segments: StackedBarSegment[];
  /** The row's own total, printed in its own tabular-nums column so nothing
   * is read from colour alone (design-handoff.md § Panel specifications). */
  total: number;
};

/**
 * One list row of a Coverage-Gap-shaped Panel: a label, a stacked bar over
 * `--chart-track`, every segment's own value, and the row total. Rows flex
 * between 20px and 26px (design-handoff.md § Responsive behavior, ruled at
 * the tasks gate 2026-09-21); nothing in it takes focus, because nothing in
 * `charts/` is interactive.
 */
export const StackedBarRow = ({
  label,
  segments,
  total,
}: StackedBarRowProps): ReactElement => {
  const { quantity } = useLocaleFormat();

  return (
    <div className="flex min-h-[20px] max-h-[26px] items-center gap-2 text-xs">
      <span className="flex-1 truncate text-foreground">{label}</span>
      <span
        className="flex h-2.5 w-24 flex-none overflow-hidden rounded-[3px]"
        style={{ backgroundColor: 'var(--chart-track)' }}
      >
        {segments.map((segment) => (
          <span
            key={segment.id}
            aria-hidden="true"
            className="h-full"
            style={{
              flexGrow: segment.value,
              backgroundColor: `var(${segment.colorVar})`,
            }}
          />
        ))}
      </span>
      {segments.map((segment) => (
        <span
          key={segment.id}
          className="w-10 flex-none text-right tabular-nums text-foreground"
        >
          {quantity(segment.value)}
        </span>
      ))}
      <span className="w-12 flex-none text-right font-semibold tabular-nums text-foreground">
        {quantity(total)}
      </span>
    </div>
  );
};
