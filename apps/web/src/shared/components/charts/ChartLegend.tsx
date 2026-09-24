import type { ReactElement } from 'react';

export type ChartLegendItem = {
  id: string;
  /** The series name, already translated by the caller — every legend key is
   * text, so removing colour entirely loses no figure
   * (design-handoff.md § Accessibility, "Never colour alone"). */
  label: string;
  /** One of the `--chart-*` custom properties, e.g. `--chart-ramp-3a`. Never
   * a hard-coded hex value, and never a status colour
   * (spec.md §3 / CONTEXT.md — nothing here judges a Warehouse). */
  colorVar: string;
};

type ChartLegendProps = {
  items: ChartLegendItem[];
};

/**
 * The text legend every multi-series chart carries, so its series are
 * readable with colour removed. Nothing here is interactive: a legend states
 * what a mark means, it does not filter or select one.
 */
export const ChartLegend = ({ items }: ChartLegendProps): ReactElement => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
    {items.map((item) => (
      <li key={item.id} className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2 w-2 flex-none rounded-full"
          style={{ backgroundColor: `var(${item.colorVar})` }}
        />
        <span>{item.label}</span>
      </li>
    ))}
  </ul>
);
