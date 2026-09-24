import type { PlottedMark } from 'modules/workspace/dashboard/utils/receipt-reliability-plot';
import { MARK_RING_WIDTH_PX } from 'modules/workspace/dashboard/utils/receipt-reliability-plot';
import type { ReactElement } from 'react';

export type BubblePlotMark = PlottedMark;

export type BubblePlotGridline = { value: number; y: number };

type BubblePlotProps = {
  /** Every mark already positioned in the plot's own pixels, label included.
   * The Panel decides where a mark and its label go
   * (`modules/workspace/dashboard/utils/receipt-reliability-plot`); this
   * primitive only draws what it is handed. */
  marks: BubblePlotMark[];
  /** The Panel's own fixed gridlines — value plus the pixel row it sits on. */
  gridlines: BubblePlotGridline[];
  /** The plot box, in CSS pixels. `width` is what the Panel measured for it. */
  width: number;
  height: number;
};

/**
 * A bubble scatter: inline `<svg>`, because ADR 0002 reserves it for the one
 * mark a positioned box cannot express. Each mark's 2px ring is drawn as the
 * circle's own stroke rather than a second element, so the circle count
 * stays one per mark. No tooltip ships and nothing here takes focus (ruled
 * at the tasks gate 2026-09-21).
 *
 * **The coordinate system is CSS pixels, and the viewBox is the plot's
 * measured box.** It was a fixed square `0 0 100 100`, which is what broke the
 * Panel three ways at once: `xMidYMid meet` fitted that square to the 140px
 * height and letterboxed the rest of a 610px-wide card, so the plot drew at
 * 140 × 140 in the middle of it; every radius the Panel computed in the
 * design's pixels was then re-scaled by 1.4 and clipped against the plot edge;
 * and no pixel distance — a label's box, a mark's reach — could be reasoned
 * about at all. `preserveAspectRatio="none"` would have stretched the plot to
 * fill the card by turning every mark into an ellipse, so the viewBox follows
 * the measured width instead and the scale stays exactly 1:1 in both axes.
 */
export const BubblePlot = ({
  marks,
  gridlines,
  width,
  height,
}: BubblePlotProps): ReactElement => (
  <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
    {gridlines.map((gridline) => (
      <line
        key={gridline.value}
        data-testid="chart-gridline"
        x1={0}
        x2={width}
        y1={gridline.y}
        y2={gridline.y}
        stroke="var(--chart-grid)"
        strokeWidth={1}
      />
    ))}
    {marks.map((mark) => (
      <g key={mark.id}>
        <circle
          cx={mark.cx}
          cy={mark.cy}
          r={mark.r}
          fill="var(--chart-ramp-3b)"
          stroke="var(--surface)"
          strokeWidth={MARK_RING_WIDTH_PX}
        />
        <text
          x={mark.labelX}
          y={mark.labelY}
          textAnchor={mark.labelAnchor}
          className="fill-foreground text-xs"
        >
          {mark.label}
        </text>
      </g>
    ))}
  </svg>
);
