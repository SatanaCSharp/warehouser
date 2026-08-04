import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { AccessAdministration } from 'modules/access/components/access-administration/AccessAdministration';
import { renderWithProviders } from 'test/render';

import type {
  AccessProjection,
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';

const managerId = '00000000-0000-4000-8000-000000000001';
const memberId = '00000000-0000-4000-8000-000000000002';
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
  },
  { id: pickerRoleId, kind: 'custom', name: 'Picker', permissionIds: [] },
  {
    id: auditorRoleId,
    kind: 'custom',
    name: 'Auditor',
    permissionIds: [PermissionId.ROLES_WATCH],
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
  { userId: managerId, roleId: managerRoleId, roleKind: 'warehouse_manager' },
  { userId: memberId, roleId: pickerRoleId, roleKind: 'custom' },
];

const renderAdministration = (
  overrides: Partial<Parameters<typeof AccessAdministration>[0]> = {},
): Parameters<typeof AccessAdministration>[0] => {
  const props: Parameters<typeof AccessAdministration>[0] = {
    access,
    members,
    permissions,
    roles,
    onAssignRole: vi.fn().mockResolvedValue(undefined),
    onDeleteRole: vi.fn().mockResolvedValue(undefined),
    onSaveRole: vi.fn().mockResolvedValue(undefined),
    onTransferManager: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  renderWithProviders(<AccessAdministration {...props} />);
  return props;
};

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
  });
});
