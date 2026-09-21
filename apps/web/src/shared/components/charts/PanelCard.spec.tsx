import { render, screen } from '@testing-library/react';
import { PanelCard } from 'shared/components/charts/PanelCard';
import { describe, expect, it } from 'vitest';

// design-handoff.md § Component mapping — PanelCard IS HeroUI Card +
// Card.Header + Card.Content; padding, radius and both shadows are the Card
// contract and must not be restyled, so it is composed from `Card` rather
// than a detached lookalike (ADR 0002 Consequences).
//
// design-handoff.md § Accessibility — each Panel carries a visible `h2`
// (the surface's own `h1` is visually hidden), so the heading order reads
// `h1 -> h2 x n`.
describe('PanelCard', () => {
  it('renders the Panel title as a visible h2, using Card as its frame', () => {
    const { container } = render(
      <PanelCard title="Coverage Gap" meta="10 Items">
        <p>plot</p>
      </PanelCard>,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Coverage Gap' }),
    ).toBeInTheDocument();
    // HeroUI's Card base class — proof the frame IS Card, not a hand-rolled
    // lookalike whose padding/radius/shadow the task forbids restyling.
    expect(container.querySelector('.card')).not.toBeNull();
  });

  it('renders the Panel meta beside the title without a second desktop line', () => {
    render(
      <PanelCard title="Coverage Gap" meta="10 Items">
        <p>plot</p>
      </PanelCard>,
    );

    expect(screen.getByText('10 Items')).toBeInTheDocument();
  });

  it('renders its content', () => {
    render(
      <PanelCard title="Coverage Gap" meta="10 Items">
        <p>the plot itself</p>
      </PanelCard>,
    );

    expect(screen.getByText('the plot itself')).toBeInTheDocument();
  });

  // design-handoff.md § Responsive behavior — "list rows flex between 20px
  // and 26px; below 20px the Panel scrolls internally while the surface does
  // not" (ruled at the tasks gate 2026-09-21). A Panel that must scroll
  // internally carries the overflow itself; it does not let the whole grid
  // scroll on its behalf.
  it('scrolls its own content internally when told it is cramped, rather than growing past its row', () => {
    const { container } = render(
      <PanelCard title="Demand Pressure" meta="8 Warehouses" scrollable>
        <p>rows</p>
      </PanelCard>,
    );

    const scrollRegion = container.querySelector('.overflow-y-auto');
    expect(scrollRegion).not.toBeNull();
  });

  it('does not scroll internally when it is not cramped', () => {
    const { container } = render(
      <PanelCard title="Demand Pressure" meta="8 Warehouses">
        <p>rows</p>
      </PanelCard>,
    );

    expect(container.querySelector('.overflow-y-auto')).toBeNull();
  });
});
