import clamp from 'lodash/clamp';
import { linearScale } from 'shared/utils/chart-scale';

/**
 * The Receipt Reliability scatter's pixel arithmetic: which geometry the plot
 * is drawn at, how big a mark is, where its centre sits, and where its label
 * goes once the centred-below position would collide with something already
 * on the plot.
 *
 * It is a `utils/` file because it declares no hook and renders nothing
 * (`docs/system/guides/placing-web-hooks.md` §3), and it is a file of its own
 * because ADR 0002 ("Draw the Panels from layout primitives … with no charting
 * dependency") names this arithmetic — "label-collision placement in the
 * bubble scatter" — as the one piece of layout the repository owns outright
 * and must unit-test directly rather than through a rendered chart.
 *
 * Everything here is in **CSS pixels**. The design states the marks in pixels
 * (`design-handoff.md` § Type and mark specs: "r = 16 × √(received ÷ max
 * received), floor ≈ 8.7; 2 px `$surface/surface` ring"), so a normalised
 * coordinate space would have to convert them back at the last moment — and
 * getting that conversion wrong is exactly what made a 16 px mark render at
 * 22 px and slice itself on the top gridline.
 */

/** A mark as the Panel knows it: two shares, 0–100, and a pixel radius. */
export type ScatterMark = {
  id: string;
  label: string;
  /** On-time Arrival Rate, 0–100. */
  x: number;
  /** Conformance Rate, 0–100. */
  y: number;
  /** The mark's radius in CSS pixels, from {@link markRadius}. */
  r: number;
};

/** A mark once it has a position, and a label that dodges what is already
 * drawn. Every field is a CSS pixel offset inside the plot box. */
export type PlottedMark = {
  id: string;
  label: string;
  cx: number;
  cy: number;
  r: number;
  labelX: number;
  labelY: number;
  labelAnchor: LabelAnchor;
};

export type LabelAnchor = 'start' | 'middle' | 'end';

export type PlotGeometry = {
  /** The plot's own width — whatever the Panel measured for it. */
  width: number;
  height: number;
  /**
   * How far a mark's centre stays from each plot edge, so a Warehouse at 0 %
   * or 100 % on either axis still draws whole. It is the largest radius plus
   * the half of the ring that sits outside the circle's path, which is the
   * furthest any mark can reach past its own centre.
   */
  inset: number;
  maxRadius: number;
  minRadius: number;
};

/** 2 px `$surface/surface` ring (`design-handoff.md` § Type and mark specs).
 * SVG centres a stroke on the path, so half of it lies outside the circle. */
export const MARK_RING_WIDTH_PX = 2;

/**
 * The two plot geometries the design fixes: 417 × 140 with marks up to r = 16
 * on desktop (§ Panel specifications — Receipt Reliability) and 278 × 200 with
 * "marks scaled to r ≤ 12" below the breakpoint (§ Responsive behavior).
 *
 * The measured width picks between them, rather than a prop no caller passes:
 * the ceiling that shipped before was a `maxRadius` prop nothing ever set, so
 * the mobile rendering existed only in a spec
 * (`docs/system/guides/writing-web-components.md` §9). A plot with room for
 * the desktop geometry is drawn at it; a narrower one gets the mobile
 * geometry, which is the taller of the two precisely because its column is
 * narrow.
 */
const DESKTOP_PLOT = { width: 417, height: 140, maxRadius: 16 } as const;
const MOBILE_PLOT = { height: 200, maxRadius: 12 } as const;

/** The width the plot is drawn at before it has been measured — the design's
 * own desktop plot width, so a first paint is the design rather than nothing. */
export const UNMEASURED_PLOT_WIDTH_PX: number = DESKTOP_PLOT.width;

/**
 * `floor ≈ 8.7` against the desktop ceiling of 16 (`design-handoff.md`
 * § Type and mark specs), kept as the ratio between the two so the mobile
 * ceiling of 12 keeps the same proportion instead of crowding a smaller plot
 * with desktop-sized marks. The floor exists because AC-19 direct-labels every
 * plotted Warehouse: a mark too small to carry its label is a Warehouse the
 * reader cannot find.
 */
