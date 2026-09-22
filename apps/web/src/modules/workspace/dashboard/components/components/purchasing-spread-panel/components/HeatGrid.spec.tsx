import { render, screen } from '@testing-library/react';
import { HeatGrid } from 'modules/workspace/dashboard/components/components/purchasing-spread-panel/components/HeatGrid';
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

  // The grid took no focus at all until it was presented with HeroUI's
  // `Table`, whose React Aria collection gives rows and cells roving
  // navigation — the cost
  // `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
  // § Consequences records. What is still true, and still asserted, is that
  // no cell is a control: everything focusable is the grid itself.
  it('offers no control to focus on any cell', () => {
    const { container } = render(
      <HeatGrid columns={['Draft', 'Ready']} rows={rows} />,
    );

    expect(container.querySelectorAll('button, a, input')).toHaveLength(0);

    const focusable = Array.from(container.querySelectorAll('[tabindex]'));
    expect(
      focusable.filter((element) => element.closest('[role="grid"]') === null),
    ).toStrictEqual([]);
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
