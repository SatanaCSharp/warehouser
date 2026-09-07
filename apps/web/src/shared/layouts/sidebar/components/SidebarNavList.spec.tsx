import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SidebarNavList } from 'shared/layouts/sidebar/components/SidebarNavList';

// The list container both contexts share. Its whole subject is that there is
// exactly ONE of it: the Warehouse and Workspace entry sets used to write the
// `<ul>` and its two paddings each for themselves, so the rail's inset could be
// changed in one place and left stale in the other.
describe('SidebarNavList', () => {
  it('renders its entries inside a single list', () => {
    render(
      <SidebarNavList isCollapsed={false}>
        <li>Dashboard</li>
        <li>Access</li>
      </SidebarNavList>,
    );

    const list = screen.getByRole('list');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(list).toContainElement(screen.getByText('Dashboard'));
  });

  // The rail is 72px wide, so it insets by 8px where the wide list insets by
  // 16px. This is the one thing the container decides, and it is asserted here
  // rather than in either context's entries.
  it.each([
    [false, 'px-4'],
    [true, 'px-2'],
  ])('insets the list for isCollapsed=%s with %s', (isCollapsed, padding) => {
    render(
      <SidebarNavList isCollapsed={isCollapsed}>
        <li>Dashboard</li>
      </SidebarNavList>,
    );

    expect(screen.getByRole('list')).toHaveClass(padding);
  });

  // The width is a horizontal change, and the entries must not move vertically
  // as it happens. A `p-*` that answered `isCollapsed` shrank the top inset too
  // and lifted the whole list by 8px, so the vertical inset is asserted to be
  // the SAME class at both widths rather than merely present at each.
  it('keeps the same vertical inset at both widths', () => {
    const { rerender } = render(
      <SidebarNavList isCollapsed={false}>
        <li>Dashboard</li>
      </SidebarNavList>,
    );
    expect(screen.getByRole('list')).toHaveClass('py-4');

    rerender(
      <SidebarNavList isCollapsed>
        <li>Dashboard</li>
      </SidebarNavList>,
    );
    expect(screen.getByRole('list')).toHaveClass('py-4');
  });
});
