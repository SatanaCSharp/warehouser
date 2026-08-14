import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceMembersTab } from 'modules/access/components/workspace-administration/members/WorkspaceMembersTab';
import { selectHeroOption } from 'test/hero-select';
import { renderWithProviders } from 'test/render';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  otherUserIds,
  stubWorkspaceServer,
  warehouseIds,
  workspaceIds,
  workspaceMembers,
  workspaceRoleIds,
  workspaceUsers,
} from 'test/workspace-fixtures';

import type {
  WorkspaceMember,
  WorkspaceUser,
} from '@warehouser/contracts/workspaces';

// `alertWorkspaceAction` drives the success/pending toast through this single
// seam (`web-error-handling.md` §2, §4) — mocking it here, as
// `WorkspaceRolesTab.spec.tsx` already does, lets a spec assert the toast copy
// without mounting HeroUI's `Toast.Provider` and queue.
const toast = vi.hoisted(() => {
  const fn = vi.fn(() => 'pending-key');
  return Object.assign(fn, {
    danger: vi.fn((_message: unknown, options?: { onClose?: () => void }) => {
      options?.onClose?.();
      return 'toast-key';
    }),
    success: vi.fn(() => 'toast-key'),
    close: vi.fn(),
  });
});

vi.mock('shared/alerts/toast', () => ({ toast }));

// The Workspace Role names a member row and every Role choice render come from
// the Workspace Roles read, which the server gates on `WORKSPACE_ROLES:WATCH`
// (`workspace.controller.ts` `@Get('roles')`). Every actor able to name a Role
// therefore holds both watch Permissions.
const watchOnly = [
  WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
  WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
];

const fullMemberAuthority = [
  ...watchOnly,
  WorkspacePermissionId.WORKSPACE_MEMBERS_ADD,
  WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE,
  WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
];

const ownerAuthority = [
  ...fullMemberAuthority,
  WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
];

const renderTab = (): void => {
  renderWithProviders(<WorkspaceMembersTab />, authenticatedWorkspaceStore());
};

/**
 * Lena is the Workspace's only non-Member User, but the shared fixture leaves
 * her in no Warehouse at all — the AC-20 shape. Placing her in Central DC turns
 * her into the one eligible add-candidate (AC-19) without touching the fixture
 * every other spec shares.
 */
const usersWithEligibleCandidate = (): WorkspaceUser[] =>
  workspaceUsers().map((user) =>
    user.userId === otherUserIds.lena
      ? { ...user, warehouses: [{ warehouseId: warehouseIds.central }] }
      : user,
  );

/**
 * HeroUI's `Select` always renders a visually hidden native `<select>` mirror
 * for form semantics alongside the interactive `ListBox`, so a plain
 * `getByRole('option', { hidden: true })` matches both nodes. Filtering out the
 * `OPTION` element narrows the assertion to the item a member can activate —
 * the technique `test/hero-select.ts` documents.
 */
const openOptions = (name: string | RegExp): HTMLElement[] =>
  screen
    .queryAllByRole('option', { name, hidden: true })
    .filter((candidate) => candidate.tagName !== 'OPTION');

const memberList = async (): Promise<HTMLElement> =>
  screen.findByRole('list', { name: 'Workspace members' });

const rowFor = async (email: string): Promise<HTMLElement> => {
  const row = within(await memberList())
    .getAllByRole('listitem')
    .find((entry) => entry.textContent?.includes(email));
  if (!row) {
    throw new Error(`No workspace member row found for ${email}`);
  }
  return row;
};

/**
 * The toast must name the outcome that committed in translated copy — a raw
 * i18next key such as `workspace.addWorkspaceMember` is exactly what
 * `adding-and-maintaining-web-localization.md` forbids reaching a user, so the
 * assertion rejects it rather than matching it by accident.
 */
const expectCommittedOutcome = (pattern: RegExp): void => {
  const lastCall = toast.success.mock.calls.at(-1) as unknown[] | undefined;
  const copy = String(lastCall?.[0]);
  expect(copy).not.toMatch(/^\w+\.\w+$/u);
  expect(copy).toMatch(pattern);
};

