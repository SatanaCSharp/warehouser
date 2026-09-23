import { Table } from '@heroui/react';
import type { CoverageGapPanel as CoverageGapPanelBody } from '@warehouser/contracts/dashboards';
import compact from 'lodash/compact';
import { CoverageGapBar } from 'modules/warehouse/components/dashboard/components/coverage-gap-panel/components/CoverageGapBar';
import { CoverageGapItemLabel } from 'modules/warehouse/components/dashboard/components/coverage-gap-panel/components/CoverageGapItemLabel';
import { CoverageGapQuantity } from 'modules/warehouse/components/dashboard/components/coverage-gap-panel/components/CoverageGapQuantity';
import type { CoverageGapQuantities } from 'modules/warehouse/utils/coverage-gap-series';
import { COVERAGE_GAP_SERIES } from 'modules/warehouse/utils/coverage-gap-series';
import { COVERAGE_GAP_LIST_HEIGHT_PX } from 'modules/warehouse/utils/panel-list-budget';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartLegendItem } from 'shared/components/charts/ChartLegend';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import { PanelCard } from 'shared/components/charts/PanelCard';
import {
  PANEL_LIST_CELL_CLASS,
  PANEL_LIST_COLUMN_CLASS,
  panelListStyle,
} from 'shared/utils/panel-list-density';

/**
 * T17 — the Coverage Gap Panel (AC-03, AC-05, AC-25; `design-handoff.md`
 * § Panel specifications, frame `Z4cE3M`).
 *
 * The collection of records this Panel presents is drawn with HeroUI's
 * `Table`, per `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
 * §Decision: "A feature file does not assemble `<table>`, `<thead>`,
 * `<tbody>`, `<tr>` or `<td>` markup of its own." It did until the
 * `dashboards` front-end conformance review; the reason recorded here — that
 * the ADR reaches only a table a member "browses, expands and sorts" — appears
 * in no system document, and the ADR converted `ItemDirectory`, a flat
 * six-column table with no disclosure, on the same terms.
 *
 * Two consequences of the collection model shape this file, and both are the
 * ADR's §Decision 2 rather than incidental:
 *
 * - **Every cell renders a component, never an expression.** React Aria builds
 *   a row's element tree before the DOM and caches it per record, so a value
 *   the renderer closed over stays whatever it was at first build. That is not
 *   hypothetical here: the figures are formatted by `useLocaleFormat`, so a
 *   row closing over its `quantity` would keep the old locale's grouping for
 *   the life of the surface. `CoverageGapQuantity`, `CoverageGapItemLabel` and
 *   `CoverageGapBar` each read what they need themselves.
 * - **The ARIA role changes**, which the ADR records as an accepted cost: a
 *   React Aria table exposes `role="grid"` with `rowheader` and `gridcell`,
 *   not `table`/`cell`. `design-handoff.md` § Accessibility asks that "a
 *   screen reader announces the Item with each figure", which the row header
 *   still does.
 *
 * The Panel has no empty state: `design-handoff.md` § States gives it none, so
 * with no rows it draws its frame, its legend and its header row with no
 * marks, and `renderEmptyState` is deliberately absent.
 *
 * ## Geometry
 *
 * Row density is `shared/utils/panel-list-density.ts`, which carries the rule
 * both Dashboards are drawn to, over the budget
 * `modules/warehouse/utils/panel-list-budget.ts` derives for this surface: the
 * list region declares this Panel's own height budget as a ceiling it scrolls
 * inside, and a row height clamped to the ruled 20-26 px. Without it the
 * `.table__cell` default (`px-4 py-3 text-sm`) drew 45 px rows and the surface
 * scrolled.
 *
 * The column widths below keep `design-handoff.md` § Panel specifications' own
 * Uncovered 70 and Total 56, and its 8 px gap as 4 px of side padding on each
 * neighbour, with **one deviation recorded rather than assumed**: the bar track
 * is 110 px, not the frame's 150. The frame draws four columns (Item 154 · track
 * 150 · Uncovered 70 · Total 56); this Panel draws six, because § Accessibility
 * requires every segment's value to be readable as a printed figure, so On hand
 * and On order are columns of their own. Six do not fit 456 px at the frame's
 * widths, and the track is the only element on the row whose width carries no
 * reading — every quantity it divides is printed beside it — so it is the one
 * that gives.
 *
 * The four numeric columns were then widened on request, because On hand and
 * On order at 56 left their own heads 48 px of content box against labels that
 * measure about 41 and 46 — one glyph from wrapping — and Uncovered read as
 * cramped beside them. They are **64 · 64 · 80 · 56**.
 *
 * That widening is paid for by the track a second time, not by the Item
 * column. Funding it from Item instead was tried and measured: at the 456 px
 * floor the column fell to 74, and the Remainder Row's "4 more Items" — a
 * twelve-character label, half of what § Truncation allows an Item — came back
 * as "4 more It…" (76 px into a 66 px box). A name the reader cannot finish is
 * a worse Panel than a shorter bar, and the sentence above already says why:
 * the track is the one element on the row whose width carries no reading.
 *
 * So the bar cell gives up the same 26 px the figures took, 118 → **92
 * (track 84)**, and the fixed columns sum to 92 + 64 + 64 + 80 + 56 =
 * **356 px** — the figure they summed to before the widening. The Item column
 * is the only one with no declared width, so it absorbs whatever the table has
 * left: **100 px at the 456 px floor below, 134 px at the 490 px the shell
 * leaves with its navigation rail expanded, 218 px with the rail collapsed.**
 * At the floor that seats every Item this Warehouse names (66 px) and the
 * Remainder Row (76 px) whole, in a 92 px content box. A longer name still
 * truncates with the ellipsis § Truncation allows it, because
 * `CoverageGapItemLabel` is a block; nothing clips.
 *
 * **84 px is the floor the track is held to**, and it still reads as a bar:
 * three segments and the two 2 px gaps between them leave 80 px of mark, so
 * the smallest segment this Panel draws is several pixels wide, and no
 * segment's value is read off the track anyway — § Accessibility requires each
 * one printed, which is what the three numeric columns are for.
 *
 * A column *head* may not be clipped at all, so each is sized to its own label
 * and may wrap onto the header row's second budgeted line.
 *
 * Each numeric head is centred over its column while its figures stay
 * `text-right`: the heads are labels being scanned across, the figures are
 * `tabular-nums` quantities being compared down, and only the second reading
 * needs a shared right edge. Alignment is declared on the `Table.Column`, which
 * is the `<th>` alone — the body cells take theirs from the span inside them —
 * so centring a head cannot reach the column's data.
 *
 * Below 456 px the table keeps those widths and `Table.ScrollContainer` scrolls
 * horizontally, rather than compressing six columns until their heads are sliced
 * mid-glyph. § Responsive behavior's two-line mobile row is not drawn yet.
 */

