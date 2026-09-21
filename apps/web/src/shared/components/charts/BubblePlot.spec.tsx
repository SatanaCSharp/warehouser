import { render, screen } from '@testing-library/react';
import { BubblePlot } from 'shared/components/charts/BubblePlot';
import { describe, expect, it } from 'vitest';

// design-handoff.md § Panel specifications (Receipt Reliability) — "Each mark
// is direct-labelled with its Warehouse name" (AC-19), so no legend has to be
// consulted to read it. ADR 0002 — inline <svg> is used only for the scatter's
// circles and their surface rings, everything else stays a box.
describe('BubblePlot', () => {
  const marks = [
    { id: 'wh-a', label: 'Warehouse A', x: 92, y: 88, r: 16 },
    { id: 'wh-b', label: 'Warehouse B', x: 60, y: 70, r: 10 },
  ];

  it('labels every mark directly with its Warehouse name', () => {
    render(<BubblePlot marks={marks} gridlineValues={[0, 50, 100]} />);

    expect(screen.getByText('Warehouse A')).toBeInTheDocument();
    expect(screen.getByText('Warehouse B')).toBeInTheDocument();
  });

  it('draws one circle per mark', () => {
    const { container } = render(
      <BubblePlot marks={marks} gridlineValues={[0, 50, 100]} />,
    );

    expect(container.querySelectorAll('circle')).toHaveLength(marks.length);
  });

  it('ships no tooltip and takes no focus', () => {
    const { container } = render(
      <BubblePlot marks={marks} gridlineValues={[0, 50, 100]} />,
    );

    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(container.querySelectorAll('[title]')).toHaveLength(0);
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('never renders a status colour', () => {
    const { container } = render(
      <BubblePlot marks={marks} gridlineValues={[0, 50, 100]} />,
    );

    const html = container.innerHTML;
    expect(html).not.toMatch(/--danger/u);
    expect(html).not.toMatch(/--warning/u);
    expect(html).not.toMatch(/--success/u);
  });
});
