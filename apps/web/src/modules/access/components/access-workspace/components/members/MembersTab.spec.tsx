import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MembersTab } from 'modules/access/components/access-workspace/components/members/MembersTab';
import { makeStore } from 'store';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { selectHeroOption } from 'test/hero-select';
import { renderWithProviders } from 'test/render';

import type { AppStore } from 'store';

const changeMemberEmail = vi.hoisted(() => vi.fn());
const changeMemberPassword = vi.hoisted(() => vi.fn());
const createMember = vi.hoisted(() => vi.fn());
const deleteMember = vi.hoisted(() => vi.fn());

vi.mock('modules/access/hooks/useChangeMemberEmail', () => ({
  useChangeMemberEmail: () => changeMemberEmail,
}));
vi.mock('modules/access/hooks/useChangeMemberPassword', () => ({
  useChangeMemberPassword: () => changeMemberPassword,
}));
vi.mock('modules/access/hooks/useCreateMember', () => ({
  useCreateMember: () => createMember,
}));
vi.mock('modules/access/hooks/useDeleteMember', () => ({
  useDeleteMember: () => deleteMember,
}));

const renderMembersTab = async (
  options: Parameters<typeof stubAccessServer>[0] = {},
  store: AppStore = authenticatedStore(),
): Promise<void> => {
  stubAccessServer(options);
  renderWithProviders(<MembersTab />, store);
  await screen.findByLabelText('Search members');
};

const openRowMenu = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> => {
  const row = await screen.findByRole('listitem', {
    name: /member@example\.test/u,
  });
  const trigger = within(row).getByRole('button', {
    name: 'Actions for member@example.test',
  });
  await user.click(trigger);
  return trigger;
};

// This suite keeps every Members workflow together so each assertion exercises
// the same rendered tab.
describe('MembersTab', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a member through the Create Member dialog when authorized (AC-01, AC-03)', async () => {
    const user = userEvent.setup();
    createMember.mockResolvedValue({ success: true });
    await renderMembersTab({
      permissionIds: [PermissionId.USERS_WATCH, PermissionId.USERS_CREATE],
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
    await selectHeroOption(
      user,
      within(dialog).getByRole('button', { name: /Role/u }),
      'Picker',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create member' }),
    );

    expect(createMember).toHaveBeenCalledWith({
      email: 'new.member@example.test',
      password: 'a-strong-password',
      roleId: accessIds.pickerRole,
    });
  });

  it('hides the Create Member trigger without the USERS:CREATE permission (AC-03)', async () => {
    await renderMembersTab({ permissionIds: [PermissionId.USERS_WATCH] });

    expect(
      screen.queryByRole('button', { name: 'Create member' }),
    ).not.toBeInTheDocument();
  });

  it('changes a member email through the Edit Email dialog when authorized (AC-04)', async () => {
    const user = userEvent.setup();
    changeMemberEmail.mockResolvedValue({ success: true });
    await renderMembersTab();

    await openRowMenu(user);
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

    expect(changeMemberEmail).toHaveBeenCalledWith(accessIds.member, {
      email: 'member.new@example.test',
    });
  });

  it('returns focus to the kebab trigger once the Edit Email dialog is dismissed', async () => {
    const user = userEvent.setup();
    await renderMembersTab();

    const trigger = await openRowMenu(user);
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

  it('resets a member password through the Reset Password dialog when authorized (AC-06)', async () => {
    const user = userEvent.setup();
    changeMemberPassword.mockResolvedValue({ success: true });
    await renderMembersTab();

    await openRowMenu(user);
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

    expect(changeMemberPassword).toHaveBeenCalledWith(accessIds.member, {
      password: 'a-new-strong-password',
    });
  });

  it('deletes a member after confirmation through the delete dialog when authorized (AC-08)', async () => {
    const user = userEvent.setup();
    deleteMember.mockResolvedValue({ success: true });
    await renderMembersTab();

    await openRowMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Delete member' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Delete member@example.test',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete member' }),
    );

    expect(deleteMember).toHaveBeenCalledWith(accessIds.member);
  });

  it('hides the kebab trigger entirely when the actor holds no per-row action permission', async () => {
    await renderMembersTab({ permissionIds: [PermissionId.USERS_WATCH] });

    const row = screen.getByRole('listitem', { name: /member@example\.test/u });
    expect(
      within(row).queryByRole('button', {
        name: 'Actions for member@example.test',
      }),
    ).not.toBeInTheDocument();
  });

  it('defers the member list to a loading skeleton until the actor id is known (AC-11/18)', async () => {
    // An unauthenticated-looking store (no authBecameAuthenticated dispatch)
    // reproduces the auth store not having hydrated yet — self-row gating must
    // never fall back to treating every row as not-self while the actor id is
    // unresolved.
    await renderMembersTab({}, makeStore());

    expect(screen.getByLabelText('Loading members')).toBeInTheDocument();
    expect(
      screen.queryByRole('listitem', { name: /member@example\.test/u }),
    ).not.toBeInTheDocument();
  });

  it('hides destructive controls and shows a You chip on the actor’s own row (AC-11/18)', async () => {
    await renderMembersTab({}, authenticatedStore(accessIds.member));

    const row = screen.getByRole('listitem', { name: /member@example\.test/u });
    expect(within(row).getByText('You')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });
});
