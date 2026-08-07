import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { AccessAdministration } from 'modules/access/components/access-administration/AccessAdministration';
import { authBecameAuthenticated } from 'modules/auth/store/auth.slice';
import { makeStore } from 'store';
import { renderWithProviders } from 'test/render';

import type {
  AccessProjection,
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';
import type { AppStore } from 'store';

const managerId = '00000000-0000-4000-8000-000000000001';
const memberId = '00000000-0000-4000-8000-000000000002';
const actingUserId = '00000000-0000-4000-8000-000000000003';
const managerRoleId = '00000000-0000-4000-8000-000000000011';
const pickerRoleId = '00000000-0000-4000-8000-000000000012';
const auditorRoleId = '00000000-0000-4000-8000-000000000013';

const access: AccessProjection = {
  warehouseId: '00000000-0000-4000-8000-000000000010',
  roleId: managerRoleId,
  roleKind: 'warehouse_manager',
  permissionIds: Object.values(PermissionId),
};
const roles: RolePage['items'] = [
  {
    id: managerRoleId,
    kind: 'warehouse_manager',
    name: 'Warehouse Manager',
    permissionIds: Object.values(PermissionId),
    assignedMemberCount: 1,
  },
  {
    id: pickerRoleId,
    kind: 'custom',
    name: 'Picker',
    permissionIds: [],
    assignedMemberCount: 1,
  },
  {
    id: auditorRoleId,
    kind: 'custom',
    name: 'Auditor',
    permissionIds: [PermissionId.ROLES_WATCH],
    assignedMemberCount: 0,
  },
];
const permissions: PermissionPage['items'] = [
  { id: PermissionId.ROLES_WATCH, kind: 'assignable', label: 'View roles' },
  {
    id: PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
    kind: 'reserved',
    label: 'Transfer Warehouse Manager',
  },
];
const members: MemberPage['items'] = [
  {
    userId: managerId,
    roleId: managerRoleId,
    roleKind: 'warehouse_manager',
    email: 'manager@example.test',
  },
  {
    userId: memberId,
    roleId: pickerRoleId,
    roleKind: 'custom',
    email: 'member@example.test',
  },
];

const authenticatedStore = (userId: string): AppStore => {
  const store = makeStore();
  store.dispatch(authBecameAuthenticated({ id: userId }));
  return store;
};

const renderAdministration = (
  overrides: Partial<Parameters<typeof AccessAdministration>[0]> = {},
  store: AppStore = authenticatedStore(actingUserId),
): Parameters<typeof AccessAdministration>[0] => {
  const props: Parameters<typeof AccessAdministration>[0] = {
    access,
    members,
    permissions,
    roles,
    onAssignRole: vi.fn().mockResolvedValue({ success: true }),
    onChangeMemberEmail: vi.fn().mockResolvedValue({ success: true }),
    onChangeMemberPassword: vi.fn().mockResolvedValue({ success: true }),
    onCreateMember: vi.fn().mockResolvedValue({ success: true }),
    onDeleteMember: vi.fn().mockResolvedValue({ success: true }),
    onDeleteRole: vi.fn().mockResolvedValue({ success: true }),
    onSaveRole: vi.fn().mockResolvedValue({ success: true }),
    onTransferManager: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
  renderWithProviders(<AccessAdministration {...props} />, store);
  return props;
};

// This suite deliberately keeps every Roles and Members workflow scenario
// together so each assertion exercises the same rendered administration tree.
// eslint-disable-next-line max-lines-per-function
describe('AccessAdministration', () => {
  it('creates an empty-grant role and explains why reserved permissions are disabled', async () => {
    const user = userEvent.setup();
    const props = renderAdministration();

    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const dialog = screen.getByRole('dialog', { name: 'Create role' });
    expect(
      within(dialog).getByLabelText('Transfer Warehouse Manager'),
    ).toBeDisabled();
    expect(
      within(dialog).getByText(
        'Reserved for the protected Warehouse Manager role.',
      ),
    ).toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText('Role name'),
      'Stock Counter',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }));

    expect(props.onSaveRole).toHaveBeenCalledWith(
      { name: 'Stock Counter', permissionIds: [] },
      undefined,
    );
  });

  it('omits the protected manager role from ordinary assignment choices', async () => {
    const user = userEvent.setup();
    renderAdministration();

    await user.click(
      screen.getByRole('button', { name: `Change role for ${memberId}` }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Assign member role' });
    expect(
      within(dialog).queryByRole('option', { name: 'Warehouse Manager' }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('option', { name: 'Auditor' }),
    ).toBeInTheDocument();
  });

  it('requires a replacement when deleting an assigned role and announces success', async () => {
    const user = userEvent.setup();
    const props = renderAdministration();

    await user.click(screen.getByRole('button', { name: 'Delete Picker' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Picker' });
    expect(within(dialog).getByLabelText('Replacement role')).toBeRequired();
    await user.selectOptions(
      within(dialog).getByLabelText('Replacement role'),
      auditorRoleId,
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Replace and delete' }),
    );

    expect(props.onDeleteRole).toHaveBeenCalledWith(
      pickerRoleId,
      auditorRoleId,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Picker was deleted and assigned members were moved to Auditor.',
    );
  });

  it('uses deletion-safe role metadata without member-read data', async () => {
    const user = userEvent.setup();
    renderAdministration({ members: [] });

    await user.click(screen.getByRole('button', { name: 'Delete Picker' }));

    expect(
      within(screen.getByRole('dialog')).getByLabelText('Replacement role'),
    ).toBeRequired();
  });

  it('keeps a failed workflow open and does not announce success', async () => {
    const user = userEvent.setup();
    renderAdministration({
      onSaveRole: vi.fn().mockResolvedValue({ success: false }),
    });

    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const dialog = screen.getByRole('dialog', { name: 'Create role' });
    await user.type(within(dialog).getByLabelText('Role name'), 'Operators');
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }));

    expect(screen.getByRole('dialog', { name: 'Create role' })).toBeVisible();
    expect(screen.getByRole('status', { hidden: true })).toBeEmptyDOMElement();
  });

  it.each([
    ['', 'Enter a role name.'],
    ['A'.repeat(101), 'Use 100 characters or fewer.'],
    ['Stock\u200BPicker', 'Remove control or formatting characters.'],
  ])('explains invalid role name %j inline', async (name, message) => {
    const user = userEvent.setup();
    const props = renderAdministration();

    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const input = within(screen.getByRole('dialog')).getByLabelText(
      'Role name',
    );
    if (name) {
      await user.type(input, name);
    }
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Save role',
      }),
    );

    expect(await screen.findByText(message)).toBeVisible();
    expect(props.onSaveRole).not.toHaveBeenCalled();
  });

  it('transfers management only to another member and names both affected members', async () => {
    const user = userEvent.setup();
    const props = renderAdministration();

    await user.click(screen.getByRole('button', { name: 'Transfer manager' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Transfer Warehouse Manager',
    });
    expect(
      within(dialog).queryByRole('option', { name: managerId }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('option', { name: memberId }),
    ).toBeInTheDocument();
    await user.selectOptions(
      within(dialog).getByLabelText('New manager'),
      memberId,
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Your replacement role'),
      auditorRoleId,
    );
    expect(
      within(dialog).getByText(`${managerId} will become Auditor.`),
    ).toBeVisible();
    expect(
      within(dialog).getByText(`${memberId} will become Warehouse Manager.`),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: 'Transfer management' }),
    );

    expect(props.onTransferManager).toHaveBeenCalledWith(
      memberId,
      auditorRoleId,
    );
  });

  it('removes mutation controls when refreshed capabilities no longer allow them', () => {
    renderAdministration({
      access: { ...access, permissionIds: [PermissionId.ROLES_WATCH] },
    });

    expect(
      screen.queryByRole('button', { name: 'Create role' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Transfer manager' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Change role for/u }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create member' }),
    ).not.toBeInTheDocument();
  });

  it('creates a member through the Create Member dialog when authorized (AC-01, AC-03)', async () => {
    const user = userEvent.setup();
    const props = renderAdministration({
      access: {
        ...access,
        permissionIds: [PermissionId.USERS_CREATE],
      },
    });

    await user.click(screen.getByRole('button', { name: 'Create member' }));
    const dialog = screen.getByRole('dialog', { name: 'Create member' });
    await user.type(
      within(dialog).getByLabelText('Email'),
      'new.member@example.test',
    );
    await user.type(
      within(dialog).getByLabelText('Initial password'),
      'a-strong-password',
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Role'),
      pickerRoleId,
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create member' }),
    );

    expect(props.onCreateMember).toHaveBeenCalledWith({
      email: 'new.member@example.test',
      password: 'a-strong-password',
      roleId: pickerRoleId,
    });
  });

  it('hides the Create Member trigger without the USERS:CREATE permission (AC-03)', () => {
    renderAdministration({
      access: { ...access, permissionIds: [PermissionId.ROLES_WATCH] },
    });

    expect(
      screen.queryByRole('button', { name: 'Create member' }),
    ).not.toBeInTheDocument();
  });

  it('changes a member email through the Edit Email dialog when authorized (AC-04)', async () => {
    const user = userEvent.setup();
    const props = renderAdministration();

    const row = screen.getByRole('listitem', { name: /member@example\.test/u });
    await user.click(
      within(row).getByRole('button', {
        name: 'Actions for member@example.test',
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Edit email' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Edit email for member@example.test',
    });
    await user.type(
      within(dialog).getByLabelText('New email'),
      'member.new@example.test',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save email' }),
    );

    expect(props.onChangeMemberEmail).toHaveBeenCalledWith(memberId, {
      email: 'member.new@example.test',
    });
  });

  it('returns focus to the kebab trigger once the Edit Email dialog is dismissed', async () => {
    const user = userEvent.setup();
    renderAdministration();

    const row = screen.getByRole('listitem', { name: /member@example\.test/u });
    const trigger = within(row).getByRole('button', {
      name: 'Actions for member@example.test',
    });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Edit email' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Edit email for member@example.test',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('hides the kebab trigger entirely when the actor holds no per-row action permission', () => {
    renderAdministration({
      access: { ...access, permissionIds: [PermissionId.USERS_WATCH] },
    });

    const row = screen.getByRole('listitem', { name: /member@example\.test/u });
    expect(
      within(row).queryByRole('button', {
        name: 'Actions for member@example.test',
      }),
    ).not.toBeInTheDocument();
  });

  it('resets a member password through the Reset Password dialog when authorized (AC-06)', async () => {
    const user = userEvent.setup();
    const props = renderAdministration();

    const row = screen.getByRole('listitem', { name: /member@example\.test/u });
    await user.click(
      within(row).getByRole('button', {
        name: 'Actions for member@example.test',
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Reset password' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Reset password for member@example.test',
    });
    await user.type(
      within(dialog).getByLabelText('New password'),
      'a-new-strong-password',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Reset password' }),
    );

    expect(props.onChangeMemberPassword).toHaveBeenCalledWith(memberId, {
      password: 'a-new-strong-password',
    });
  });

  it('deletes a member after confirmation through the delete dialog when authorized (AC-08)', async () => {
    const user = userEvent.setup();
    const props = renderAdministration();

    const row = screen.getByRole('listitem', { name: /member@example\.test/u });
    await user.click(
      within(row).getByRole('button', {
        name: 'Actions for member@example.test',
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete member' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Delete member@example.test',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete member' }),
    );

    expect(props.onDeleteMember).toHaveBeenCalledWith(memberId);
  });

  it('shows a Protected chip with no action controls for the Warehouse Manager row (AC-13/14)', () => {
    renderAdministration();

    const row = screen.getByRole('listitem', {
      name: /manager@example\.test/u,
    });
    expect(within(row).getByText('Protected')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('defers the member list to a loading skeleton until the actor id is known (AC-11/18)', () => {
    // An unauthenticated-looking store (no authBecameAuthenticated dispatch)
    // reproduces the auth store not having hydrated yet — self-row gating
    // must never fall back to treating every row as not-self while the
    // actor id is unresolved.
    renderAdministration({}, makeStore());

    expect(screen.getByLabelText('Loading members')).toBeInTheDocument();
    expect(
      screen.queryByRole('listitem', { name: /member@example\.test/u }),
    ).not.toBeInTheDocument();
  });

  it('hides destructive controls and shows a You chip on the actor’s own row (AC-11/18)', () => {
    renderAdministration({}, authenticatedStore(memberId));

    const row = screen.getByRole('listitem', { name: /member@example\.test/u });
    expect(within(row).getByText('You')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });
});
