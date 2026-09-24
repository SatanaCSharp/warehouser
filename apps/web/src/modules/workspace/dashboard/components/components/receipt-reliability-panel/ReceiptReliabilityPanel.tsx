import type {
  ReceiptReliabilityPanel as ReceiptReliabilityPanelBody,
  ReceiptReliabilityWarehouse,
} from '@warehouser/contracts/dashboards';
import { BubblePlot } from 'modules/workspace/dashboard/components/components/receipt-reliability-panel/components/BubblePlot';
import type { ScatterMark } from 'modules/workspace/dashboard/utils/receipt-reliability-plot';
import {
  gridlinePositions,
  markRadius,
  plotGeometryFor,
  plotMarks,
  UNMEASURED_PLOT_WIDTH_PX,
} from 'modules/workspace/dashboard/utils/receipt-reliability-plot';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { PanelFootnote } from 'shared/components/charts/PanelFootnote';

/**
 * T21 — the Receipt Reliability Panel (AC-19, AC-20, AC-20a; `design-handoff.md`
 * § Panel specifications, frame `ScGrF`).
 *
 * A bubble scatter built on `modules/workspace/dashboard/components/components/receipt-reliability-panel/components/BubblePlot`, which
 * draws marks and gridlines at the pixel offsets it is handed and decides
 * none of them. This file owns the geometry: it measures the width the Card
 * gives the plot, resolves the design's plot geometry for that width, sizes
 * each mark and places each label through
 * `modules/workspace/dashboard/utils/receipt-reliability-plot` — the pure
 * arithmetic ADR 0002 says the repository owns and unit-tests directly.
 *
 * The plot is measured rather than drawn at a fixed size because the design
 * states it in pixels (417 × 140 desktop, 278 × 200 mobile) inside a Card
 * whose width is the grid's, not the design's: a fixed viewBox scaled to fit
 * drew the whole plot at 140 × 140 in the middle of a 610px card.
 *
 * A Warehouse with no rate to report is **not plotted** (AC-20a) — it is
 * never read as the worst or the best performer. It is named instead in the
 * `role="img"` accessible summary and the footnote below it, both built from
 * the exact same computed string, so the two can never drift
 * (`design-handoff.md` § Accessibility, "Structure").
 */

/** The Panel's own fixed gridlines, 0 / 50 / 100 % (`design-handoff.md`). */
const RECEIPT_RELIABILITY_GRIDLINES = [0, 50, 100];

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

type ReceiptReliabilityPanelProps = {
  panel: ReceiptReliabilityPanelBody;
};

export const ReceiptReliabilityPanel = ({
  panel,
}: ReceiptReliabilityPanelProps): ReactElement => {
  const { t } = useTranslation('dashboard');
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(UNMEASURED_PLOT_WIDTH_PX);

  // The Card decides how wide the plot is, so the plot asks it rather than
  // assuming the design's own 417. A width of zero is jsdom, which lays
  // nothing out; the design's desktop width stands in for it, which is also
  // what the very first paint draws before the observer reports.
  useEffect(() => {
    const element = plotRef.current;
    const measure = (): void => {
      const width = element?.getBoundingClientRect().width ?? 0;

      if (width > 0) {
        setPlotWidth(width);
      }
    };
    const observer = new ResizeObserver(measure);

    if (element !== null) {
      measure();
      observer.observe(element);
    }

    return (): void => observer.disconnect();
  }, []);

  const geometry = plotGeometryFor(plotWidth);
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

  const marks = plotMarks(
    plottedWarehouses.map((warehouse): ScatterMark => ({
      id: warehouse.warehouseId,
      label: warehouse.warehouseName,
      x: warehouse.onTimeArrivalRatePercent,
      y: warehouse.conformanceRatePercent,
      r: markRadius(
        warehouse.receivedQuantity,
        largestReceivedQuantity,
        geometry,
      ),
    })),
    geometry,
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
      <div ref={plotRef} role="img" aria-label={disclosure}>
        <BubblePlot
          marks={marks}
          gridlines={gridlinePositions(RECEIPT_RELIABILITY_GRIDLINES, geometry)}
          width={geometry.width}
          height={geometry.height}
        />
      </div>
      <PanelFootnote>{disclosure}</PanelFootnote>
    </PanelCard>
  );
};
