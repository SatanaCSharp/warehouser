import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemberList } from 'modules/access/components/access-workspace/components/members/MemberList';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { MemberListProps } from 'modules/access/components/access-workspace/components/members/MemberList';
import type {
  AccessMember,
  AccessRole,
} from 'modules/access/types/access.types';

/**
 * Each row decides for itself which of its three actions the actor may run, from
 * the cached current-access projection of the addressed Warehouse
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`). So a case that
 * varies authority varies the *stubbed projection*, not a harness prop: what
 * these cases assert is the gate every actor really meets.
 */
const lifecyclePermissions = [
  PermissionId.USERS_EMAIL_UPDATE,
  PermissionId.USERS_PASSWORD_CHANGE,
  PermissionId.USERS_DELETE,
];

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

/**
 * Renders the list for an actor holding `permissionIds`, with that actor's
 * projection already in the cache the rows read.
 *
 * Seeding the cache rather than waiting for a request keeps every case below
 * asserting against resolved markup — including the loading and empty cases,
 * which render no row and would therefore have no projection read to wait for.
 */
const renderMemberList = async (
  overrides: Partial<MemberListProps> = {},
  permissionIds: readonly PermissionId[] = lifecyclePermissions,
): Promise<MemberListProps> => {
  stubAccessServer({ permissionIds });
  const store = authenticatedStore(actorId);
  await store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: [...permissionIds],
        archivedAt: null,
      },
    ),
  );
  const props: MemberListProps = {
    actorUserId: actorId,
    isLoading: false,
    members,
    roles,
    onDeleteMember: vi.fn(),
    onEditEmail: vi.fn(),
    onResetPassword: vi.fn(),
    ...overrides,
  };
  renderInEnteredWarehouse(
    <MemberList {...props} />,
    store,
    accessIds.warehouse,
  );
  // The mount is a Warehouse address the router resolves, so the search field —
  // the one control every state of the list renders — is what says the subject
  // is on screen.
  await screen.findByLabelText('Search members');

  return props;
};

const pickerRow = (): HTMLElement =>
  screen.getByRole('listitem', { name: /picker@example\.test/u });

const openPickerMenu = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> => {
  const trigger = within(pickerRow()).getByRole('button', {
    name: 'Actions for picker@example.test',
  });
  await user.click(trigger);
  return trigger;
};

describe('MemberList', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading skeleton and no member rows while loading', async () => {
    await renderMemberList({ isLoading: true });

    expect(screen.getByLabelText('Loading members')).toBeInTheDocument();
    expect(screen.queryByText('picker@example.test')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no members', async () => {
    await renderMemberList({ members: [] });

    expect(screen.getByText('No members are available.')).toBeInTheDocument();
  });

  it('shows the search-empty state when the query matches nothing', async () => {
    const user = userEvent.setup();
    await renderMemberList();

    await user.type(
      screen.getByLabelText('Search members'),
      'nobody-matches-this',
    );

    expect(
      screen.getByText('No members match your search.'),
    ).toBeInTheDocument();
  });

  it('filters visible members by the search query', async () => {
    const user = userEvent.setup();
    await renderMemberList();

    await user.type(screen.getByLabelText('Search members'), 'picker@');

    expect(screen.getByText('picker@example.test')).toBeInTheDocument();
    expect(screen.queryByText('manager@example.test')).not.toBeInTheDocument();
  });

  it('renders a member row with email, role, and one kebab trigger identifying the member', async () => {
    await renderMemberList();

    expect(
      within(pickerRow()).getByText('picker@example.test'),
    ).toBeInTheDocument();
    expect(within(pickerRow()).getByText('Picker')).toBeInTheDocument();
    expect(
      within(pickerRow()).getByRole('button', {
        name: 'Actions for picker@example.test',
      }),
    ).toBeInTheDocument();
  });

  it('opens the menu with only the true-capability actions and invokes the matching callback on selection', async () => {
    const user = userEvent.setup();
    const props = await renderMemberList();

    await openPickerMenu(user);
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
    const props = await renderMemberList();

    await openPickerMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Reset password' }));
    expect(props.onResetPassword).toHaveBeenCalledWith(
      expect.objectContaining({ userId: pickerId }),
    );

    await openPickerMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Delete member' }));
    expect(props.onDeleteMember).toHaveBeenCalledWith(
      expect.objectContaining({ userId: pickerId }),
    );
  });

  it('closes the menu on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    await renderMemberList();

    const trigger = await openPickerMenu(user);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('opens the menu when the focused trigger receives Enter or Space', async () => {
    const user = userEvent.setup();
    await renderMemberList();

    const trigger = within(pickerRow()).getByRole('button', {
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
    await renderMemberList();

    await openPickerMenu(user);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(document.body);

    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
  });

  it('moves focus among menu items with Arrow Up/Down', async () => {
    const user = userEvent.setup();
    await renderMemberList();

    await openPickerMenu(user);
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');

    await user.keyboard('{ArrowDown}');
    expect(items[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(items[0]).toHaveFocus();
  });

  it('shows a Protected chip and no action controls for the Warehouse Manager row', async () => {
    await renderMemberList();

    const row = screen.getByRole('listitem', {
      name: /manager@example\.test/u,
    });
    expect(within(row).getByText('Protected')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a You chip and no action controls for the acting member’s own row', async () => {
    await renderMemberList();

    const row = screen.getByRole('listitem', { name: /actor@example\.test/u });
    expect(within(row).getByText('You')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides only the actions the actor is not permissioned for', async () => {
    const user = userEvent.setup();
    await renderMemberList({}, [PermissionId.USERS_EMAIL_UPDATE]);

    await openPickerMenu(user);
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

  it('renders no kebab trigger when the actor holds none of the lifecycle permissions', async () => {
    await renderMemberList({}, []);

    expect(within(pickerRow()).queryByRole('button')).not.toBeInTheDocument();
  });
});
