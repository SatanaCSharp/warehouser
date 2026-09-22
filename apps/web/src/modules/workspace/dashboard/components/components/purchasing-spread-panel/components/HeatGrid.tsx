import { Table } from '@heroui/react';
import type { ReactElement } from 'react';

export type HeatGridBin =
  'ramp-4a' | 'ramp-4b' | 'ramp-4c' | 'ramp-4d' | 'zero';

export type HeatGridCell = {
  bin: HeatGridBin;
  count: number;
  id: string;
};

export type HeatGridRow = {
  cells: HeatGridCell[];
  label: string;
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
 * The grid is a collection of records, so it is presented with HeroUI's
 * `Table` rather than markup this file assembles
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
 * §Decision). It assembled its own `<table>` until the `dashboards`
 * conformance review; moving that markup out of a Panel and into a shared
 * component never made it exempt.
 *
 * Every value a cell prints comes from the record its row is keyed by, and no
 * cell reads a hook, a translation or a locale formatter — which is the one
 * thing the ADR's §Decision 2 cache warning is about, and why the cells here
 * stay literals rather than becoming components of their own.
 *
 * The first column carries each Warehouse's name as the row header, so a
 * screen reader announces the Warehouse with each figure
 * (design-handoff.md § Accessibility). Its own column heading is the grid's
 * empty corner.
 */
export const HeatGrid = ({ columns, rows }: HeatGridProps): ReactElement => (
  <Table variant="secondary">
    <Table.ScrollContainer>
      <Table.Content className="w-full text-xs">
        <Table.Header>
          <Table.Column isRowHeader>
            <span className="sr-only">{columns.join(', ')}</span>
          </Table.Column>
          {columns.map((column) => (
            <Table.Column className="font-medium text-muted" key={column}>
              {column}
            </Table.Column>
          ))}
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row id={row.label} key={row.label}>
              <Table.Cell>
                <span className="text-left font-normal text-foreground">
                  {row.label}
                </span>
              </Table.Cell>
              {row.cells.map((cell) => (
                <Table.Cell key={cell.id}>
                  <span
                    className={`block rounded-[6px] text-center tabular-nums ${CELL_INK_CLASS[cell.bin]}`}
                    style={{
                      backgroundColor: `var(${CELL_COLOR_VAR[cell.bin]})`,
                    }}
                  >
                    {cell.count}
                  </span>
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Content>
    </Table.ScrollContainer>
  </Table>
);