const MIN_RADIUS_SHARE_OF_MAX = 8.7 / 16;

/** Gap between a mark's outer edge and its label, and between the plot edge
 * and a label pushed against it. */
const LABEL_GAP_PX = 4;

/** The label is 12 / 400 (`design-handoff.md` § Type and mark specs — "Data
 * label"), which `BubblePlot` sets as `text-xs`. SVG text has no measurable
 * box until a browser lays it out, and jsdom lays out nothing, so the label's
 * box is estimated from its character count against that size: a deliberately
 * generous average advance, because over-estimating moves a label aside one
 * time too many rather than one time too few. */
const LABEL_CHARACTER_WIDTH_PX = 6.6;
const LABEL_ASCENT_PX = 9;
const LABEL_DESCENT_PX = 3;

type Box = { left: number; right: number; top: number; bottom: number };

const overlaps = (one: Box, other: Box): boolean =>
  one.left < other.right &&
  other.left < one.right &&
  one.top < other.bottom &&
  other.top < one.bottom;

/** What a mark occupies, ring included. */
export const markBox = ({
  cx,
  cy,
  r,
}: Pick<PlottedMark, 'cx' | 'cy' | 'r'>): Box => {
  const reach = r + MARK_RING_WIDTH_PX / 2;

  return {
    left: cx - reach,
    right: cx + reach,
    top: cy - reach,
    bottom: cy + reach,
  };
};

const anchorOffsets: Record<LabelAnchor, number> = {
  start: 0,
  middle: -0.5,
  end: -1,
};

/** What a label occupies, from its anchor point and its estimated width. */
export const labelBox = ({
  label,
  labelX,
  labelY,
  labelAnchor,
}: Pick<PlottedMark, 'label' | 'labelX' | 'labelY' | 'labelAnchor'>): Box => {
  const width = label.length * LABEL_CHARACTER_WIDTH_PX;
  const left = labelX + anchorOffsets[labelAnchor] * width;

  return {
    left,
    right: left + width,
    top: labelY - LABEL_ASCENT_PX,
    bottom: labelY + LABEL_DESCENT_PX,
  };
};

export const plotGeometryFor = (availableWidth: number): PlotGeometry => {
  const plot =
    availableWidth >= DESKTOP_PLOT.width ? DESKTOP_PLOT : MOBILE_PLOT;

  return {
    width: availableWidth,
    height: plot.height,
    inset: plot.maxRadius + MARK_RING_WIDTH_PX / 2,
    maxRadius: plot.maxRadius,
    minRadius: plot.maxRadius * MIN_RADIUS_SHARE_OF_MAX,
  };
};

/**
 * `r = maxRadius × √(received ÷ max received)`, floored (`design-handoff.md`
 * § Type and mark specs). Area is what the reader compares, so the radius
 * follows the square root of the share rather than the share itself.
 */
export const markRadius = (
  receivedQuantity: number,
  largestReceivedQuantity: number,
  { maxRadius, minRadius }: PlotGeometry,
): number => {
  if (largestReceivedQuantity <= 0) {
    return minRadius;
  }

  return clamp(
    maxRadius * Math.sqrt(receivedQuantity / largestReceivedQuantity),
    minRadius,
    maxRadius,
  );
};

/** A share, 0–100, on the horizontal axis. */
const plotX = (value: number, { width, inset }: PlotGeometry): number =>
  inset + linearScale(value, 100, Math.max(0, width - inset * 2));

/** A share, 0–100, on the vertical axis — which grows upwards, so 100 % sits
 * at the top of the drawable area rather than the bottom. */
export const plotY = (value: number, geometry: PlotGeometry): number =>
  geometry.height -
  geometry.inset -
  linearScale(value, 100, Math.max(0, geometry.height - geometry.inset * 2));

