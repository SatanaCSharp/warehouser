import { screen, within } from '@testing-library/react';
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

  it('renders a member row with email, role, and three accessible icon actions', async () => {
    const user = userEvent.setup();
    const props = renderMemberList();

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });
    expect(within(row).getByText('picker@example.test')).toBeInTheDocument();
    expect(within(row).getByText('Picker')).toBeInTheDocument();

    await user.click(
      within(row).getByRole('button', {
        name: 'Edit email for picker@example.test',
      }),
    );
    expect(props.onEditEmail).toHaveBeenCalledWith(
      expect.objectContaining({ userId: pickerId }),
    );

    await user.click(
      within(row).getByRole('button', {
        name: 'Reset password for picker@example.test',
      }),
    );
    expect(props.onResetPassword).toHaveBeenCalledWith(
      expect.objectContaining({ userId: pickerId }),
    );

    await user.click(
      within(row).getByRole('button', {
        name: 'Delete picker@example.test',
      }),
    );
    expect(props.onDeleteMember).toHaveBeenCalledWith(
      expect.objectContaining({ userId: pickerId }),
    );
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

  it('hides only the actions the actor is not permissioned for', () => {
    renderMemberList({
      canDeleteMember: false,
      canEditEmail: true,
      canResetPassword: false,
    });

    const row = screen.getByRole('listitem', {
      name: /picker@example\.test/u,
    });
    expect(
      within(row).getByRole('button', {
        name: 'Edit email for picker@example.test',
      }),
    ).toBeInTheDocument();
    expect(
      within(row).queryByRole('button', {
        name: 'Reset password for picker@example.test',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', {
        name: 'Delete picker@example.test',
      }),
    ).not.toBeInTheDocument();
  });

  it('renders no per-row action controls when the actor holds none of the lifecycle permissions', () => {
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
