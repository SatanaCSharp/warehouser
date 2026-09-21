import { render, screen } from '@testing-library/react';
import { HeatGrid } from 'shared/components/charts/HeatGrid';
import { describe, expect, it } from 'vitest';

// design-handoff.md § Panel specifications (Purchasing Spread) — "the count
// printed in every cell, so the fill is a scanning aid and never the only
// encoding." § Type and mark specs — heat-grid cell 84x30, radius 6.
describe('HeatGrid', () => {
  const rows = [
    {
      label: 'Warehouse A',
      cells: [
        {
          id: 'a-draft',
          columnLabel: 'Draft',
          count: 12,
          bin: 'ramp-4b' as const,
        },
        { id: 'a-ready', columnLabel: 'Ready', count: 0, bin: 'zero' as const },
      ],
    },
    {
      label: 'Warehouse B',
      cells: [
        {
          id: 'b-draft',
          columnLabel: 'Draft',
          count: 103,
          bin: 'ramp-4a' as const,
        },
        {
          id: 'b-ready',
          columnLabel: 'Ready',
          count: 5,
          bin: 'ramp-4d' as const,
        },
      ],
    },
  ];

  it('prints every cell count as text, so the fill is never the only encoding', () => {
    render(<HeatGrid columns={['Draft', 'Ready']} rows={rows} />);

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('103')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('names every row by its Warehouse, so the grid is readable with colour removed', () => {
    render(<HeatGrid columns={['Draft', 'Ready']} rows={rows} />);

    expect(screen.getByText('Warehouse A')).toBeInTheDocument();
    expect(screen.getByText('Warehouse B')).toBeInTheDocument();
  });

  it('takes no focus on any cell', () => {
    const { container } = render(
      <HeatGrid columns={['Draft', 'Ready']} rows={rows} />,
    );

    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(container.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('never renders a status colour', () => {
    const { container } = render(
      <HeatGrid columns={['Draft', 'Ready']} rows={rows} />,
    );

    const html = container.innerHTML;
    expect(html).not.toMatch(/--danger/u);
    expect(html).not.toMatch(/--warning/u);
    expect(html).not.toMatch(/--success/u);
  });
});