/** The Panel's fixed gridlines, positioned by the same scale as the marks so
 * a value reads at the same height whether it is a line or a bubble. */
export const gridlinePositions = (
  values: number[],
  geometry: PlotGeometry,
): { value: number; y: number }[] =>
  values.map((value) => ({ value, y: plotY(value, geometry) }));

type Placement = {
  id: 'below' | 'right' | 'left' | 'above';
  place: (mark: Omit<PlottedMark, 'labelX' | 'labelY' | 'labelAnchor'>) => {
    labelX: number;
    labelY: number;
    labelAnchor: LabelAnchor;
  };
};

/**
 * "Placed centred below the mark and moved to the side where that would
 * collide" (`design-handoff.md` § Panel specifications — Receipt
 * Reliability). The sides are tried in a fixed order so the same data always
 * produces the same plot, and `above` closes the set for a mark boxed in on
 * all three other sides.
 */
const placements: readonly Placement[] = [
  {
    id: 'below',
    place: ({ cx, cy, r }) => ({
      labelX: cx,
      labelY: cy + r + MARK_RING_WIDTH_PX / 2 + LABEL_GAP_PX + LABEL_ASCENT_PX,
      labelAnchor: 'middle',
    }),
  },
  {
    id: 'right',
    place: ({ cx, cy, r }) => ({
      labelX: cx + r + MARK_RING_WIDTH_PX / 2 + LABEL_GAP_PX,
      labelY: cy + LABEL_ASCENT_PX / 2,
      labelAnchor: 'start',
    }),
  },
  {
    id: 'left',
    place: ({ cx, cy, r }) => ({
      labelX: cx - r - MARK_RING_WIDTH_PX / 2 - LABEL_GAP_PX,
      labelY: cy + LABEL_ASCENT_PX / 2,
      labelAnchor: 'end',
    }),
  },
  {
    id: 'above',
    place: ({ cx, cy, r }) => ({
      labelX: cx,
      labelY: cy - r - MARK_RING_WIDTH_PX / 2 - LABEL_GAP_PX - LABEL_DESCENT_PX,
      labelAnchor: 'middle',
    }),
  },
];

const fitsInside = (box: Box, { width }: PlotGeometry): boolean =>
  box.left >= 0 && box.right <= width;

/**
 * Positions every mark and places every label.
 *
 * Collision is **geometric**: a candidate label is rejected when its box
 * intersects any other mark's box or any label already placed. The test it
 * replaces compared the two marks' coordinates for equality, which reported a
 * collision only for two Warehouses reporting byte-identical rates — so two
 * marks a pixel apart, with their labels drawn straight through each other,
 * counted as no collision at all.
 *
 * Marks are placed in the order given, so the first mark at a crowded spot
 * keeps the design's centred-below label and later ones move aside. A mark
 * with no free side at all keeps the centred-below position: with nowhere
 * good to go, the predictable placement beats an arbitrary one.
 */
export const plotMarks = (
  marks: ScatterMark[],
  geometry: PlotGeometry,
): PlottedMark[] => {
  const positioned = marks.map((mark) => ({
    id: mark.id,
    label: mark.label,
    cx: plotX(mark.x, geometry),
    cy: plotY(mark.y, geometry),
    r: mark.r,
  }));

  const placedLabels: Box[] = [];

  return positioned.map((mark, index) => {
    const otherMarkBoxes = positioned
      .filter((_, otherIndex) => otherIndex !== index)
      .map(markBox);

    const candidates = placements.map((placement) => ({
      ...mark,
      ...placement.place(mark),
    }));

    const free = candidates.find((candidate) => {
      const box = labelBox(candidate);

      return (
        fitsInside(box, geometry) &&
        !otherMarkBoxes.some((other) => overlaps(box, other)) &&
        !placedLabels.some((other) => overlaps(box, other))
      );
    });

    const placed = free ?? candidates[0];
    placedLabels.push(labelBox(placed));

    return placed;
  });
};
