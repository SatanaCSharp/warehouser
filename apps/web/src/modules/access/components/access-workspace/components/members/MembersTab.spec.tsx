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
import { renderInEnteredWarehouse } from 'test/render';

import type { AppStore } from 'store';

const changeMemberEmail = vi.hoisted(() => vi.fn());
const changeMemberPassword = vi.hoisted(() => vi.fn());
const createMember = vi.hoisted(() => vi.fn());
const deleteMember = vi.hoisted(() => vi.fn());

// The components trigger the generated hooks directly, so the mutations are
// stubbed at the endpoint that declares them. Everything else in the slice —
// the reads this tab renders from — stays real and is served by
// `stubAccessServer`.
vi.mock('modules/access/api/access-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('modules/access/api/access-api')>()),
  useChangeMemberEmailMutation: () => [changeMemberEmail, {}],
  useChangeMemberPasswordMutation: () => [changeMemberPassword, {}],
  useCreateMemberMutation: () => [createMember, {}],
  useDeleteMemberMutation: () => [deleteMember, {}],
}));

const renderMembersTab = async (
  options: Parameters<typeof stubAccessServer>[0] = {},
  store: AppStore = authenticatedStore(),
): Promise<void> => {
  stubAccessServer(options);
  renderInEnteredWarehouse(<MembersTab />, store);
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
    createMember.mockResolvedValue({ data: null });
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
      warehouseId: accessIds.warehouse,
      input: {
        email: 'new.member@example.test',
        password: 'a-strong-password',
        roleId: accessIds.pickerRole,
      },
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
    changeMemberEmail.mockResolvedValue({ data: null });
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

    expect(changeMemberEmail).toHaveBeenCalledWith({
      warehouseId: accessIds.warehouse,
      userId: accessIds.member,
      input: { email: 'member.new@example.test' },
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
    changeMemberPassword.mockResolvedValue({ data: null });
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

    expect(changeMemberPassword).toHaveBeenCalledWith({
      warehouseId: accessIds.warehouse,
      userId: accessIds.member,
      input: { password: 'a-new-strong-password' },
    });
  });

  it('deletes a member after confirmation through the delete dialog when authorized (AC-08)', async () => {
    const user = userEvent.setup();
    deleteMember.mockResolvedValue({ data: null });
    await renderMembersTab();

    await openRowMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Delete member' }));
    // The confirmation validates nothing, so it is an `AlertDialog`
    // (`docs/system/guides/web-dialogs.md`) and announces itself as one.
    const dialog = screen.getByRole('alertdialog', {
      name: 'Delete member@example.test',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete member' }),
    );

    expect(deleteMember).toHaveBeenCalledWith({
      warehouseId: accessIds.warehouse,
      userId: accessIds.member,
    });
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