/** One drawn row: the ten Items, then the Remainder Row when there is one. */
type CoverageGapLine = {
  id: string;
  /** Present only on the Remainder Row, which states how many Items it holds. */
  itemCount?: number;
  quantities: CoverageGapQuantities;
  sku?: string;
  total: number;
};

type CoverageGapPanelProps = {
  panel: CoverageGapPanelBody;
};

export const CoverageGapPanel = ({
  panel,
}: CoverageGapPanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');

  // Ordinal steps 1–3, dark to light. The legend states all three as text and
  // every quantity is printed in its own column, so removing colour entirely
  // loses no figure (`design-handoff.md` § Accessibility, "Never colour
  // alone"). The ids come from `CoverageGapBar`, so the legend and the marks
  // cannot drift apart.
  const legend: ChartLegendItem[] = COVERAGE_GAP_SERIES.map((series) => ({
    id: series.id,
    label: t(`panels.coverageGap.series.${series.id}`),
    colorVar: series.colorVar,
  }));

  const { remainder } = panel;

  // The Remainder Row's figures exist only when the projection gathered one,
  // so it joins the sequence as a value rather than as a second branch in the
  // tree (`docs/system/guides/writing-web-conditional-components.md` §2).
  const lines: CoverageGapLine[] = compact([
    ...panel.rows.map((row): CoverageGapLine => ({
      id: row.itemId,
      sku: row.sku,
      quantities: row,
      total: row.totalOutstandingQuantity,
    })),
    remainder === null
      ? null
      : {
          id: 'remainder',
          itemCount: remainder.itemCount,
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
      <Table variant="secondary">
        <Table.ScrollContainer
          className="overflow-y-auto"
          style={panelListStyle(COVERAGE_GAP_LIST_HEIGHT_PX, lines.length)}
        >
          <Table.Content
            aria-label={t('panels.coverageGap.title')}
            className="w-full min-w-[456px] table-fixed text-xs"
          >
            <Table.Header>
              <Table.Column className={PANEL_LIST_COLUMN_CLASS} isRowHeader>
                {t('panels.coverageGap.columns.item')}
              </Table.Column>
              <Table.Column className={`${PANEL_LIST_COLUMN_CLASS} w-[92px]`}>
                {/* The frame draws no head over the bar; a screen reader still
                    needs the column named. */}
                <span className="sr-only">
                  {t('panels.coverageGap.columns.coverage')}
                </span>
              </Table.Column>
              <Table.Column
                className={`${PANEL_LIST_COLUMN_CLASS} w-16 text-center`}
              >
                {t('panels.coverageGap.columns.onHand')}
              </Table.Column>
              <Table.Column
                className={`${PANEL_LIST_COLUMN_CLASS} w-16 text-center`}
              >
                {t('panels.coverageGap.columns.onOrder')}
              </Table.Column>
              <Table.Column
                className={`${PANEL_LIST_COLUMN_CLASS} w-20 text-center`}
              >
                {t('panels.coverageGap.columns.uncovered')}
              </Table.Column>
              <Table.Column
                className={`${PANEL_LIST_COLUMN_CLASS} w-14 text-center`}
              >
                {t('panels.coverageGap.columns.total')}
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {lines.map((line) => (
                <Table.Row id={line.id} key={line.id}>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <CoverageGapItemLabel
                      itemCount={line.itemCount}
                      sku={line.sku}
                    />
                  </Table.Cell>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <CoverageGapBar
                      domainMax={domainMax}
                      quantities={line.quantities}
                    />
                  </Table.Cell>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <CoverageGapQuantity
                      className="block text-right tabular-nums text-foreground"
                      value={line.quantities.onHandQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <CoverageGapQuantity
                      className="block text-right tabular-nums text-foreground"
                      value={line.quantities.inboundQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <CoverageGapQuantity
                      className="block text-right font-semibold tabular-nums text-foreground"
                      value={line.quantities.uncoveredQuantity}
                    />
                  </Table.Cell>
                  <Table.Cell className={PANEL_LIST_CELL_CLASS}>
                    <CoverageGapQuantity
                      className="block text-right tabular-nums text-muted"
                      value={line.total}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </PanelCard>
  );
};
