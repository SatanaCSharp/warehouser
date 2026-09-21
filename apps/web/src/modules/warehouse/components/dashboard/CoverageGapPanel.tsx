import type { CoverageGapPanel as CoverageGapPanelBody } from '@warehouser/contracts/dashboards';
import compact from 'lodash/compact';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartLegendItem } from 'shared/components/charts/ChartLegend';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { linearScale } from 'shared/utils/chart-scale';

/**
 * T17 — the Coverage Gap Panel (AC-03, AC-05, AC-25; `design-handoff.md`
 * § Panel specifications, frame `Z4cE3M`).
 *
 * **Why this is a real `<table>` and not HeroUI's `Table`.**
 * `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` requires
 * HeroUI's `Table` of a **data table** — a collection of records a member
 * browses, expands and sorts. This is not one: nothing here is interactive,
 * there is no disclosure, no nesting and no expansion. It is the accessible
 * substrate of a chart, which
 * `docs/features/dashboards/adr/0002-charting-without-a-charting-dependency.md`
 * (Accepted, later and narrower, § Consequences) decided for exactly these
 * row-oriented Panels: "a row-oriented Panel can be a real `<table>` because
 * nothing else owns its DOM, which is what `design-handoff.md` § Accessibility
 * requires."
 *
 * The sharper reason is in the system ADR's own § Consequences: an expandable
 * `Table` exposes `role="treegrid"`. This Panel's accessibility contract is
 * that "a screen reader announces the Item with each figure", which wants
 * plain data-table semantics — `columnheader` and `rowheader` — not a tree the
 * reader cannot navigate. All three of that ADR's operative rules are inert
 * here: there is no `Table.Collection` to nest, no per-row render cache to be
 * bitten by (every cell is a literal figure, and this component reads its own
 * translations), and no `renderEmptyState` to supply, because
 * `design-handoff.md` § States gives the Panel no empty state at all — with no
 * rows it draws its frame, its legend and its header row with no marks.
 *
 * `shared/components/charts/StackedBarRow` is deliberately not reused: it lays
 * a whole row out as one flex box, so its label, figures and total cannot
 * become the `<td>`s the column semantics above require. The scale beneath the
 * marks is still the shared one (`shared/utils/chart-scale.ts`, ADR 0002).
 */

/**
 * The scale's range. The frame draws the track at 150 px (Item 154 · track
 * 150) and narrower at 390, so a mark is measured onto the track's own width
 * rather than onto a pixel count that would overflow it at the other viewport.
 */
const FULL_TRACK = 100;

/** The quantities a named row and the Remainder Row both carry (AC-03). */
type CoverageGapQuantities = {
  inboundQuantity: number;
  onHandQuantity: number;
  uncoveredQuantity: number;
};

/** One drawn row: the ten Items, then the Remainder Row when there is one. */
type CoverageGapLine = {
  id: string;
  label: string;
  /** The Remainder Row is muted and states how many Items it holds (AC-03). */
  muted: boolean;
  quantities: CoverageGapQuantities;
  total: number;
};

type CoverageGapPanelProps = {
  panel: CoverageGapPanelBody;
};

/**
 * The segments a row actually draws, dark → light: On hand → On order →
 * Uncovered. A quantity of zero draws no segment at all, which is how an Item
 * with nothing uncovered "simply has no third segment" (AC-05) rather than a
 * zero-width mark nobody can see but every reader still counts.
 */
const drawnSegments = (
  quantities: CoverageGapQuantities,
  legend: ChartLegendItem[],
): { series: ChartLegendItem; value: number }[] =>
  [
    { series: legend[0], value: quantities.onHandQuantity },
    { series: legend[1], value: quantities.inboundQuantity },
    { series: legend[2], value: quantities.uncoveredQuantity },
  ].filter(({ value }) => value > 0);

