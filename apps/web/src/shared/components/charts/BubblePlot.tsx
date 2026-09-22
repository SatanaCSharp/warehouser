import type { ReactElement } from 'react';

export type BubblePlotMark = {
  id: string;
  /** The Warehouse name, printed directly beside the mark so no legend has
   * to be consulted to read it (design-handoff.md § Panel specifications —
   * Receipt Reliability, AC-19). */
  label: string;
  /** On-time Arrival Rate, 0-100. */
  x: number;
  /** Conformance Rate, 0-100. */
  y: number;
  r: number;
  /** Horizontal offset added to `x` when placing this mark's own label —
   * the caller's own collision arithmetic moves a label aside with this
   * rather than teaching this primitive a layout policy (design-handoff.md
   * § Panel specifications — Receipt Reliability, "moved to the side where
   * that would collide"). Defaults to `0` — centred on the mark. */
  labelOffsetX?: number;
  /** The label's own text-anchor. A label moved aside with `labelOffsetX`
   * reads from its new anchor point rather than still centring on the mark.
   * Defaults to `'middle'`. */
  labelAnchor?: 'start' | 'middle' | 'end';
};

type BubblePlotProps = {
  marks: BubblePlotMark[];
  /** The Panel's own fixed gridlines, e.g. `[0, 50, 100]`. */
  gridlineValues: number[];
};

const VIEWBOX_SIZE = 100;
const LABEL_GAP = 6;

/**
 * A bubble scatter: inline `<svg>`, because ADR 0002 reserves it for the one
 * mark a positioned box cannot express. Each mark's 2px ring is drawn as the
 * circle's own stroke rather than a second element, so the circle count
 * stays one per mark. No tooltip ships and nothing here takes focus (ruled
 * at the tasks gate 2026-09-21).
 */
export const BubblePlot = ({
  marks,
  gridlineValues,
}: BubblePlotProps): ReactElement => (
  <svg
    viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
    className="h-[140px] w-full"
  >
    {gridlineValues.map((value) => (
      <line
        key={value}
        data-testid="chart-gridline"
        x1={0}
        x2={VIEWBOX_SIZE}
        y1={VIEWBOX_SIZE - value}
        y2={VIEWBOX_SIZE - value}
        stroke="var(--chart-grid)"
        strokeWidth={0.5}
      />
    ))}
    {marks.map((mark) => (
      <g key={mark.id}>
        <circle
          cx={mark.x}
          cy={VIEWBOX_SIZE - mark.y}
          r={mark.r}
          fill="var(--chart-ramp-3b)"
          stroke="var(--surface)"
          strokeWidth={2}
        />
        <text
          x={mark.x + (mark.labelOffsetX ?? 0)}
          y={VIEWBOX_SIZE - mark.y + mark.r + LABEL_GAP}
          textAnchor={mark.labelAnchor ?? 'middle'}
          className="fill-foreground"
          style={{ fontSize: 6 }}
        >
          {mark.label}
        </text>
      </g>
    ))}
  </svg>
);
