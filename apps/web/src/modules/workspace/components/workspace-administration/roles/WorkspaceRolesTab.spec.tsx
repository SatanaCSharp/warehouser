import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceRolesTab } from 'modules/workspace/components/workspace-administration/roles/WorkspaceRolesTab';
import { selectHeroOption } from 'test/hero-select';
import { renderWithProviders } from 'test/render';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
  workspaceRoleIds,
  workspaceRoles,
} from 'test/workspace-fixtures';

// `alertWorkspaceAction` drives the success/pending toast through this single
// seam (`web-error-handling.md` §2, §4) — mocking it here, as
// `WarehousesTab.spec.tsx` already does, lets a spec assert the toast copy
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

const watchOnly = [WorkspacePermissionId.WORKSPACE_ROLES_WATCH];

const fullRoleAuthority = [
  ...watchOnly,
  WorkspacePermissionId.WORKSPACE_ROLES_CREATE,
  WorkspacePermissionId.WORKSPACE_ROLES_UPDATE,
  WorkspacePermissionId.WORKSPACE_ROLES_DELETE,
  WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
];

const renderTab = (): void => {
  renderWithProviders(<WorkspaceRolesTab />, authenticatedWorkspaceStore());
};

const selectRole = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> => {
  await user.click(
    await screen.findByRole('button', { name: new RegExp(name, 'iu') }),
  );
};

const editor = async (): Promise<HTMLElement> =>
  screen.findByRole('form', { name: /workspace role/iu });

