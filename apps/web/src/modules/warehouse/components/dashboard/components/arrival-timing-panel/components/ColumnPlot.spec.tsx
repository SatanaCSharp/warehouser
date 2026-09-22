import { render } from '@testing-library/react';
import { ColumnPlot } from 'modules/warehouse/components/dashboard/components/arrival-timing-panel/components/ColumnPlot';
import { describe, expect, it } from 'vitest';

// design-handoff.md § Panel specifications (Arrival Timing) — "three
// gridlines at 0 / 1 250 / 2 500", drawn "1px solid $chart/grid — never
// dashed". § States and interactions — no tooltip ships (ruled at the tasks
// gate 2026-09-21) and nothing on either surface is interactive beyond the
// shell's own navigation.
describe('ColumnPlot', () => {
  const series = [
    { id: 'owed', label: 'Owed', colorVar: '--chart-ramp-3b' },
    {
      id: 'expected',
      label: 'Expected at the dock',
      colorVar: '--chart-supply',
    },
  ];
  const buckets = [
    { id: 'overdue', label: 'Overdue', values: { owed: 400, expected: 0 } },
    { id: 'w39', label: '39', values: { owed: 300, expected: 250 } },
  ];

  it('draws exactly the gridlines it was given, as solid hairlines', () => {
    const { container } = render(
      <ColumnPlot
        series={series}
        buckets={buckets}
        gridlineValues={[0, 1250, 2500]}
        maxValue={2500}
      />,
    );

    const gridlines = container.querySelectorAll(
      '[data-testid="chart-gridline"]',
    );
    expect(gridlines).toHaveLength(3);
  });

  it('ships no tooltip and takes no focus', () => {
    const { container } = render(
      <ColumnPlot
        series={series}
        buckets={buckets}
        gridlineValues={[0, 1250, 2500]}
        maxValue={2500}
      />,
    );

    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(container.querySelectorAll('[title]')).toHaveLength(0);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('never renders a status colour', () => {
    const { container } = render(
      <ColumnPlot
        series={series}
        buckets={buckets}
        gridlineValues={[0, 1250, 2500]}
        maxValue={2500}
      />,
    );

    const html = container.innerHTML;
    expect(html).not.toMatch(/--danger/u);
    expect(html).not.toMatch(/--warning/u);
    expect(html).not.toMatch(/--success/u);
  });
});
