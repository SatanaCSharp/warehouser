import type {
  ReceiptReliabilityPanel as ReceiptReliabilityPanelBody,
  ReceiptReliabilityWarehouse,
} from '@warehouser/contracts/dashboards';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { BubblePlotMark } from 'shared/components/charts/BubblePlot';
import { BubblePlot } from 'shared/components/charts/BubblePlot';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { PanelFootnote } from 'shared/components/charts/PanelFootnote';

/**
 * T21 — the Receipt Reliability Panel (AC-19, AC-20, AC-20a; `design-handoff.md`
 * § Panel specifications, frame `ScGrF`).
 *
 * A bubble scatter built on `shared/components/charts/BubblePlot`, which
 * draws a mark's position, size and direct label but knows nothing about
 * label collision. This file computes the marks' positions and radii, and
 * where two marks would collide, moves the later one's label aside itself
 * (`BubblePlot`'s own `labelOffsetX`/`labelAnchor`, added for exactly this)
 * rather than teaching the primitive a layout policy.
 *
 * A Warehouse with no rate to report is **not plotted** (AC-20a) — it is
 * never read as the worst or the best performer. It is named instead in the
 * `role="img"` accessible summary and the footnote below it, both built from
 * the exact same computed string, so the two can never drift
 * (`design-handoff.md` § Accessibility, "Structure").
 */

/** The Panel's own fixed gridlines, 0 / 50 / 100 % (`design-handoff.md`). */
const RECEIPT_RELIABILITY_GRIDLINES = [0, 50, 100];

/** `r = 16 × √(received ÷ max received)` on desktop (`design-handoff.md`
 * § Type and mark specs); a mobile caller passes `12` (§ Responsive
 * behavior). */
const DEFAULT_MAX_RADIUS = 16;

/** How far past a mark's own edge a collision-avoided label is pushed
 * aside. */
const LABEL_ASIDE_GAP = 4;

type PlottableWarehouse = ReceiptReliabilityWarehouse & {
  onTimeArrivalRatePercent: number;
  conformanceRatePercent: number;
};

/**
 * A Warehouse with no rate to report is **not plotted** (AC-20a) — it is
 * never read as the worst or the best performer. Both rates are
 * independently nullable, so either missing excludes the Warehouse from the
 * scatter entirely: it cannot be positioned on an axis it has no reading
 * for.
 */
const isPlottable = (
  warehouse: ReceiptReliabilityWarehouse,
): warehouse is PlottableWarehouse =>
  warehouse.onTimeArrivalRatePercent !== null &&
  warehouse.conformanceRatePercent !== null;

/**
 * Moves a colliding label aside rather than centred below its mark. Two
 * marks "collide" when they sit at the exact same (x, y); the first mark at
 * a point keeps the default centred label and every later one at the same
 * point is pushed aside, so no two labels ever draw on top of each other
 * (`design-handoff.md` § Panel specifications — Receipt Reliability, "moved
 * to the side where that would collide").
 */
const withCollisionAvoidedLabels = (
  marks: BubblePlotMark[],
): BubblePlotMark[] => {
  const occurrencesByPoint = new Map<string, number>();

  return marks.map((mark) => {
    const point = `${mark.x}:${mark.y}`;
    const occurrence = occurrencesByPoint.get(point) ?? 0;
    occurrencesByPoint.set(point, occurrence + 1);

    if (occurrence === 0) {
      return mark;
    }

    return {
      ...mark,
      labelOffsetX: mark.r + LABEL_ASIDE_GAP,
      labelAnchor: 'start',
    };
  });
};

type ReceiptReliabilityPanelProps = {
  panel: ReceiptReliabilityPanelBody;
  /** The largest radius a mark takes, in the plot's own 0-100 viewBox units.
   * A mobile caller passes `12` (`design-handoff.md` § Responsive
   * behavior). */
  maxRadius?: number;
};

export const ReceiptReliabilityPanel = ({
  panel,
  maxRadius = DEFAULT_MAX_RADIUS,
}: ReceiptReliabilityPanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');

  const plottedWarehouses = panel.warehouses.filter(isPlottable);
  const unratedWarehouses = panel.warehouses.filter(
    (warehouse) => !isPlottable(warehouse),
  );

  // Area proportional to quantity received, so the radius follows its square
  // root rather than the quantity itself (AC-19, `design-handoff.md`
  // § Type and mark specs).
  const largestReceivedQuantity = Math.max(
    1,
    ...plottedWarehouses.map((warehouse) => warehouse.receivedQuantity),
  );

  const marks = withCollisionAvoidedLabels(
    plottedWarehouses.map((warehouse): BubblePlotMark => ({
      id: warehouse.warehouseId,
      label: warehouse.warehouseName,
      x: warehouse.onTimeArrivalRatePercent,
      y: warehouse.conformanceRatePercent,
      r:
        maxRadius *
        Math.sqrt(warehouse.receivedQuantity / largestReceivedQuantity),
    })),
  );

  // Every excluded Warehouse named beside its own six exclusion counts
  // (AC-20, AC-20a), read once and reused verbatim as both the footnote and
  // the chart's accessible summary so the two cannot drift.
  const disclosure = [
    t('panels.receiptReliability.footnote.archivedExcluded', {
      count: panel.archivedWarehouseCount,
    }),
    ...unratedWarehouses.map((warehouse) =>
      t('panels.receiptReliability.footnote.noRateWarehouse', {
        name: warehouse.warehouseName,
        undated: warehouse.exclusions.undatedLineCount,
        noEnding: warehouse.exclusions.noEndingRecordedLineCount,
        nothingReceived: warehouse.exclusions.nothingReceivedLineCount,
        directToCustomer: warehouse.exclusions.directToCustomerLineCount,
        unrecordedConformance:
          warehouse.exclusions.unrecordedConformanceLineCount,
        notApplicable: warehouse.exclusions.notApplicableConformanceLineCount,
      }),
    ),
  ].join(' ');

  return (
    <PanelCard
      title={t('panels.receiptReliability.title')}
      meta={t('panels.receiptReliability.meta')}
    >
      <div role="img" aria-label={disclosure}>
        <BubblePlot
          marks={marks}
          gridlineValues={RECEIPT_RELIABILITY_GRIDLINES}
        />
      </div>
      <PanelFootnote>{disclosure}</PanelFootnote>
    </PanelCard>
  );
};
