import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SidebarCollapseToggle } from 'shared/layouts/sidebar/components/SidebarCollapseToggle';

// The control that moves the list between its two widths. It owns neither the
// preference nor the transition — `Sidebar` holds both through
// `useCollapsedSidebar` — so what is asserted here is what it announces and
// what it reports.
describe('SidebarCollapseToggle', () => {
  it('announces the list beside it as expanded while the labels are on screen', () => {
    render(
      <SidebarCollapseToggle
        isCollapsed={false}
        label="Collapse navigation"
        onToggle={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Collapse navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Collapse navigation')).not.toHaveClass('sr-only');
  });

  // On the rail the label is taken off screen rather than dropped, so the
  // control keeps the accessible name the wide sidebar gives it.
  it('keeps its name on the rail with the label off screen', () => {
    render(
      <SidebarCollapseToggle
        isCollapsed
        label="Expand navigation"
        onToggle={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Expand navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Expand navigation')).toHaveClass('sr-only');
  });

  // The control sits above the list, so any height it gives back at the rail
  // moves every entry below it. Only its horizontal inset answers the width.
  it('keeps the same vertical inset at both widths', () => {
    const { rerender } = render(
      <SidebarCollapseToggle
        isCollapsed={false}
        label="Collapse navigation"
        onToggle={vi.fn()}
      />,
    );
    const inset = (): HTMLElement | null =>
      screen.getByRole('button').parentElement;
    expect(inset()).toHaveClass('py-4');
    expect(inset()).toHaveClass('px-4');

    rerender(
      <SidebarCollapseToggle
        isCollapsed
        label="Expand navigation"
        onToggle={vi.fn()}
      />,
    );
    expect(inset()).toHaveClass('py-4');
    expect(inset()).toHaveClass('px-2');
  });

  it('reports the press to its owner', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <SidebarCollapseToggle
        isCollapsed={false}
        label="Collapse navigation"
        onToggle={onToggle}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Collapse navigation' }),
    );

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
