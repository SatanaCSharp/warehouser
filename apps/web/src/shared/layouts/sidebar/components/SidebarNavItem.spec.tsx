import { screen, within } from '@testing-library/react';
import { ROUTES } from 'shared/constants/routes';
import { DashboardIcon } from 'shared/icons';
import { SidebarNavItem } from 'shared/layouts/sidebar/components/SidebarNavItem';
import { accessIds } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { describe, expect, it } from 'vitest';

// One entry, at either width. An entry carries an icon and a label and nothing
// after them — the `trailing` slot that once held the `Purchase drafts` drift
// count was withdrawn with the count itself — so what these cases pin is the
// label: its accessible name at both widths, and the fact that the rail takes
// it off screen rather than dropping it.

/** Resolves once the router has committed the entry, which it does asynchronously. */
const renderItem = async ({
  isCollapsed,
}: {
  isCollapsed: boolean;
}): Promise<HTMLElement> => {
  renderInEnteredWarehouse(
    <ul>
      <SidebarNavItem
        to={ROUTES.WAREHOUSE}
        params={{ warehouseId: accessIds.warehouse }}
        isActive={false}
        isCollapsed={isCollapsed}
        icon={<DashboardIcon />}
        label="Dashboard"
      />
    </ul>,
  );

  return screen.findByRole('link', { name: 'Dashboard' });
};

describe('SidebarNavItem', () => {
  it('addresses its destination and names itself by its label', async () => {
    const entry = await renderItem({ isCollapsed: false });

    expect(entry).toHaveAttribute('href', `/warehouses/${accessIds.warehouse}`);
  });

  // On the rail the label is taken off screen rather than dropped, and the
  // pointer affordance the platform provides stands in for it.
  it('takes the label off screen on the rail and hints it to a pointer', async () => {
    const entry = await renderItem({ isCollapsed: true });

    expect(within(entry).getByText('Dashboard')).toHaveClass('sr-only');
    expect(entry).toHaveAttribute('title', 'Dashboard');
  });

  it('offers no pointer hint in the wide list, where the label is on screen', async () => {
    const entry = await renderItem({ isCollapsed: false });

    expect(entry).not.toHaveAttribute('title');
    expect(within(entry).getByText('Dashboard')).not.toHaveClass('sr-only');
  });

  // The squeeze this row once shipped: `size-5` is a flex BASIS, not a floor,
  // so anything of its own min-content width sharing the icon's line takes
  // width out of the icon — which is what the count did on the 72px rail.
  // Nothing shares that line now, and the icon's own refusal to shrink is what
  // keeps a slot added later from reintroducing it.
  it('draws an icon that refuses to shrink at either width', async () => {
    const railEntry = await renderItem({ isCollapsed: true });

    expect(railEntry.querySelector('svg')?.getAttribute('class')).toMatch(
      /\bshrink-0\b/u,
    );
  });
});
