import { Table } from '@heroui/react';
import type { ReactElement } from 'react';
import type { PanelListStyle } from 'shared/utils/panel-list-density';
import {
  PANEL_LIST_CELL_CLASS,
  PANEL_LIST_COLUMN_CLASS,
} from 'shared/utils/panel-list-density';

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
  /**
   * The list region's declared constraints — the Panel's own height budget as
   * a ceiling it scrolls inside, and the row height every cell reads. The
   * budget belongs to the Panel, which knows which grid row § Grid geometry
   * puts it on; the markup that carries it belongs here.
   */
  listStyle: PanelListStyle;
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
 * A count cell, written out rather than composed from
 * `PANEL_LIST_CELL_CLASS`: it needs 2 px of side padding instead of that
 * rule's 4, so that an 88 px column pitch leaves the mark the 84 px width
 * `design-handoff.md` § Type and mark specs gives it and 4 px of air between
 * neighbours. Overriding one utility by appending another would leave both in
 * the class list and let stylesheet order decide, which is not a decision this
 * file can make.
 */
const HEAT_CELL_CLASS =
  'h-[var(--dashboard-row-height)] overflow-hidden px-0.5 py-0 text-xs leading-4';

/**
 * The mark itself: the second half of that same spec — 30 px tall, which is
 * the row height the Panel's budget fixes, and radius 6.
 */
const HEAT_MARK_CLASS =
  'flex h-[var(--dashboard-row-height)] items-center justify-center rounded-[6px] tabular-nums';

/** Each state column's pitch; 104 + 4 x 88 is the 456 px inner width
 * § Grid geometry gives a Panel. */
const STATE_COLUMN_CLASS = 'w-[88px] text-center';

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
 *
 * ## Geometry
 *
 * A row here is one heat-grid cell tall, and § Type and mark specs fixes that
 * cell at 84 x 30. So this grid does not flex its rows between the ruled 20
 * and 26: `panel-list-budget.ts` hands it a 30 px point, and the list region
 * scrolls inside the Card once the Panel's budget cannot seat them — the half
 * of the row-count rule written for exactly this, taken in preference to
 * shrinking a mark the design states in pixels. Before the rule reached this
 * Panel the rows took the `.table__cell` default and measured 45 px, drawing a
 * 348 px Panel where § Grid geometry allows 312.
 */
export const HeatGrid = ({
  columns,
  listStyle,
  rows,
}: HeatGridProps): ReactElement => (
  <Table variant="secondary">
    <Table.ScrollContainer className="overflow-y-auto" style={listStyle}>
      <Table.Content className="w-full min-w-[456px] table-fixed text-xs">
        <Table.Header>
          <Table.Column className={PANEL_LIST_COLUMN_CLASS} isRowHeader>
            <span className="sr-only">{columns.join(', ')}</span>
          </Table.Column>
          {columns.map((column) => (
            <Table.Column
              className={`${PANEL_LIST_COLUMN_CLASS} ${STATE_COLUMN_CLASS} font-medium text-muted`}
              key={column}
            >
              {column}
            </Table.Column>
          ))}
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row id={row.label} key={row.label}>
              <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                <span className="block truncate text-left font-normal text-foreground">
                  {row.label}
                </span>
              </Table.Cell>
              {row.cells.map((cell) => (
                <Table.Cell className={HEAT_CELL_CLASS} key={cell.id}>
                  <span
                    className={`${HEAT_MARK_CLASS} ${CELL_INK_CLASS[cell.bin]}`}
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
