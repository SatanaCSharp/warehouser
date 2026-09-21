import { render, screen } from '@testing-library/react';
import { PanelFootnote } from 'shared/components/charts/PanelFootnote';
import { describe, expect, it } from 'vitest';

// design-handoff.md § Type and mark specs — "Panel meta, footnote — 12 / 400 /
// $foreground/muted." spec.md §6 "Exclusion accounting" — every excluded
// count is a stated field, carried here as the footnote's own text.
describe('PanelFootnote', () => {
  it('renders the exclusion text it is given', () => {
    render(
      <PanelFootnote>
        3 Customer Orders beyond the eighth week, covering 240 units.
      </PanelFootnote>,
    );

    expect(
      screen.getByText(
        '3 Customer Orders beyond the eighth week, covering 240 units.',
      ),
    ).toBeInTheDocument();
  });

  it('renders as a paragraph, never as a status alert', () => {
    const { container } = render(
      <PanelFootnote>Excluded: none.</PanelFootnote>,
    );

    const footnote = container.querySelector('p');
    expect(footnote).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('never renders a status colour', () => {
    const { container } = render(
      <PanelFootnote>Excluded: none.</PanelFootnote>,
    );

    const html = container.innerHTML;
    expect(html).not.toMatch(/--danger/u);
    expect(html).not.toMatch(/--warning/u);
    expect(html).not.toMatch(/--success/u);
  });
});
