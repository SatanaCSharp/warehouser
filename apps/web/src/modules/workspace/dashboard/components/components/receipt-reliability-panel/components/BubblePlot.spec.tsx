import { render, screen } from '@testing-library/react';
import type { BubblePlotMark } from 'modules/workspace/dashboard/components/components/receipt-reliability-panel/components/BubblePlot';
import { BubblePlot } from 'modules/workspace/dashboard/components/components/receipt-reliability-panel/components/BubblePlot';
import { describe, expect, it } from 'vitest';

// design-handoff.md § Panel specifications (Receipt Reliability) — "Each mark
// is direct-labelled with its Warehouse name" (AC-19), so no legend has to be
// consulted to read it. ADR 0002 — inline <svg> is used only for the scatter's
// circles and their surface rings, everything else stays a box.
//
// Everything this primitive is handed is in CSS pixels, inside a viewBox that
// is the plot's own measured box. The Panel computes those pixels
// (`modules/workspace/dashboard/utils/receipt-reliability-plot`); this suite
// pins that the primitive draws them unchanged and adds no geometry of its
// own.
describe('BubblePlot', () => {
  const PLOT_WIDTH = 417;
  const PLOT_HEIGHT = 140;

  const marks: BubblePlotMark[] = [
    {
      id: 'wh-a',
      label: 'Warehouse A',
      cx: 369,
      cy: 30,
      r: 16,
      labelX: 369,
      labelY: 60,
      labelAnchor: 'middle',
    },
    {
      id: 'wh-b',
      label: 'Warehouse B',
      cx: 247,
      cy: 65,
      r: 10,
      labelX: 262,
      labelY: 69,
      labelAnchor: 'start',
    },
  ];

  const gridlines = [
    { value: 0, y: 123 },
    { value: 50, y: 70 },
    { value: 100, y: 17 },
  ];

  const draw = (): ReturnType<typeof render> =>
    render(
      <BubblePlot
        marks={marks}
        gridlines={gridlines}
        width={PLOT_WIDTH}
        height={PLOT_HEIGHT}
      />,
    );

  it('labels every mark directly with its Warehouse name', () => {
    draw();

    expect(screen.getByText('Warehouse A')).toBeInTheDocument();
    expect(screen.getByText('Warehouse B')).toBeInTheDocument();
  });

  it('draws one circle per mark', () => {
    const { container } = draw();

    expect(container.querySelectorAll('circle')).toHaveLength(marks.length);
  });

  // The defect this replaces: a fixed square `0 0 100 100` viewBox under the
  // default `xMidYMid meet` scaled to the 140px height and letterboxed the
  // rest of the card, so a 610px-wide Panel drew a 140px-wide plot. The
  // viewBox is the measured box, so the plot spans whatever width it is given
  // and the scale is 1:1 in both axes.
  it('takes its measured box as the viewBox, so the plot spans its full width', () => {
    const { container } = draw();
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('viewBox')).toBe(
      `0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`,
    );
  });

  // `preserveAspectRatio="none"` would make the plot span its card by
  // stretching the coordinate system — and every mark with it, turning each
  // circle into an ellipse. It must never appear here.
  it('never stretches its coordinate system, so a mark stays circular', () => {
    const { container } = draw();
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('preserveAspectRatio')).not.toBe('none');
  });

  // design-handoff.md § Type and mark specs — "Gridlines: 1 px solid
  // $chart/grid — never dashed" — drawn at the pixel row the Panel computed
  // for each value, and spanning the plot.
  it('draws each gridline solid and 1px at the row it was given', () => {
    const { container } = draw();
    const lines = Array.from(
      container.querySelectorAll('[data-testid="chart-gridline"]'),
    );

    expect(lines).toHaveLength(gridlines.length);
    for (const [index, line] of lines.entries()) {
      expect(line.getAttribute('y1')).toBe(String(gridlines[index].y));
      expect(line.getAttribute('x2')).toBe(String(PLOT_WIDTH));
      expect(line.getAttribute('stroke-width')).toBe('1');
      expect(line.getAttribute('stroke-dasharray')).toBeNull();
    }
  });

  // design-handoff.md § Type and mark specs — "2 px $surface/surface ring",
  // drawn as the circle's own stroke so the circle count stays one per mark.
  it('rings every mark with 2px of the surface colour', () => {
    const { container } = draw();

    for (const circle of container.querySelectorAll('circle')) {
      expect(circle.getAttribute('stroke')).toBe('var(--surface)');
      expect(circle.getAttribute('stroke-width')).toBe('2');
    }
  });

  it('draws each mark at the pixel centre and radius it was given', () => {
    const { container } = draw();
    const [first] = Array.from(container.querySelectorAll('circle'));

    expect(first.getAttribute('cx')).toBe(String(marks[0].cx));
    expect(first.getAttribute('cy')).toBe(String(marks[0].cy));
    expect(first.getAttribute('r')).toBe(String(marks[0].r));
  });

  it('ships no tooltip and takes no focus', () => {
    const { container } = draw();

    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(container.querySelectorAll('[title]')).toHaveLength(0);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('never renders a status colour', () => {
    const { container } = draw();

    const html = container.innerHTML;
    expect(html).not.toMatch(/--danger/u);
    expect(html).not.toMatch(/--warning/u);
    expect(html).not.toMatch(/--success/u);
  });

  // T21 — the Panel moves a label aside for its own collision arithmetic
  // (design-handoff.md § Panel specifications — Receipt Reliability, "moved
  // to the side where that would collide"). This primitive stays ignorant of
  // collision: it places a label exactly where the mark says, anchor
  // included.
  it("places every label at its mark's own point and anchor", () => {
    draw();

    const centred = screen.getByText('Warehouse A');
    expect(centred.getAttribute('x')).toBe(String(marks[0].labelX));
    expect(centred.getAttribute('y')).toBe(String(marks[0].labelY));
    expect(centred.getAttribute('text-anchor')).toBe('middle');

    const aside = screen.getByText('Warehouse B');
    expect(aside.getAttribute('x')).toBe(String(marks[1].labelX));
    expect(aside.getAttribute('text-anchor')).toBe('start');
  });
});
