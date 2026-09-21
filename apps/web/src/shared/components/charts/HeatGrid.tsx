import type { ReactElement } from 'react';

export type HeatGridBin =
  'ramp-4a' | 'ramp-4b' | 'ramp-4c' | 'ramp-4d' | 'zero';

export type HeatGridCell = {
  id: string;
  columnLabel: string;
  count: number;
  bin: HeatGridBin;
};

export type HeatGridRow = {
  label: string;
  cells: HeatGridCell[];
};

type HeatGridProps = {
  columns: string[];
  rows: HeatGridRow[];
};

const CELL_COLOR_VAR: Record<HeatGridBin, string> = {
  'ramp-4a': '--chart-ramp-4a',
  'ramp-4b': '--chart-ramp-4b',
  'ramp-4c': '--chart-ramp-4c',
  'ramp-4d': '--chart-ramp-4d',
  zero: '--chart-track',
};

/**
 * The ink for a cell's printed count, chosen by the fill's own luminance
 * rather than fixed — `$accent/foreground` on the two darkest bins,
 * `$foreground/foreground` on the two lightest (design-handoff.md §
 * Accessibility, "Text never wears the data colour").
 */
const CELL_INK_CLASS: Record<HeatGridBin, string> = {
  'ramp-4a': 'text-accent-foreground',
  'ramp-4b': 'text-accent-foreground',
  'ramp-4c': 'text-foreground',
  'ramp-4d': 'text-foreground',
  zero: 'text-muted',
};

/**
 * A Warehouse × state count grid: sequential one-hue bins over
 * `--chart-track` for the zero cell, with the count printed in every cell so
 * the fill is a scanning aid and never the only encoding
 * (design-handoff.md § Panel specifications — Purchasing Spread).
 *
 * A real `<table>` with a header row, so a screen reader announces the
 * Warehouse with each figure (design-handoff.md § Accessibility); nothing in
 * it takes focus.
 */
export const HeatGrid = ({ columns, rows }: HeatGridProps): ReactElement => (
  <table className="w-full border-separate border-spacing-1 text-xs">
    <thead>
      <tr>
        <th scope="col" aria-hidden="true" />
        {columns.map((column) => (
          <th key={column} scope="col" className="font-medium text-muted">
            {column}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.label}>
          <th scope="row" className="text-left font-normal text-foreground">
            {row.label}
          </th>
          {row.cells.map((cell) => (
            <td
              key={cell.id}
              className={`rounded-[6px] text-center tabular-nums ${CELL_INK_CLASS[cell.bin]}`}
              style={{ backgroundColor: `var(${CELL_COLOR_VAR[cell.bin]})` }}
            >
              {cell.count}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);
