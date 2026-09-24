import {
  gridlinePositions,
  labelBox,
  markBox,
  markRadius,
  plotGeometryFor,
  plotMarks,
  plotY,
  UNMEASURED_PLOT_WIDTH_PX,
} from 'modules/workspace/dashboard/utils/receipt-reliability-plot';
import { describe, expect, it } from 'vitest';

// ADR 0002 ("Draw the Panels from layout primitives … with no charting
// dependency") names this file's arithmetic — the scatter's scale and its
// "label-collision placement" — as the layout the repository owns outright,
// and asks for it to be unit-tested directly rather than through a rendered
// chart. Colocated with its subject (`docs/system/guides/placing-web-tests.md`
// §1).
describe('receipt-reliability-plot', () => {
  const desktop = plotGeometryFor(UNMEASURED_PLOT_WIDTH_PX);
  const overlaps = (
    one: ReturnType<typeof markBox>,
    other: ReturnType<typeof markBox>,
  ): boolean =>
    one.left < other.right &&
    other.left < one.right &&
    one.top < other.bottom &&
    other.top < one.bottom;

  // `design-handoff.md` § Panel specifications — plot 417 × 140 with marks up
  // to r = 16 on desktop; § Responsive behavior — plot 278 × 200 with "marks
  // scaled to r ≤ 12" below the breakpoint. The measured width picks between
  // them, so the mobile ceiling is a rendering the application can actually
  // produce rather than a prop nothing passes.
  it('draws the desktop geometry once the plot is at least as wide as the design', () => {
    expect(plotGeometryFor(417)).toStrictEqual({
      width: 417,
      height: 140,
      inset: 17,
      maxRadius: 16,
      minRadius: 8.7,
    });
    expect(plotGeometryFor(1000).maxRadius).toBe(16);
  });

  it('drops to the mobile geometry, r <= 12, on a narrower plot', () => {
    const mobile = plotGeometryFor(278);

    expect(mobile.maxRadius).toBe(12);
    expect(mobile.height).toBe(200);
    expect(mobile.width).toBe(278);
    expect(markRadius(2000, 2000, mobile)).toBeLessThanOrEqual(12);
  });

  // `design-handoff.md` § Type and mark specs — "r = 16 × √(received ÷ max
  // received), floor ≈ 8.7".
  it('scales a radius by the square root of its share, between the floor and the ceiling', () => {
    expect(markRadius(2000, 2000, desktop)).toBeCloseTo(16, 5);
    expect(markRadius(500, 2000, desktop)).toBeCloseTo(8.7, 5);
    expect(markRadius(1000, 2000, desktop)).toBeCloseTo(16 * Math.SQRT1_2, 5);
    expect(markRadius(0, 0, desktop)).toBeCloseTo(8.7, 5);
  });

  // Gridlines stay at the values the Panel fixes, positioned by the same scale
  // as the marks, and the axis grows upwards: 100 % is the top of the drawable
  // area, 0 % the bottom.
  it('positions each gridline inside the drawable area, 100 % at the top', () => {
    expect(gridlinePositions([0, 50, 100], desktop)).toStrictEqual([
      { value: 0, y: 123 },
      { value: 50, y: 70 },
      { value: 100, y: 17 },
    ]);
  });

  // The defect this pins: a mark at 93.33 % drew at cy 6.67 with r 16, so its
  // top edge sat above the plot and was sliced off. Both axes are inset by the
  // furthest any mark reaches past its own centre.
  it('keeps a mark at either extreme of either axis whole', () => {
    const [topRight, bottomLeft] = plotMarks(
      [
        { id: 'a', label: 'Top Right', x: 100, y: 100, r: desktop.maxRadius },
        { id: 'b', label: 'Bottom Left', x: 0, y: 0, r: desktop.maxRadius },
      ],
      desktop,
    );

    expect(markBox(topRight).top).toBeGreaterThanOrEqual(0);
    expect(markBox(topRight).right).toBeLessThanOrEqual(desktop.width);
    expect(markBox(bottomLeft).left).toBeGreaterThanOrEqual(0);
    expect(markBox(bottomLeft).bottom).toBeLessThanOrEqual(desktop.height);
    expect(plotY(100, desktop)).toBe(desktop.inset);
  });

  // `design-handoff.md` § Panel specifications — "placed centred below the
  // mark and moved to the side where that would collide". The first mark at a
  // crowded spot keeps the design's placement.
  it('centres a label below its mark when nothing is in the way', () => {
    const [only] = plotMarks(
      [{ id: 'a', label: 'Only Dock', x: 50, y: 50, r: 10 }],
      desktop,
    );

    expect(only.labelAnchor).toBe('middle');
    expect(only.labelX).toBe(only.cx);
    expect(only.labelY).toBeGreaterThan(only.cy + only.r);
  });

  // The defect this pins: collision was `x:y` string equality, so two marks a
  // pixel apart counted as no collision and their labels were drawn through
  // each other. Overlap is geometric, over the boxes a label and a mark
  // actually occupy.
  it('moves a label aside when it would overlap a neighbouring label or mark', () => {
    const marks = plotMarks(
      [
        { id: 'a', label: 'Hamburg Yard', x: 80, y: 93.33, r: 16 },
        { id: 'b', label: 'Rotterdam Dock', x: 41.67, y: 66.67, r: 13.5 },
        { id: 'c', label: 'Gdansk Terminal', x: 50, y: 50, r: 8.7 },
        { id: 'd', label: 'Same Point Dock', x: 50, y: 50, r: 8.7 },
      ],
      desktop,
    );

    for (const [index, mark] of marks.entries()) {
      for (const [otherIndex, other] of marks.entries()) {
        if (otherIndex === index) {
          continue;
        }

        expect(overlaps(labelBox(mark), labelBox(other))).toBe(false);
        expect(overlaps(labelBox(mark), markBox(other))).toBe(false);
      }
    }
  });

  it('keeps every label inside the plot it is drawn in', () => {
    const marks = plotMarks(
      [
        { id: 'a', label: 'Far Right Terminal', x: 100, y: 100, r: 16 },
        { id: 'b', label: 'Far Left Terminal', x: 0, y: 0, r: 16 },
      ],
      desktop,
    );

    for (const mark of marks) {
      expect(labelBox(mark).left).toBeGreaterThanOrEqual(0);
      expect(labelBox(mark).right).toBeLessThanOrEqual(desktop.width);
    }
  });
});
