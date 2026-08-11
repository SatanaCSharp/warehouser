import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RolesTab } from 'modules/access/components/access-workspace/components/roles/RolesTab';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { selectHeroOption } from 'test/hero-select';
import { renderWithProviders } from 'test/render';

const assignMemberRole = vi.hoisted(() => vi.fn());
const deleteRole = vi.hoisted(() => vi.fn());
const saveRole = vi.hoisted(() => vi.fn());
const transferManager = vi.hoisted(() => vi.fn());

vi.mock('modules/access/hooks/useAssignMemberRole', () => ({
  useAssignMemberRole: () => assignMemberRole,
}));
vi.mock('modules/access/hooks/useDeleteRole', () => ({
  useDeleteRole: () => deleteRole,
}));
vi.mock('modules/access/hooks/useSaveRole', () => ({
  useSaveRole: () => saveRole,
}));
vi.mock('modules/access/hooks/useTransferManager', () => ({
  useTransferManager: () => transferManager,
}));

/**
 * HeroUI v3 renders a Select's required state on the field root
 * (`data-required`), not on the trigger button and not on the hidden native
 * `<select>` it keeps inside an `aria-hidden` container — so the requirement
 * is asserted from the trigger's owning field.
 */
const requiredSelectFieldFor = (
  scope: HTMLElement,
  label: RegExp,
): Element | null =>
  within(scope)
    .getByRole('button', { name: label })
    .closest('[data-slot="select"]');

const renderRolesTab = async (
  options: Parameters<typeof stubAccessServer>[0] = {},
): Promise<void> => {
  stubAccessServer(options);
  renderWithProviders(<RolesTab />, authenticatedStore());
  await screen.findByLabelText('Search roles');
};

// This suite keeps every Roles workflow together so each assertion exercises
// the same rendered tab.
describe('RolesTab', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates an empty-grant role and explains why reserved permissions are disabled', async () => {
    const user = userEvent.setup();
    saveRole.mockResolvedValue({ success: true });
    await renderRolesTab();

    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const dialog = screen.getByRole('dialog', { name: 'Create role' });
    expect(
      within(dialog).getByLabelText('Transfer warehouse management'),
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

    expect(saveRole).toHaveBeenCalledWith({
      name: 'Stock Counter',
      permissionIds: [],
    });
  });

  it('keeps a failed workflow open instead of reporting success', async () => {
    const user = userEvent.setup();
    saveRole.mockResolvedValue({ success: false });
    await renderRolesTab();

    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const dialog = screen.getByRole('dialog', { name: 'Create role' });
    await user.type(within(dialog).getByLabelText('Role name'), 'Operators');
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }));

    expect(screen.getByRole('dialog', { name: 'Create role' })).toBeVisible();
  });

  it.each([
    ['', 'Enter a role name.'],
    ['A'.repeat(101), 'Use 100 characters or fewer.'],
    ['Stock​Picker', 'Remove control or formatting characters.'],
  ])('explains invalid role name %j inline', async (name, message) => {
    const user = userEvent.setup();
    await renderRolesTab();

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
    expect(saveRole).not.toHaveBeenCalled();
  });

  it('omits the protected manager role from ordinary assignment choices', async () => {
    const user = userEvent.setup();
    await renderRolesTab();

    await user.click(
      await screen.findByRole('button', {
        name: `Change role for ${accessIds.member}`,
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Assign member role' });
    expect(
      within(dialog).queryByRole('option', {
        name: 'Warehouse Manager',
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('option', { name: 'Auditor', hidden: true }),
    ).toBeInTheDocument();
  });

  it('requires a replacement when deleting an assigned role and closes on success', async () => {
    const user = userEvent.setup();
    deleteRole.mockResolvedValue({ success: true });
    await renderRolesTab();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Picker' });
    expect(requiredSelectFieldFor(dialog, /Replacement role/u)).toHaveAttribute(
      'data-required',
      'true',
    );
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /Replacement role/u }),
      'Auditor',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Replace and delete' }),
    );

    expect(deleteRole).toHaveBeenCalledWith(
      accessIds.pickerRole,
      accessIds.auditorRole,
    );
    // Success is reported by the mutation's toast, so all the surface owes the
    // actor here is a dismissed dialog.
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('uses deletion-safe role metadata without member-read data', async () => {
    const user = userEvent.setup();
    await renderRolesTab({ members: [] });

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      requiredSelectFieldFor(screen.getByRole('dialog'), /Replacement role/u),
    ).toHaveAttribute('data-required', 'true');
  });

  it('transfers management only to another member and names both affected members', async () => {
    const user = userEvent.setup();
    transferManager.mockResolvedValue({ success: true });
    await renderRolesTab();

    await user.click(screen.getByRole('button', { name: 'Transfer manager' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Transfer Warehouse Manager',
    });
    expect(
      within(dialog).queryByRole('option', {
        name: accessIds.manager,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('option', {
        name: accessIds.member,
        hidden: true,
      }),
    ).toBeInTheDocument();
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /New manager/u }),
      accessIds.member,
    );
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /Your replacement role/u }),
      'Auditor',
    );
    expect(
      within(dialog).getByText(`${accessIds.manager} will become Auditor.`),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        `${accessIds.member} will become Warehouse Manager.`,
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: 'Transfer management' }),
    );

    expect(transferManager).toHaveBeenCalledWith(
      accessIds.member,
      accessIds.auditorRole,
    );
  });

  it('removes mutation controls when refreshed capabilities no longer allow them', async () => {
    stubAccessServer({ permissionIds: [PermissionId.ROLES_WATCH] });
    renderWithProviders(<RolesTab />, authenticatedStore());

    expect(await screen.findByText('Picker')).toBeInTheDocument();
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