// eslint-disable-next-line max-lines-per-function
describe('WorkspaceMembersTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    toast.success.mockClear();
    toast.danger.mockClear();
  });

  describe('the Workspace member list (AC-33)', () => {
    it('lists every Workspace Member with the one Workspace Role they hold', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const entries = within(await memberList()).getAllByRole('listitem');
      expect(entries.map((entry) => entry.textContent)).toEqual([
        expect.stringContaining('yurii@example.test'),
        expect.stringContaining('anna.kravets@example.test'),
      ]);
      expect(entries[0]?.textContent).toContain('Workspace owner');
      expect(entries[1]?.textContent).toContain('Operations Lead');
    });

    it('requests neither the Workspace Members nor the Workspace Users read without WORKSPACE_MEMBERS:WATCH (AC-33)', async () => {
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WAREHOUSES_WATCH,
        ]),
      });

      renderTab();

      const requested = (path: string): boolean =>
        requestedUrls.some((url) => url.endsWith(path));
      await waitFor(() =>
        expect(requested('/api/v1/workspace/context')).toBe(true),
      );
      expect(requested('/api/v1/workspace/members')).toBe(false);
      expect(requested('/api/v1/workspace/users')).toBe(false);
    });

    it("never renders a person's Warehouse Role, only their Workspace Role (AC-31, AC-33)", async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const section = (await memberList()).closest('section');
      // `WORKSPACE_MEMBERS:WATCH` carries the Users and the Warehouses they
      // belong to — never the Roles they hold inside one
      // (design-handoff.md §The level boundary is part of the design).
      expect(section?.textContent).not.toMatch(/manager/iu);
      expect(section?.textContent).not.toContain('Picker');
      expect(section?.textContent).not.toContain('Site Supervisor');
      expect(section?.textContent).not.toContain(workspaceIds.warehouseRole);
    });
  });

  describe('the Workspace Owner row (AC-21a, AC-22)', () => {
    it('exposes Protected and offers only the transfer — never Change role, never Remove', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(ownerAuthority) });

      renderTab();

      const owner = await rowFor('yurii@example.test');
      expect(owner.textContent).toContain('Protected');
      expect(
        within(owner).getByRole('button', { name: 'Transfer ownership' }),
      ).toBeInTheDocument();
      expect(
        within(owner).queryByRole('button', { name: 'Change role' }),
      ).not.toBeInTheDocument();
      expect(
        within(owner).queryByRole('button', { name: 'Remove' }),
      ).not.toBeInTheDocument();

      // Every other Member keeps the ordinary pair, so the Owner row's absence
      // of them is the protection and not a missing capability.
      const anna = await rowFor('anna.kravets@example.test');
      expect(
        within(anna).getByRole('button', { name: 'Change role' }),
      ).toBeInTheDocument();
      expect(
        within(anna).getByRole('button', { name: 'Remove' }),
      ).toBeInTheDocument();
      expect(
        within(anna).queryByRole('button', { name: 'Transfer ownership' }),
      ).not.toBeInTheDocument();
    });

    it('offers no transfer control at all without the protected owner-transfer permission (AC-27, AC-30)', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
      });

      renderTab();

      await memberList();
      expect(
        screen.queryByRole('button', { name: 'Transfer ownership' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('adding a Workspace Member (AC-19, AC-20)', () => {
    const openAddDialog = async (
      user: ReturnType<typeof userEvent.setup>,
    ): Promise<HTMLElement> => {
      await user.click(
        await screen.findByRole('button', { name: 'Add workspace member' }),
      );
      return screen.findByRole('dialog', { name: /add a workspace member/iu });
    };

    it('offers the Workspace Users read as its candidates, excluding existing Members, and never the protected Owner Role', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
        users: usersWithEligibleCandidate(),
      });

      renderTab();
      const dialog = await openAddDialog(user);

      await user.click(
        within(dialog).getByRole('button', { name: /person/iu }),
      );
      expect(openOptions('lena.boiko@example.test')).toHaveLength(1);
      expect(openOptions('anna.kravets@example.test')).toHaveLength(0);
      expect(openOptions('yurii@example.test')).toHaveLength(0);

      await user.keyboard('{Escape}');
      await user.click(
        within(dialog).getByRole('button', { name: /workspace role/iu }),
      );
      expect(openOptions('Operations Lead')).toHaveLength(1);
      expect(openOptions('Auditor')).toHaveLength(1);
      // AC-22 — the protected Owner Role is never an ordinary choice.
      expect(openOptions('Workspace owner')).toHaveLength(0);
    });

    it('adds the candidate with the chosen custom Role, reports the committed outcome, and refreshes the affected views', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      const members = workspaceMembers();
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
        members,
        users: usersWithEligibleCandidate(),
        onAddWorkspaceMember: (body) => {
          submitted.push(body);
          members.push({
            userId: otherUserIds.lena,
            email: 'lena.boiko@example.test',
            workspaceRoleId: workspaceRoleIds.auditor,
            workspaceRoleKind: 'custom',
          });
          return undefined;
        },
      });

      renderTab();
      const dialog = await openAddDialog(user);

      await selectHeroOption(
        user,
        within(dialog).getByRole('button', { name: /person/iu }),
        'lena.boiko@example.test',
      );
      await selectHeroOption(
        user,
        within(dialog).getByRole('button', { name: /workspace role/iu }),
        'Auditor',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Add workspace member' }),
      );

      await waitFor(() =>
        expect(submitted).toEqual([
          {
            userId: otherUserIds.lena,
            workspaceRoleId: workspaceRoleIds.auditor,
          },
        ]),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );

      // The Members list and the Users list are both invalidated by the write,
      // so the new row arrives from a refetch rather than from local state —
      // wait for it rather than reading once, or the assertion races the
      // refetch whenever the suite is under load.
      await waitFor(async () =>
        expect(
          within(await rowFor('lena.boiko@example.test')).getByText('Auditor'),
        ).toBeInTheDocument(),
      );
      expect(
        requestedUrls.filter((url) => url.endsWith('/api/v1/workspace/users'))
          .length,
      ).toBeGreaterThan(1);
      expectCommittedOutcome(/member/iu);
    });

    it('never offers a User who belongs to no Warehouse of this Workspace, and says why (AC-20)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
      });

      renderTab();

      // Lena belongs to no Warehouse in the shared fixture, so she can never
      // be made a Workspace Member until she is given access to one.
      expect(
        await screen.findByText(
          /belongs to no warehouse of this workspace yet/iu,
        ),
      ).toBeInTheDocument();

      const dialog = await openAddDialog(user);
      await user.click(
        within(dialog).getByRole('button', { name: /person/iu }),
      );
      expect(openOptions('lena.boiko@example.test')).toHaveLength(0);
    });

    it('states that only people already in a Warehouse of this Workspace can be added', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
        users: usersWithEligibleCandidate(),
      });

      renderTab();

      expect(await openAddDialog(user)).toHaveTextContent(
        'Only people who already belong to a warehouse of this workspace can be made workspace members.',
      );
    });

    it('offers no add control at all without WORKSPACE_MEMBERS:ADD (AC-30)', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      await memberList();
      expect(
        screen.queryByRole('button', { name: 'Add workspace member' }),
      ).not.toBeInTheDocument();
    });
  });

  describe("changing a Workspace Member's Workspace Role (AC-19b)", () => {
    const openChangeRoleDialog = async (
      user: ReturnType<typeof userEvent.setup>,
    ): Promise<HTMLElement> => {
      await user.click(
        within(await rowFor('anna.kravets@example.test')).getByRole('button', {
          name: 'Change role',
        }),
      );
      return screen.findByRole('dialog', {
        name: /change the workspace role of/iu,
      });
    };

    it('moves the Member to another custom Role and reports the committed outcome', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      const members = workspaceMembers();
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
        members,
        onAssignWorkspaceRole: (body) => {
          submitted.push(body);
          const anna = members.find(
            (member) => member.userId === otherUserIds.anna,
          ) as WorkspaceMember;
          anna.workspaceRoleId = workspaceRoleIds.auditor;
          return undefined;
        },
      });

      renderTab();
      const dialog = await openChangeRoleDialog(user);

      expect(dialog).toHaveTextContent(
        'Every workspace member holds exactly one workspace role.',
      );
      await selectHeroOption(
        user,
        within(dialog).getByRole('button', { name: /workspace role/iu }),
        'Auditor',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Change role' }),
      );

      await waitFor(() =>
        expect(submitted).toEqual([
          { workspaceRoleId: workspaceRoleIds.auditor },
        ]),
      );
      expect(
        requestedUrls.some((url) =>
          url.endsWith(`/api/v1/workspace/members/${otherUserIds.anna}/role`),
        ),
      ).toBe(true);
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      // The row's Role label arrives from the invalidated Members refetch, so
      // wait for it rather than reading once (same race as the add case above).
      await waitFor(async () =>
        expect(
          within(await rowFor('anna.kravets@example.test')).getByText(
            'Auditor',
          ),
        ).toBeInTheDocument(),
      );
      expectCommittedOutcome(/role/iu);
    });

    it('never offers the protected Workspace owner Role as the target (AC-22)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
      });

      renderTab();
      const dialog = await openChangeRoleDialog(user);
      await user.click(
        within(dialog).getByRole('button', { name: /workspace role/iu }),
      );

      expect(openOptions('Auditor')).toHaveLength(1);
      expect(openOptions('Workspace owner')).toHaveLength(0);
    });

    it('offers no change-role control at all without WORKSPACE_ROLES:ASSIGN (AC-30)', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext([
          ...watchOnly,
          WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE,
        ]),
      });

      renderTab();

      expect(
        within(await rowFor('anna.kravets@example.test')).queryByRole(
          'button',
          {
            name: 'Change role',
          },
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe('removing a Workspace Member (AC-19a)', () => {
    it('states that every Warehouse membership is preserved, removes the Member and reports the outcome', async () => {
      const user = userEvent.setup();
      const removed: unknown[] = [];
      const members = workspaceMembers();
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
        members,
        onRemoveWorkspaceMember: () => {
          removed.push(true);
          members.splice(
            members.findIndex((member) => member.userId === otherUserIds.anna),
            1,
          );
          return undefined;
        },
      });

      renderTab();
      await user.click(
        within(await rowFor('anna.kravets@example.test')).getByRole('button', {
          name: 'Remove',
        }),
      );

      const dialog = await screen.findByRole('dialog', {
        name: /remove .* from the workspace/iu,
      });
      expect(dialog).toHaveTextContent(
        'They keep the warehouses they belong to and stop administering this workspace.',
      );

      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      await waitFor(() => expect(removed).toEqual([true]));
      expect(
        requestedUrls.some((url) =>
          url.endsWith(`/api/v1/workspace/members/${otherUserIds.anna}`),
        ),
      ).toBe(true);
      await waitFor(() =>
        expect(
          within(
            screen.getByRole('list', { name: 'Workspace members' }),
          ).queryByText('anna.kravets@example.test'),
        ).not.toBeInTheDocument(),
      );
      expectCommittedOutcome(/member/iu);
    });

    it('offers no remove control at all without WORKSPACE_MEMBERS:REMOVE (AC-30)', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext([
          ...watchOnly,
          WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
        ]),
      });

      renderTab();

      expect(
        within(await rowFor('anna.kravets@example.test')).queryByRole(
          'button',
          {
            name: 'Remove',
          },
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe('transferring Workspace ownership (AC-26, AC-26a)', () => {
    const openTransferDialog = async (
      user: ReturnType<typeof userEvent.setup>,
    ): Promise<HTMLElement> => {
      await user.click(
        within(await rowFor('yurii@example.test')).getByRole('button', {
          name: 'Transfer ownership',
        }),
      );
      return screen.findByRole('dialog', {
        name: /transfer workspace ownership/iu,
      });
    };

    it('states the atomic outcome and moves ownership together with the outgoing Owner’s new custom Role', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext(ownerAuthority),
        onTransferWorkspaceOwner: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      const dialog = await openTransferDialog(user);

      expect(dialog).toHaveTextContent(
        'Ownership moves in one step. The workspace always has exactly one owner.',
      );
      expect(dialog).toHaveTextContent(
        'You must end the transfer holding exactly one workspace role.',
      );

      await selectHeroOption(
        user,
        within(dialog).getByRole('button', { name: /new owner/iu }),
        'anna.kravets@example.test',
      );
      await selectHeroOption(
        user,
        within(dialog).getByRole('button', {
          name: /your new workspace role/iu,
        }),
        'Operations Lead',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Transfer ownership' }),
      );

      await waitFor(() =>
        expect(submitted).toEqual([
          {
            recipientUserId: otherUserIds.anna,
            formerOwnerWorkspaceRoleId: workspaceRoleIds.operations,
          },
        ]),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      // The acting member's own capabilities changed, so the actor context is
      // refreshed by tag alongside the Members list.
      expect(
        requestedUrls.filter((url) => url.includes('/api/v1/workspace/context'))
          .length,
      ).toBeGreaterThan(1);
      expectCommittedOutcome(/ownership/iu);
    });

    it('requests no transfer until a custom Workspace Role for the outgoing Owner is chosen (AC-26)', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(ownerAuthority),
        onTransferWorkspaceOwner: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      const dialog = await openTransferDialog(user);

      await selectHeroOption(
        user,
        within(dialog).getByRole('button', { name: /new owner/iu }),
        'anna.kravets@example.test',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Transfer ownership' }),
      );

      expect(submitted).toEqual([]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('never offers the acting Owner as recipient nor the protected Owner Role as the outgoing Role (AC-22, AC-28)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(ownerAuthority) });

      renderTab();
      const dialog = await openTransferDialog(user);

      await user.click(
        within(dialog).getByRole('button', { name: /new owner/iu }),
      );
      expect(openOptions('anna.kravets@example.test')).toHaveLength(1);
      expect(openOptions('yurii@example.test')).toHaveLength(0);
      // Lena is no Workspace Member, so she can never receive ownership.
      expect(openOptions('lena.boiko@example.test')).toHaveLength(0);

      await user.keyboard('{Escape}');
      await user.click(
        within(dialog).getByRole('button', {
          name: /your new workspace role/iu,
        }),
      );
      expect(openOptions('Operations Lead')).toHaveLength(1);
      expect(openOptions('Workspace owner')).toHaveLength(0);
    });

    it('surfaces the refusal to transfer before a custom Workspace Role exists, changing nothing (AC-26a)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(ownerAuthority),
        // AC-17c and AC-26a share `workspace.replacement_role_required`
        // (`workspaces/domain/errors/workspace.errors.ts`): the outgoing Owner
        // has no custom Workspace Role to receive.
        onTransferWorkspaceOwner: () => ({
          body: {
            code: 'workspace.replacement_role_required',
            message: 'Select a different custom replacement Workspace Role.',
          },
          status: 400,
        }),
      });

      renderTab();
      const dialog = await openTransferDialog(user);

      await selectHeroOption(
        user,
        within(dialog).getByRole('button', { name: /new owner/iu }),
        'anna.kravets@example.test',
      );
      await selectHeroOption(
        user,
        within(dialog).getByRole('button', {
          name: /your new workspace role/iu,
        }),
        'Operations Lead',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Transfer ownership' }),
      );

      // The refusal is explained where the choice was made, in translated copy
      // naming what must be created first — never a raw code or key.
      const refusal = await within(dialog).findByRole('alert');
      expect(refusal.textContent).toMatch(/custom workspace role/iu);
      expect(refusal.textContent).toMatch(/creat/iu);
      expect(refusal.textContent).not.toMatch(/replacement_role_required/u);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(toast.success).not.toHaveBeenCalled();

      // The refused transfer changed nothing: the acting member still holds
      // the protected Owner Role. Asserted once the dialog is dismissed,
      // because React Aria's `ariaHideOutside` takes the whole background out
      // of the accessibility tree while a modal is open, so the list behind it
      // is unreachable by role until then.
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect((await rowFor('yurii@example.test')).textContent).toContain(
        'Workspace owner',
      );
    });
  });

  describe('losing Workspace authority mid-session (OD62T)', () => {
    it('explains the refusal safely, refreshes the capability state and discloses nothing about the target', async () => {
      const user = userEvent.setup();
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
        onRemoveWorkspaceMember: () => ({
          body: {
            code: 'workspace.denied',
            message: 'Access is not permitted.',
          },
          status: 403,
        }),
      });

      renderTab();
      await user.click(
        within(await rowFor('anna.kravets@example.test')).getByRole('button', {
          name: 'Remove',
        }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: /remove .* from the workspace/iu,
      });
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      expect(
        await screen.findByText('Your workspace authority changed'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Your workspace role changed while this page was open. The controls you may still use have been refreshed.',
        ),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          requestedUrls.filter((url) =>
            url.includes('/api/v1/workspace/context'),
          ).length,
        ).toBeGreaterThan(1),
      );
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('exposes the members as a labelled list and labels every control in the add dialog', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
        users: usersWithEligibleCandidate(),
      });

      renderTab();

      expect(within(await memberList()).getAllByRole('listitem')).toHaveLength(
        2,
      );

      await user.click(
        screen.getByRole('button', { name: 'Add workspace member' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: /add a workspace member/iu,
      });
      expect(
        within(dialog).getByRole('button', { name: /person/iu }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: /workspace role/iu }),
      ).toBeInTheDocument();
    });

    it('traps focus in the remove dialog, keeps Cancel before the destructive primary and restores focus on Escape', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullMemberAuthority),
      });

      renderTab();
      const trigger = within(
        await rowFor('anna.kravets@example.test'),
      ).getByRole('button', { name: 'Remove' });
      await user.click(trigger);

      const dialog = await screen.findByRole('dialog', {
        name: /remove .* from the workspace/iu,
      });
      expect(dialog.contains(document.activeElement)).toBe(true);

      const buttons = within(dialog).getAllByRole('button');
      const cancelIndex = buttons.findIndex(
        (button) => button.textContent === 'Cancel',
      );
      const removeIndex = buttons.findIndex(
        (button) => button.textContent === 'Remove',
      );
      expect(cancelIndex).toBeLessThan(removeIndex);

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(trigger).toHaveFocus();
    });
  });
});
