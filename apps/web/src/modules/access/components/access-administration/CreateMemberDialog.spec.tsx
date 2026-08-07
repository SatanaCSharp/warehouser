import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateMemberDialog } from 'modules/access/components/access-administration/CreateMemberDialog';
import { renderWithProviders } from 'test/render';

import type { RolePage } from '@warehouser/contracts/access';
import type { CreateMemberInput } from '@warehouser/contracts/users';
import type { MutationOutcome } from 'modules/access/types/access-administration.types';

const pickerRoleId = '00000000-0000-4000-8000-000000000012';
const auditorRoleId = '00000000-0000-4000-8000-000000000013';
const managerRoleId = '00000000-0000-4000-8000-000000000011';

const roles: RolePage['items'] = [
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
    permissionIds: [],
    assignedMemberCount: 0,
  },
];

const rolesWithManager: RolePage['items'] = [
  ...roles,
  {
    id: managerRoleId,
    kind: 'warehouse_manager',
    name: 'Warehouse Manager',
    permissionIds: [],
    assignedMemberCount: 1,
  },
];

const renderDialog = (
  overrides: Partial<Parameters<typeof CreateMemberDialog>[0]> = {},
): {
  onClose: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
} => {
  const onClose = vi.fn();
  const onSave = vi
    .fn<(input: CreateMemberInput) => Promise<MutationOutcome>>()
    .mockResolvedValue({ success: true });
  renderWithProviders(
    <CreateMemberDialog
      roles={roles}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onClose, onSave };
};

const fillAndSubmit = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  {
    email,
    password,
    roleId,
  }: { email: string; password: string; roleId: string },
): Promise<void> => {
  if (email) {
    await user.type(within(dialog).getByLabelText('Email'), email);
  }
  if (password) {
    await user.type(
      within(dialog).getByLabelText('Initial password'),
      password,
    );
  }
  if (roleId) {
    await user.selectOptions(within(dialog).getByLabelText('Role'), roleId);
  }
  await user.click(
    within(dialog).getByRole('button', { name: 'Create member' }),
  );
};

describe('CreateMemberDialog', () => {
  it('creates a member with the selected role and closes on success (AC-01)', async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Create member' });
    await fillAndSubmit(user, dialog, {
      email: 'new.member@example.test',
      password: 'a-strong-password',
      roleId: pickerRoleId,
    });

    expect(onSave).toHaveBeenCalledWith({
      email: 'new.member@example.test',
      password: 'a-strong-password',
      roleId: pickerRoleId,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('explains invalid email and password inline and blocks submission (AC-02)', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Create member' });
    await fillAndSubmit(user, dialog, {
      email: 'not-an-email',
      password: 'short',
      roleId: pickerRoleId,
    });

    expect(
      await within(dialog).findByText('Enter a valid email address.'),
    ).toBeVisible();
    expect(within(dialog).getByText('Use 8 to 128 characters.')).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders the duplicate-email explanation reported by the server (AC-05)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi
      .fn<(input: CreateMemberInput) => Promise<MutationOutcome>>()
      .mockResolvedValue({
        success: false,
        fieldErrors: { email: 'duplicate' },
      });
    renderDialog({ onClose, onSave });

    const dialog = screen.getByRole('dialog', { name: 'Create member' });
    await fillAndSubmit(user, dialog, {
      email: 'taken@example.test',
      password: 'a-strong-password',
      roleId: pickerRoleId,
    });

    expect(
      await within(dialog).findByText('This email is already registered.'),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders the permission-exceeded explanation when the role exceeds the actor's own permissions (AC-16)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi
      .fn<(input: CreateMemberInput) => Promise<MutationOutcome>>()
      .mockResolvedValue({
        success: false,
        fieldErrors: { roleId: 'exceeded' },
      });
    renderDialog({ onClose, onSave });

    const dialog = screen.getByRole('dialog', { name: 'Create member' });
    await fillAndSubmit(user, dialog, {
      email: 'new.member@example.test',
      password: 'a-strong-password',
      roleId: auditorRoleId,
    });

    expect(
      await within(dialog).findByText(
        "A new member's role can never exceed your own permissions.",
      ),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('never lists the reserved Warehouse Manager role as a selectable option (AC-20)', () => {
    renderDialog({ roles: rolesWithManager });

    const dialog = screen.getByRole('dialog', { name: 'Create member' });
    expect(
      within(dialog).queryByRole('option', { name: 'Warehouse Manager' }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('option', { name: 'Picker' }),
    ).toBeInTheDocument();
  });
});