export const CoverageGapPanel = ({
  panel,
}: CoverageGapPanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');
  const { quantity } = useLocaleFormat();

  // Ordinal steps 1–3, dark to light. The legend states all three as text and
  // every quantity is printed in its own column, so removing colour entirely
  // loses no figure (`design-handoff.md` § Accessibility, "Never colour
  // alone").
  const legend: ChartLegendItem[] = [
    {
      id: 'onHand',
      label: t('panels.coverageGap.series.onHand'),
      colorVar: '--chart-ramp-3a',
    },
    {
      id: 'onOrder',
      label: t('panels.coverageGap.series.onOrder'),
      colorVar: '--chart-ramp-3b',
    },
    {
      id: 'uncovered',
      label: t('panels.coverageGap.series.uncovered'),
      colorVar: '--chart-ramp-3c',
    },
  ];

  const { remainder } = panel;

  // The Remainder Row's figures exist only when the projection gathered one,
  // so it joins the sequence as a value rather than as a second branch in the
  // tree (`docs/system/guides/writing-web-conditional-components.md` §2).
  const lines: CoverageGapLine[] = compact([
    ...panel.rows.map((row): CoverageGapLine => ({
      id: row.itemId,
      label: row.sku,
      muted: false,
      quantities: row,
      total: row.totalOutstandingQuantity,
    })),
    remainder === null
      ? null
      : {
          id: 'remainder',
          label: t('panels.coverageGap.remainder', {
            count: remainder.itemCount,
          }),
          muted: true,
          quantities: remainder,
          total: remainder.totalOutstandingQuantity,
        },
  ]);

  // Every row is measured against the largest outstanding quantity on the
  // Panel, so the bars compare with each other rather than each filling its
  // own track (ADR 0002 — one linear scale from zero to a rounded maximum).
  const domainMax = Math.max(0, ...lines.map((line) => line.total));

  return (
    <PanelCard
      title={t('panels.coverageGap.title')}
      meta={t('panels.coverageGap.meta')}
    >
      <ChartLegend items={legend} />
      <table
        aria-label={t('panels.coverageGap.title')}
        className="mt-2 w-full table-fixed text-xs"
      >
        <thead>
          <tr className="h-[18px] font-medium text-muted">
            <th className="text-left" scope="col">
              {t('panels.coverageGap.columns.item')}
            </th>
            <th className="w-16 sm:w-[150px]" scope="col">
              {/* The frame draws no head over the bar; a screen reader still
                  needs the column named. */}
              <span className="sr-only">
                {t('panels.coverageGap.columns.coverage')}
              </span>
            </th>
            <th className="w-9 text-right sm:w-11" scope="col">
              {t('panels.coverageGap.columns.onHand')}
            </th>
            <th className="w-9 text-right sm:w-11" scope="col">
              {t('panels.coverageGap.columns.onOrder')}
            </th>
            <th className="w-10 text-right sm:w-[70px]" scope="col">
              {t('panels.coverageGap.columns.uncovered')}
            </th>
            <th className="w-11 text-right sm:w-14" scope="col">
              {t('panels.coverageGap.columns.total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr className="h-[22px]" key={line.id}>
              <th
                className={`truncate text-left ${line.muted ? 'font-medium text-muted' : 'font-normal text-foreground'}`}
                scope="row"
              >
                {line.label}
              </th>
              <td>
                <span
                  className="flex h-2.5 w-16 items-center gap-[2px] sm:w-[150px]"
                  style={{ backgroundColor: 'var(--chart-track)' }}
                >
                  {drawnSegments(line.quantities, legend).map(
                    ({ series, value }, index, drawn) => (
                      <span
                        aria-hidden="true"
                        className={
                          index === drawn.length - 1
                            ? 'h-full rounded-r-[3px]'
                            : 'h-full'
                        }
                        key={series.id}
                        style={{
                          backgroundColor: `var(${series.colorVar})`,
                          width: `${linearScale(value, domainMax, FULL_TRACK)}%`,
                        }}
                      />
                    ),
                  )}
                </span>
              </td>
              <td className="text-right tabular-nums text-foreground">
                {quantity(line.quantities.onHandQuantity)}
              </td>
              <td className="text-right tabular-nums text-foreground">
                {quantity(line.quantities.inboundQuantity)}
              </td>
              <td className="text-right font-semibold tabular-nums text-foreground">
                {quantity(line.quantities.uncoveredQuantity)}
              </td>
              <td className="text-right tabular-nums text-muted">
                {quantity(line.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelCard>
  );
};
