import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MemberList } from 'modules/access/components/access-administration/MemberList';
import { renderWithProviders } from 'test/render';

import type { MemberListProps } from 'modules/access/components/access-administration/MemberList';
import type {
  AccessMember,
  AccessRole,
} from 'modules/access/types/access-administration.types';

const managerId = '00000000-0000-4000-8000-000000000001';
const pickerId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000003';
const managerRoleId = '00000000-0000-4000-8000-000000000011';
const pickerRoleId = '00000000-0000-4000-8000-000000000012';

const roles: AccessRole[] = [
  {
    id: managerRoleId,
    kind: 'warehouse_manager',
    name: 'Warehouse Manager',
    permissionIds: [],
    assignedMemberCount: 1,
  },
  {
    id: pickerRoleId,
    kind: 'custom',
    name: 'Picker',
    permissionIds: [],
    assignedMemberCount: 2,
  },
];

const members: AccessMember[] = [
  {
    userId: managerId,
    roleId: managerRoleId,
    roleKind: 'warehouse_manager',
    email: 'manager@example.test',
  },
  {
    userId: pickerId,
    roleId: pickerRoleId,
    roleKind: 'custom',
    email: 'picker@example.test',
  },
  {
    userId: actorId,
    roleId: pickerRoleId,
    roleKind: 'custom',
    email: 'actor@example.test',
  },
];

const renderMemberList = (
  overrides: Partial<MemberListProps> = {},
): MemberListProps => {
  const props: MemberListProps = {
    actorUserId: actorId,
    canDeleteMember: true,
    canEditEmail: true,
    canResetPassword: true,
    isLoading: false,
    members,
    query: '',
    roles,
    onDeleteMember: vi.fn(),
    onEditEmail: vi.fn(),
    onQueryChange: vi.fn(),
    onResetPassword: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<MemberList {...props} />);
  return props;
};

// eslint-disable-next-line max-lines-per-function
describe('MemberList', () => {
  it('shows a loading skeleton and no member rows while loading', () => {
    renderMemberList({ isLoading: true });

    expect(screen.getByLabelText('Loading members')).toBeInTheDocument();
    expect(screen.queryByText('picker@example.test')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no members', () => {
    renderMemberList({ members: [] });

    expect(screen.getByText('No members are available.')).toBeInTheDocument();
  });

  it('shows the search-empty state when the query matches nothing', () => {
    renderMemberList({ query: 'nobody-matches-this' });

    expect(
      screen.getByText('No members match your search.'),
    ).toBeInTheDocument();
  });

  it('renders a member row with email, role, and one kebab trigger identifying the member', () => {
    renderMemberList();

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });
    expect(within(row).getByText('picker@example.test')).toBeInTheDocument();
    expect(within(row).getByText('Picker')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', {
        name: 'Actions for picker@example.test',
      }),
    ).toBeInTheDocument();
  });

  it('opens the menu with only the true-capability actions and invokes the matching callback on selection', async () => {
    const user = userEvent.setup();
    const props = renderMemberList();

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });
    await user.click(
      within(row).getByRole('button', {
        name: 'Actions for picker@example.test',
      }),
    );
    const menu = screen.getByRole('menu', {
      name: 'Actions for picker@example.test',
    });
    expect(
      within(menu).getByRole('menuitem', { name: 'Edit email' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Reset password' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Delete member' }),
    ).toBeInTheDocument();

    await user.click(
      within(menu).getByRole('menuitem', { name: 'Edit email' }),
    );

    expect(props.onEditEmail).toHaveBeenCalledWith(
      expect.objectContaining({ userId: pickerId }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
  });

  it('invokes onResetPassword and onDeleteMember for their respective menu items', async () => {
    const user = userEvent.setup();
    const props = renderMemberList();

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });

    await user.click(
      within(row).getByRole('button', {
        name: 'Actions for picker@example.test',
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Reset password' }));
    expect(props.onResetPassword).toHaveBeenCalledWith(
      expect.objectContaining({ userId: pickerId }),
    );

    await user.click(
      within(row).getByRole('button', {
        name: 'Actions for picker@example.test',
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete member' }));
    expect(props.onDeleteMember).toHaveBeenCalledWith(
      expect.objectContaining({ userId: pickerId }),
    );
  });

  it('closes the menu on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderMemberList();

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });
    const trigger = within(row).getByRole('button', {
      name: 'Actions for picker@example.test',
    });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('opens the menu when the focused trigger receives Enter or Space', async () => {
    const user = userEvent.setup();
    renderMemberList();

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });
    const trigger = within(row).getByRole('button', {
      name: 'Actions for picker@example.test',
    });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.keyboard(' ');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes the menu on an outside click', async () => {
    const user = userEvent.setup();
    renderMemberList();

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });
    await user.click(
      within(row).getByRole('button', {
        name: 'Actions for picker@example.test',
      }),
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(document.body);

    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
  });

  it('moves focus among menu items with Arrow Up/Down', async () => {
    const user = userEvent.setup();
    renderMemberList();

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });
    await user.click(
      within(row).getByRole('button', {
        name: 'Actions for picker@example.test',
      }),
    );
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');

    await user.keyboard('{ArrowDown}');
    expect(items[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(items[0]).toHaveFocus();
  });

  it('shows a Protected chip and no action controls for the Warehouse Manager row', () => {
    renderMemberList();

    const row = screen.getByRole('listitem', {
      name: /manager@example\.test/u,
    });
    expect(within(row).getByText('Protected')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a You chip and no action controls for the acting member’s own row', () => {
    renderMemberList();

    const row = screen.getByRole('listitem', { name: /actor@example\.test/u });
    expect(within(row).getByText('You')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides only the actions the actor is not permissioned for', async () => {
    const user = userEvent.setup();
    renderMemberList({
      canDeleteMember: false,
      canEditEmail: true,
      canResetPassword: false,
    });

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });
    await user.click(
      within(row).getByRole('button', {
        name: 'Actions for picker@example.test',
      }),
    );
    const menu = screen.getByRole('menu');
    expect(
      within(menu).getByRole('menuitem', { name: 'Edit email' }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: 'Reset password' }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitem', { name: 'Delete member' }),
    ).not.toBeInTheDocument();
  });

  it('renders no kebab trigger when the actor holds none of the lifecycle permissions', () => {
    renderMemberList({
      canDeleteMember: false,
      canEditEmail: false,
      canResetPassword: false,
    });

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('filters visible members by the search query', () => {
    renderMemberList({ query: 'picker@' });

    expect(screen.getByText('picker@example.test')).toBeInTheDocument();
    expect(screen.queryByText('manager@example.test')).not.toBeInTheDocument();
  });
});
