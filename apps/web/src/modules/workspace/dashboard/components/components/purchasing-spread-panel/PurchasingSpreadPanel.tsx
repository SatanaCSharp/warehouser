import type {
  PurchasingSpreadCell,
  PurchasingSpreadPanel as PurchasingSpreadPanelBody,
} from '@warehouser/contracts/dashboards';
import type {
  HeatGridBin,
  HeatGridRow,
} from 'modules/workspace/dashboard/components/components/purchasing-spread-panel/components/HeatGrid';
import { HeatGrid } from 'modules/workspace/dashboard/components/components/purchasing-spread-panel/components/HeatGrid';
import {
  PURCHASING_SPREAD_LIST_HEIGHT_PX,
  PURCHASING_SPREAD_ROW_BOUNDS,
} from 'modules/workspace/dashboard/utils/panel-list-budget';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartLegendItem } from 'shared/components/charts/ChartLegend';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { PanelFootnote } from 'shared/components/charts/PanelFootnote';
import { panelListStyle } from 'shared/utils/panel-list-density';

/**
 * T20 — the Purchasing Spread Panel (AC-18; `design-handoff.md` § Panel
 * specifications, frame `G3tB1`).
 *
 * `HeatGrid` presents the grid itself — a header row, sequential one-hue
 * bins, the count printed in every cell — with HeroUI's `Table`, per
 * `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` §Decision.
 * This file owns what `HeatGrid` does not: the four-state coverage and its
 * bin boundaries (AC-18), the scale legend below the grid, the "Ready" column
 * head and its Panel-meta expansion, and the archived-Warehouse footnote.
 *
 * ## Geometry
 *
 * It also owns the grid's **height budget**, because that is a fact about
 * which row of § Grid geometry this Panel occupies rather than about how a
 * heat grid is drawn: row 2 is 312 px, and
 * `modules/workspace/dashboard/utils/panel-list-budget.ts` takes the Card
 * chrome and what this file draws below the grid out of it. The rule that
 * budget is spent against is `shared/utils/panel-list-density.ts`, shared with
 * the Warehouse Dashboard.
 *
 * The row height is a point rather than the ruled 20-26 flex, and
 * `panel-list-budget.ts` records why: § Type and mark specs fixes the cell at
 * 84 x 30 with its count printed inside, so past five Warehouses the grid
 * scrolls inside the Card — the rule's own second half — rather than the cell
 * spec being crushed to win the pixels.
 */

type PurchasingSpreadState = PurchasingSpreadCell['state'];

/**
 * The sequential one-hue bins `1-19 / 20-49 / 50-99 / 100 +` over a
 * `$chart/track` zero cell (AC-18, `design-handoff.md` § Workspace —
 * Purchasing Spread). `chart/ramp-4a` is the darkest step and is the
 * `design-handoff.md` § Tokens bin for `100 +`; `chart/ramp-4d` is the
 * lightest and is the `1-19` bin — so the bins below run from lightest at the
 * smallest count to darkest at the largest, matching that table. An ordered
 * lookup rather than a chain of comparisons: the precedence is a value that
 * can be read, reordered deliberately and asserted
 * (`docs/system/guides/writing-web-components.md` §6).
 */
const SPREAD_BINS: readonly {
  bin: HeatGridBin;
  holds: (count: number) => boolean;
}[] = [
  { bin: 'zero', holds: (count) => count === 0 },
  { bin: 'ramp-4d', holds: (count) => count < 20 },
  { bin: 'ramp-4c', holds: (count) => count < 50 },
  { bin: 'ramp-4b', holds: (count) => count < 100 },
];

const binFor = (count: number): HeatGridBin =>
  SPREAD_BINS.find(({ holds }) => holds(count))?.bin ?? 'ramp-4a';

type PurchasingSpreadPanelProps = {
  panel: PurchasingSpreadPanelBody;
};

export const PurchasingSpreadPanel = ({
  panel,
}: PurchasingSpreadPanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');

  /**
   * A total lookup over the four states the Panel counts, so a state added to
   * the contract fails to compile until it is given a name here rather than
   * rendering a raw key (`docs/system/guides/writing-web-components.md` §6).
   */
  const columnLabels: Record<PurchasingSpreadState, string> = {
    draft: t('panels.purchasingSpread.states.draft'),
    ready_for_ordering: t('panels.purchasingSpread.states.readyForOrdering'),
    closed: t('panels.purchasingSpread.states.closed'),
    discarded: t('panels.purchasingSpread.states.discarded'),
  };

  const rows: HeatGridRow[] = panel.warehouses.map((warehouse) => ({
    label: warehouse.warehouseName,
    cells: warehouse.counts.map((cell) => ({
      id: `${warehouse.warehouseId}-${cell.state}`,
      count: cell.draftCount,
      bin: binFor(cell.draftCount),
    })),
  }));

  // The zero cell plus the four sequential bins, lightest to darkest, each
  // stating its own boundary as text so removing colour entirely loses no
  // figure (`design-handoff.md` § Panel specifications, "A scale legend sits
  // below").
  const legend: ChartLegendItem[] = [
    {
      id: 'zero',
      label: t('panels.purchasingSpread.legend.zero'),
      colorVar: '--chart-track',
    },
    {
      id: 'lowBand',
      label: t('panels.purchasingSpread.legend.lowBand'),
      colorVar: '--chart-ramp-4d',
    },
    {
      id: 'midBand',
      label: t('panels.purchasingSpread.legend.midBand'),
      colorVar: '--chart-ramp-4c',
    },
    {
      id: 'highBand',
      label: t('panels.purchasingSpread.legend.highBand'),
      colorVar: '--chart-ramp-4b',
    },
    {
      id: 'topBand',
      label: t('panels.purchasingSpread.legend.topBand'),
      colorVar: '--chart-ramp-4a',
    },
  ];

  return (
    <PanelCard
      title={t('panels.purchasingSpread.title')}
      meta={t('panels.purchasingSpread.meta')}
    >
      <HeatGrid
        columns={Object.values(columnLabels)}
        listStyle={panelListStyle(
          PURCHASING_SPREAD_LIST_HEIGHT_PX,
          rows.length,
          PURCHASING_SPREAD_ROW_BOUNDS,
        )}
        rows={rows}
      />
      <ChartLegend items={legend} />
      <PanelFootnote>
        {t('panels.purchasingSpread.footnote', {
          count: panel.archivedWarehouseCount,
        })}
      </PanelFootnote>
    </PanelCard>
  );
};
