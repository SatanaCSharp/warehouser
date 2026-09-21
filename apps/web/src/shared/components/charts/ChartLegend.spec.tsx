import { render, screen } from '@testing-library/react';
import { ChartLegend } from 'shared/components/charts/ChartLegend';
import { describe, expect, it } from 'vitest';

// design-handoff.md § Accessibility — "Never colour alone": every multi-series
// chart carries a legend whose keys are text, so removing colour entirely
// loses no figure. §3/spec.md §3 forbid a status judgement, so nothing here
// may read as red/amber/green.
describe('ChartLegend', () => {
  const items = [
    { id: 'on-hand', label: 'On hand', colorVar: '--chart-ramp-3a' },
    { id: 'on-order', label: 'On order', colorVar: '--chart-ramp-3b' },
    { id: 'uncovered', label: 'Uncovered', colorVar: '--chart-ramp-3c' },
  ];

  it('names every series as text, so the legend is readable with colour removed', () => {
    render(<ChartLegend items={items} />);

    for (const item of items) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it('reads each swatch colour from a chart token variable rather than a hard-coded hex value', () => {
    const { container } = render(<ChartLegend items={items} />);

    const swatches = container.querySelectorAll('[style*="--chart-"]');
    expect(swatches.length).toBeGreaterThanOrEqual(items.length);
    for (const swatch of swatches) {
      const style = swatch.getAttribute('style') ?? '';
      expect(style).toMatch(/var\(--chart-/u);
    }
  });

  // spec.md §3 / CONTEXT.md — nothing here judges a Warehouse, so no swatch or
  // label may carry the shell's own status vocabulary.
  it('never renders a status colour token', () => {
    const { container } = render(<ChartLegend items={items} />);

    const html = container.innerHTML;
    expect(html).not.toMatch(/--danger/u);
    expect(html).not.toMatch(/--warning/u);
    expect(html).not.toMatch(/--success/u);
  });
});