// eslint-disable-next-line max-lines-per-function
describe('WorkspaceRolesTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    toast.success.mockClear();
    toast.danger.mockClear();
  });

  describe('the Workspace Role list (AC-32)', () => {
    it('lists every Workspace Role with how many members hold it and how many permissions it grants', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const list = await screen.findByRole('list', { name: 'Workspace roles' });
      const entries = within(list).getAllByRole('listitem');
      expect(entries.map((entry) => entry.textContent)).toEqual([
        expect.stringContaining('Workspace owner'),
        expect.stringContaining('Operations Lead'),
        expect.stringContaining('Auditor'),
      ]);
      expect(entries[1]?.textContent).toContain('1 members');
      expect(entries[1]?.textContent).toContain('2 permissions');
    });

    it('marks the protected Workspace owner role with a chip rather than colour alone', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const list = await screen.findByRole('list', { name: 'Workspace roles' });
      const owner = within(list)
        .getAllByRole('listitem')
        .find((entry) => entry.textContent?.includes('Workspace owner'));
      expect(owner?.textContent).toContain('Protected');
    });

    it('requests neither the Workspace Roles nor the Permission catalogue without WORKSPACE_ROLES:WATCH (AC-32)', async () => {
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
      expect(requested('/api/v1/workspace/roles')).toBe(false);
      expect(requested('/api/v1/workspace/permissions')).toBe(false);
    });
  });

  describe('the protected Workspace owner role (AC-16)', () => {
    it('offers no rename, no delete and no permission control, and states why rather than hiding the controls silently', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
      });

      renderTab();
      await selectRole(user, 'Workspace owner');

      const pane = await editor();
      expect(
        within(pane).queryByRole('textbox', { name: /workspace role name/iu }),
      ).not.toBeInTheDocument();
      expect(
        within(pane).queryByRole('button', { name: 'Delete role' }),
      ).not.toBeInTheDocument();
      expect(
        within(pane).queryByRole('button', { name: 'Save changes' }),
      ).not.toBeInTheDocument();
      within(pane)
        .getAllByRole('checkbox')
        .forEach((checkbox) => expect(checkbox).toBeDisabled());
      expect(pane.textContent).toMatch(/system-managed/iu);
    });
  });

  describe('creating a custom Workspace Role (AC-14, AC-18)', () => {
    const openCreateDialog = async (
      user: ReturnType<typeof userEvent.setup>,
    ): Promise<HTMLElement> => {
      await user.click(
        await screen.findByRole('button', { name: 'Create workspace role' }),
      );
      return screen.findByRole('dialog', { name: /create a workspace role/iu });
    };

    it('creates a Workspace Role that grants no permission at all', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
        onCreateWorkspaceRole: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      const dialog = await openCreateDialog(user);

      await user.type(
        within(dialog).getByRole('textbox', { name: /workspace role name/iu }),
        'Warehouse Planner',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Create role' }),
      );

      await waitFor(() =>
        expect(submitted).toEqual([
          { name: 'Warehouse Planner', workspacePermissionIds: [] },
        ]),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(toast.success).toHaveBeenCalled();
    });

    it('creates a Workspace Role granting several assignable permissions', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
        onCreateWorkspaceRole: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      const dialog = await openCreateDialog(user);

      await user.type(
        within(dialog).getByRole('textbox', { name: /workspace role name/iu }),
        'Warehouse Planner',
      );
      await user.click(
        within(dialog).getByRole('checkbox', { name: 'View warehouses' }),
      );
      await user.click(
        within(dialog).getByRole('checkbox', { name: 'Create warehouses' }),
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Create role' }),
      );

      await waitFor(() =>
        expect(submitted).toEqual([
          {
            name: 'Warehouse Planner',
            workspacePermissionIds: [
              WorkspacePermissionId.WAREHOUSES_WATCH,
              WorkspacePermissionId.WAREHOUSES_CREATE,
            ],
          },
        ]),
      );
    });

    it('renders the reserved permission disabled with its reason, so it can never be submitted (AC-18)', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
        onCreateWorkspaceRole: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      const dialog = await openCreateDialog(user);

      const reserved = within(dialog).getByRole('checkbox', {
        name: 'Transfer workspace ownership',
      });
      expect(reserved).toBeDisabled();
      const reservedRow = reserved.closest('li');
      expect(reservedRow?.textContent).toContain('Owner only');
      expect(reservedRow?.textContent).toMatch(/reserved/iu);

      await user.click(reserved);
      await user.type(
        within(dialog).getByRole('textbox', { name: /workspace role name/iu }),
        'Warehouse Planner',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Create role' }),
      );

      await waitFor(() =>
        expect(submitted).toEqual([
          { name: 'Warehouse Planner', workspacePermissionIds: [] },
        ]),
      );
    });

    it('binds an exact-name conflict to the name field, stating that differently cased names are distinct (AC-15)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
        onCreateWorkspaceRole: () => ({
          body: {
            code: 'workspace.role_name_conflict',
            message: 'Workspace Role names must be unique in the Workspace.',
          },
          status: 409,
        }),
      });

      renderTab();
      const dialog = await openCreateDialog(user);

      await user.type(
        within(dialog).getByRole('textbox', { name: /workspace role name/iu }),
        'Auditor',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Create role' }),
      );

      expect(
        await screen.findByText(
          'A workspace role already uses this exact name. Differently cased names are distinct.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('offers no create control at all without WORKSPACE_ROLES:CREATE (AC-30)', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      await editor();
      expect(
        screen.queryByRole('button', { name: 'Create workspace role' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('updating a custom Workspace Role (AC-14a)', () => {
    it('renames the Role and empties its permission set in one save', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
        onUpdateWorkspaceRole: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      await selectRole(user, 'Operations Lead');

      const pane = await editor();
      const name = within(pane).getByRole('textbox', {
        name: /workspace role name/iu,
      });
      await user.clear(name);
      await user.type(name, 'Operations Manager');
      await user.click(
        within(pane).getByRole('checkbox', { name: 'View warehouses' }),
      );
      await user.click(
        within(pane).getByRole('checkbox', { name: 'Create warehouses' }),
      );
      await user.click(
        within(pane).getByRole('button', { name: 'Save changes' }),
      );

      await waitFor(() =>
        expect(submitted).toEqual([
          { name: 'Operations Manager', workspacePermissionIds: [] },
        ]),
      );
      expect(toast.success).toHaveBeenCalled();
    });

    it('offers no editable name and no save control without WORKSPACE_ROLES:UPDATE (AC-30)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();
      await selectRole(user, 'Operations Lead');

      const pane = await editor();
      expect(
        within(pane).queryByRole('textbox', { name: /workspace role name/iu }),
      ).not.toBeInTheDocument();
      expect(
        within(pane).queryByRole('button', { name: 'Save changes' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('deleting a custom Workspace Role (AC-17, AC-17a)', () => {
    it('prompts for the replacement of an assigned Role, stating what moves and what is preserved', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
        onDeleteWorkspaceRole: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      await selectRole(user, 'Operations Lead');
      await user.click(
        within(await editor()).getByRole('button', { name: 'Delete role' }),
      );

      const dialog = await screen.findByRole('dialog', {
        name: /delete operations lead/iu,
      });
      expect(dialog).toHaveTextContent(
        '1 workspace members hold this role. Every one of them moves to the replacement in the same step.',
      );
      expect(dialog).toHaveTextContent(/needs both permissions/iu);

      await selectHeroOption(
        user,
        within(dialog).getByRole('button', { name: /move those/iu }),
        'Auditor',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Delete and move' }),
      );

      await waitFor(() =>
        expect(submitted).toEqual([
          { replacementWorkspaceRoleId: workspaceRoleIds.auditor },
        ]),
      );
    });

    it('deletes an unassigned Role without asking for a replacement (AC-17a)', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
        onDeleteWorkspaceRole: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      await selectRole(user, 'Auditor');
      await user.click(
        within(await editor()).getByRole('button', { name: 'Delete role' }),
      );

      const dialog = await screen.findByRole('dialog', {
        name: /delete auditor/iu,
      });
      expect(
        within(dialog).queryByRole('button', { name: /move those/iu }),
      ).not.toBeInTheDocument();
      expect(dialog).toHaveTextContent(
        'No workspace member holds this role, so no workspace role assignment changes.',
      );

      await user.click(
        within(dialog).getByRole('button', { name: 'Delete role' }),
      );

      await waitFor(() => expect(submitted).toEqual([{}]));
    });

    it('says another custom Role must exist first rather than asking for a replacement that cannot exist (AC-17c)', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
        // The Workspace's only custom Workspace Role, and it is assigned: no
        // replacement other than the protected Owner Role can exist (AC-17c).
        roles: workspaceRoles().filter(
          (role) => role.id !== workspaceRoleIds.auditor,
        ),
        onDeleteWorkspaceRole: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      await selectRole(user, 'Operations Lead');
      await user.click(
        within(await editor()).getByRole('button', { name: 'Delete role' }),
      );

      const dialog = await screen.findByRole('dialog', {
        name: /delete operations lead/iu,
      });
      expect(
        within(dialog).queryByRole('button', { name: /move those/iu }),
      ).not.toBeInTheDocument();
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Create another custom workspace role first',
      );

      const submit = within(dialog).getByRole('button', {
        name: 'Delete and move',
      });
      expect(submit).toBeDisabled();
      await user.click(submit);
      expect(submitted).toEqual([]);
    });

    it('says the deletion also needs assign permission when the server refuses it (AC-17d)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
        onDeleteWorkspaceRole: () => ({
          body: {
            code: 'workspace.role_assignment_required',
            message:
              'Moving the affected Workspace Members to a replacement requires Workspace Role assignment.',
          },
          status: 403,
        }),
      });

      renderTab();
      await selectRole(user, 'Operations Lead');
      await user.click(
        within(await editor()).getByRole('button', { name: 'Delete role' }),
      );

      const dialog = await screen.findByRole('dialog', {
        name: /delete operations lead/iu,
      });
      await selectHeroOption(
        user,
        within(dialog).getByRole('button', { name: /move those/iu }),
        'Auditor',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Delete and move' }),
      );

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Also needs permission to assign workspace roles',
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('offers no delete control at all without WORKSPACE_ROLES:DELETE (AC-30)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext([
          ...watchOnly,
          WorkspacePermissionId.WORKSPACE_ROLES_UPDATE,
        ]),
      });

      renderTab();
      await selectRole(user, 'Operations Lead');

      expect(
        within(await editor()).queryByRole('button', { name: 'Delete role' }),
      ).not.toBeInTheDocument();
    });

    it('says the Workspace has no custom Workspace Role yet, while still listing the protected one', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(watchOnly),
        roles: workspaceRoles().filter((role) => role.kind !== 'custom'),
      });

      renderTab();

      expect(
        await screen.findByText(
          'This workspace has no custom workspace role yet.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /workspace owner/iu }),
      ).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('names every permission checkbox and keeps the delete dialog cancel before its destructive primary', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullRoleAuthority),
      });

      renderTab();
      await selectRole(user, 'Auditor');

      const pane = await editor();
      expect(
        within(pane).getByRole('checkbox', { name: 'View warehouses' }),
      ).toBeChecked();

      const trigger = within(pane).getByRole('button', { name: 'Delete role' });
      await user.click(trigger);
      const dialog = await screen.findByRole('dialog', {
        name: /delete auditor/iu,
      });
      const buttons = within(dialog).getAllByRole('button');
      const cancelIndex = buttons.findIndex(
        (button) => button.textContent === 'Cancel',
      );
      const deleteIndex = buttons.findIndex(
        (button) => button.textContent === 'Delete role',
      );
      expect(cancelIndex).toBeLessThan(deleteIndex);

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(trigger).toHaveFocus();
    });
  });
});
