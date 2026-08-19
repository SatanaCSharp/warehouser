import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WarehousesTab } from 'modules/workspace/components/workspace-administration/warehouses/WarehousesTab';
import { ROUTES } from 'shared/constants/routes';
import { selectHeroOption } from 'test/hero-select';
import { renderWithProviders } from 'test/render';
import {
  assignableWarehouseRoleIds,
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  otherUserIds,
  stubWorkspaceServer,
  warehouseIds,
  workspaceIds,
} from 'test/workspace-fixtures';

import type { ContextWarehouse } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';
import type { AppStore } from 'store';

// `alertWorkspaceAction` drives the success/pending toast through this single
// seam (`web-error-handling.md` §2, §4) — mocking it here, as
// `router.spec.tsx` already does, lets a spec assert the toast copy without
// mounting HeroUI's `Toast.Provider` and queue.
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

const watchOnly = [
  WorkspacePermissionId.WAREHOUSES_WATCH,
  WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
];

const fullAuthority = [
  ...watchOnly,
  WorkspacePermissionId.WAREHOUSES_CREATE,
  WorkspacePermissionId.WAREHOUSES_RENAME,
  WorkspacePermissionId.WAREHOUSES_ARCHIVE,
];

const withAccessManagement = [
  ...watchOnly,
  WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
  WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE,
];

const renderTab = (): void => {
  renderWithProviders(<WarehousesTab />, authenticatedWorkspaceStore());
};

/**
 * Holds the Workspace-users response open until `release()` is called, leaving
 * the warehouses and context reads free to settle. That opens the one render
 * window `WarehousesTab`'s `canReadPeople && !users` clause exists to cover —
 * the moment the list could paint without its per-Warehouse people counts.
 *
 * Added at review (`_review/review-2026-08-18.md` S4): CH-W5 turned `isLoading`
 * into a `WarehouseList` prop, so the composition that computes it lost its
 * only assertion driven by a real query lifecycle. Wraps whatever `fetch`
 * `stubWorkspaceServer` installed, so it must be called after it.
 */
const deferWorkspaceUsers = (): { release: () => void } => {
  const stubbed = globalThis.fetch;
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = () => resolve();
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/api/v1/workspace/users')) {
        await held;
      }
      return stubbed(input, init);
    }),
  );

  return { release };
};

const TabRoutePage = (): ReactElement => <WarehousesTab />;

/**
 * Reads `:warehouseId` off the entered-Warehouse probe route below and
 * renders it as text, so a test can prove Enter navigated there. Named (not
 * inline) so `useParams` satisfies the rules-of-hooks component-naming check.
 */
const EnteredWarehouseProbe = (): ReactElement => {
  const { warehouseId } = useParams({ from: ROUTES.WAREHOUSE });
  return <p>Entered warehouse {warehouseId}</p>;
};

/**
 * A minimal router carrying `WarehousesTab` at `ROUTES.WORKSPACE` and a probe
 * route at `ROUTES.WAREHOUSE`, so the Enter action's `Link` — which throws
 * outside a `RouterProvider` — can resolve and be activated. Built locally
 * rather than importing the production `router.ts` / `warehouseRoute`, which
 * other lanes of this change own concurrently (CR-AC-14).
 */
const renderTabWithRouter = (
  store: AppStore = authenticatedWorkspaceStore(),
): void => {
  const rootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: Outlet,
  });
  const tabRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WORKSPACE,
    component: TabRoutePage,
  });
  const enteredWarehouseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WAREHOUSE,
    component: EnteredWarehouseProbe,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([tabRoute, enteredWarehouseRoute]),
    context: { store },
    history: createMemoryHistory({ initialEntries: [ROUTES.WORKSPACE] }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

/** A membership entry for `WorkspaceContext.warehouses` — the source CR-AC-13
 * requires the Enter action to read, independent of the tab's own
 * `WAREHOUSES:WATCH` list. */
const membershipWarehouse = (
  warehouseId: string,
  archivedAt: string | null,
): ContextWarehouse => ({
  warehouseId,
  name: 'Membership',
  archivedAt,
  roleId: workspaceIds.warehouseRole,
  roleKind: 'warehouse_manager',
});

const warehouseRowFor = async (name: string): Promise<HTMLElement> => {
  const list = await screen.findByRole('list', { name: 'Warehouses' });
  const heading = within(list).getByText(name);
  const row = heading.closest('li');
  if (!row) {
    throw new Error(`No warehouse row found for ${name}`);
  }
  return row;
};

const selectWarehouse = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> => {
  await user.click(
    await screen.findByRole('button', { name: new RegExp(name, 'u') }),
  );
};

const detailPane = async (): Promise<HTMLElement> =>
  screen.findByRole('region', { name: /warehouse detail/iu });

/**
 * HeroUI's `Select` always renders a visually hidden native `<select>` mirror
 * for form semantics alongside the interactive `ListBox`, so once the popover
 * is open a plain `getByRole('option', { hidden: true })` matches both nodes.
 * Filtering to the non-`OPTION` element narrows the assertion to the item a
 * member can actually activate — the same technique `test/hero-select.ts`
 * documents and uses.
 */
const openOptions = (name: string): HTMLElement[] =>
  screen
    .queryAllByRole('option', { name, hidden: true })
    .filter((candidate) => candidate.tagName !== 'OPTION');

// eslint-disable-next-line max-lines-per-function
describe('WarehousesTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    toast.success.mockClear();
    toast.danger.mockClear();
  });

  describe('the detail pane and the level boundary (AC-33)', () => {
    /**
     * Added at review (`_review/review-2026-08-18.md` S3). CR-RG-01 names the
     * per-Warehouse people counts as behaviour that must be identical, but
     * after CH-W5 the only case asserting them feeds `WarehouseList` a literal
     * `peopleCounts` prop, leaving `peopleCountsByWarehouse` — the derivation
     * itself — asserted by nothing that can fail. This drives it end to end
     * from the users the server returns.
     */
    it('derives each row people count from the Workspace users the server returns', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(fullAuthority) });

      renderTab();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      const textOf = (name: string): string | null =>
        within(list)
          .getAllByRole('listitem')
          .find((entry) => entry.textContent?.includes(name))?.textContent ??
        null;
      // Yurii and Anna reach Central DC; Yurii alone reaches North Hub; nobody
      // reaches Old Depot, so it carries no count at all
      // (`test/workspace-fixtures.ts`).
      expect(textOf('Central DC')).toContain('2 people with access');
      // Singular where the count is one — the key carries plural forms, so a
      // sole member is a "person", not "1 people".
      expect(textOf('North Hub')).toContain('1 person with access');
      expect(textOf('Old Depot')).not.toContain('with access');
    });

    /**
     * Added at review (`_review/review-2026-08-18.md` S4) — the other half of
     * the same regression: the anti-flash clause of `isLoading`. Without
     * `canReadPeople && !users` the list paints as soon as the warehouses and
     * context arrive, and the counts appear a heartbeat later.
     */
    it('holds the loading skeleton until the people counts arrive, not only until the list does', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(fullAuthority) });
      const { release } = deferWorkspaceUsers();

      renderTab();

      expect(
        await screen.findByLabelText('Loading warehouses'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('list', { name: 'Warehouses' }),
      ).not.toBeInTheDocument();

      release();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      expect(
        within(list)
          .getAllByRole('listitem')
          .find((entry) => entry.textContent?.includes('Central DC'))
          ?.textContent,
      ).toContain('2 people with access');
      expect(
        screen.queryByLabelText('Loading warehouses'),
      ).not.toBeInTheDocument();
    });

    it('omits the people list entirely without WORKSPACE_MEMBERS:WATCH and never requests it (AC-30)', async () => {
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WAREHOUSES_WATCH,
        ]),
      });

      renderTab();

      await detailPane();
      expect(screen.queryByText('People with access')).not.toBeInTheDocument();
      const requestedUsers = (): boolean =>
        requestedUrls.some((url) => url.endsWith('/api/v1/workspace/users'));
      await waitFor(() => expect(requestedUsers()).toBe(false));
    });
  });

  describe('adding a Warehouse (AC-06, AC-08)', () => {
    it('adds the Warehouse and reports the outcome that committed', async () => {
      const user = userEvent.setup();
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
      });

      renderTab();

      await user.click(
        await screen.findByRole('button', { name: 'Add warehouse' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: /add a warehouse/iu,
      });
      await user.type(
        within(dialog).getByRole('textbox', { name: /warehouse name/iu }),
        'Southgate Cross-dock',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Add warehouse' }),
      );

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(
        requestedUrls.filter((url) =>
          url.endsWith('/api/v1/workspace/warehouses'),
        ).length,
      ).toBeGreaterThan(1);
    });

    it('names the broken Warehouse-name rule on the field and makes no request (AC-08)', async () => {
      const user = userEvent.setup();
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
      });

      renderTab();

      await user.click(
        await screen.findByRole('button', { name: 'Add warehouse' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: /add a warehouse/iu,
      });
      await user.type(
        within(dialog).getByRole('textbox', { name: /warehouse name/iu }),
        '   ',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Add warehouse' }),
      );

      expect(
        await screen.findByText('Enter a Warehouse name.'),
      ).toBeInTheDocument();
      // The subject is unchanged — no create request fired — but it is counted
      // rather than positioned: the tab's controls now read the Workspace
      // context through their own gates, and a child's effect runs before its
      // parent's, so the context read is no longer guaranteed to arrive after
      // the Warehouse list read. Every request to this path is therefore the
      // list read, and there must still be exactly the one
      // (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
      const created = requestedUrls.filter((url) =>
        url.endsWith('/api/v1/workspace/warehouses'),
      );
      expect(created).toHaveLength(1);
    });

    it('binds a server-rejected name to the field, naming the rule that failed (AC-08)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        onCreateWarehouse: () => ({
          body: {
            code: 'workspace.invalid_input',
            message: 'Correct the highlighted Workspace fields.',
            details: { field: 'name', rule: 'control_or_format_character' },
          },
          status: 400,
        }),
      });

      renderTab();

      await user.click(
        await screen.findByRole('button', { name: 'Add warehouse' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: /add a warehouse/iu,
      });
      await user.type(
        within(dialog).getByRole('textbox', { name: /warehouse name/iu }),
        'Anything',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Add warehouse' }),
      );

      expect(
        await screen.findByText(
          'Warehouse name contains an unsupported character.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('omits the add control entirely without WAREHOUSES:CREATE (AC-30)', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      await detailPane();
      expect(
        screen.queryByRole('button', { name: 'Add warehouse' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('renaming a Warehouse (AC-09)', () => {
    it('keeps Save name dimmed and non-actionable until the name changes', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(fullAuthority) });

      renderTab();

      const save = within(await detailPane()).getByRole('button', {
        name: 'Save name',
      });
      expect(save).toBeDisabled();

      await user.type(
        screen.getByRole('textbox', { name: /warehouse name/iu }),
        'x',
      );

      expect(save).toBeEnabled();
    });

    it('submits the trimmed name and reports the committed rename', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        onRenameWarehouse: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();

      const field = await screen.findByRole('textbox', {
        name: /warehouse name/iu,
      });
      await user.clear(field);
      await user.type(field, '  Central Distribution  ');
      await user.click(screen.getByRole('button', { name: 'Save name' }));

      await waitFor(() =>
        expect(submitted).toEqual([{ name: 'Central Distribution' }]),
      );
    });

    it('stays available while the Warehouse is archived, because its subject is the Warehouse record (AC-11)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(fullAuthority) });

      renderTab();
      await selectWarehouse(user, 'Old Depot');

      const detail = await detailPane();
      expect(
        within(detail).getByRole('textbox', { name: /warehouse name/iu }),
      ).toBeEnabled();
    });

    it('offers no editable name at all without WAREHOUSES:RENAME (AC-30)', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const detail = await detailPane();
      expect(
        within(detail).queryByRole('textbox', { name: /warehouse name/iu }),
      ).not.toBeInTheDocument();
      expect(
        within(detail).queryByRole('button', { name: 'Save name' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('archiving and restoring (AC-11, AC-11a, AC-12a)', () => {
    it('names what stops, what is kept, and archives the Warehouse', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        onSetWarehouseArchival: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();

      await user.click(
        await screen.findByRole('button', { name: 'Archive warehouse' }),
      );
      const dialog = await screen.findByRole('alertdialog', {
        name: /archive central dc/iu,
      });
      expect(within(dialog).getByText('What stops')).toBeInTheDocument();
      expect(within(dialog).getByText('What is kept')).toBeInTheDocument();

      await user.click(
        within(dialog).getByRole('button', { name: 'Archive warehouse' }),
      );

      await waitFor(() => expect(submitted).toEqual([{ archived: true }]));
    });

    it('presents an archived Warehouse read-only, keeping Restore warehouse available (AC-12a)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(fullAuthority) });

      renderTab();
      await selectWarehouse(user, 'Old Depot');

      const detail = await detailPane();
      expect(within(detail).getByText('Archived')).toBeInTheDocument();
      expect(
        within(detail).getByText('This warehouse is archived'),
      ).toBeInTheDocument();
      expect(
        within(detail).getByRole('button', { name: 'Restore warehouse' }),
      ).toBeEnabled();
      expect(
        within(detail).queryByRole('button', { name: 'Archive warehouse' }),
      ).not.toBeInTheDocument();
    });

    it('restores an archived Warehouse without a confirmation step', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        onSetWarehouseArchival: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      await selectWarehouse(user, 'Old Depot');
      await user.click(
        within(await detailPane()).getByRole('button', {
          name: 'Restore warehouse',
        }),
      );

      await waitFor(() => expect(submitted).toEqual([{ archived: false }]));
    });

    it('refuses to archive the only Warehouse still in operation and offers the alternative (AC-11a)', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        warehouses: [
          { id: warehouseIds.central, name: 'Central DC', archivedAt: null },
          {
            id: warehouseIds.oldDepot,
            name: 'Old Depot',
            archivedAt: '2026-08-01T09:00:00.000Z',
          },
        ],
      });

      renderTab();

      const detail = await detailPane();
      const alert = within(detail).getByRole('alert');
      expect(alert).toHaveTextContent('Central DC cannot be archived');
      expect(alert).toHaveTextContent(
        /a workspace always keeps one, so its members are never left without a site to work in/iu,
      );
      expect(
        within(detail).getByRole('button', { name: 'Archive warehouse' }),
      ).toBeDisabled();
      expect(
        within(detail).getByRole('button', { name: 'Add a warehouse first' }),
      ).toBeEnabled();
    });

    it('omits both lifecycle controls without WAREHOUSES:ARCHIVE (AC-30)', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const detail = await detailPane();
      expect(
        within(detail).queryByRole('button', { name: 'Archive warehouse' }),
      ).not.toBeInTheDocument();
      expect(
        within(detail).queryByRole('button', { name: 'Restore warehouse' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('giving warehouse access (AC-23, AC-23a)', () => {
    const openGiveAccessDialog = async (
      user: ReturnType<typeof userEvent.setup>,
    ): Promise<HTMLElement> => {
      await user.click(
        await screen.findByRole('button', { name: 'Give access' }),
      );
      return screen.findByRole('dialog', { name: /give warehouse access/iu });
    };

    it("lists the Workspace's other Users, excluding the acting member and anyone already in Central DC, and Central DC's assignable custom Roles from the narrow read", async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(withAccessManagement),
      });

      renderTab();
      const dialog = await openGiveAccessDialog(user);

      await user.click(
        within(dialog).getByRole('button', { name: /person/iu }),
      );
      // Anna already belongs to Central DC (excluded, AC-25) and the acting
      // member (Yurii) can never be their own target (AC-25a) — only Lena, who
      // belongs to no Warehouse yet, is a valid candidate.
      expect(openOptions('lena.boiko@example.test')).toHaveLength(1);
      expect(
        screen.queryByRole('option', {
          name: 'anna.kravets@example.test',
          hidden: true,
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('option', {
          name: 'yurii@example.test',
          hidden: true,
        }),
      ).not.toBeInTheDocument();

      await user.keyboard('{Escape}');
      await user.click(
        within(dialog).getByRole('button', { name: /role in/iu }),
      );
      expect(openOptions('Picker')).toHaveLength(1);
      expect(openOptions('Site Supervisor')).toHaveLength(1);
    });

    it("requests no data for a Warehouse's members, Roles or resources beyond the two narrow reads (AC-23a)", async () => {
      const user = userEvent.setup();
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext(withAccessManagement),
      });

      renderTab();
      // The Roles read belongs to the dialog, so it waits for the dialog: the
      // trigger's presence in the detail pane requests nothing.
      await screen.findByRole('button', { name: 'Give access' });
      expect(
        requestedUrls.some((url) => url.includes('/assignable-roles')),
      ).toBe(false);

      await openGiveAccessDialog(user);

      await waitFor(() =>
        expect(
          requestedUrls.some((url) => url.includes('/assignable-roles')),
        ).toBe(true),
      );
      expect(
        requestedUrls.some((url) => url.includes('/api/v1/warehouses/')),
      ).toBe(false);
    });

    it('states what changes and what is preserved before placing the target User with the chosen Role, and reports the committed outcome by name', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(withAccessManagement),
        onAssignWarehouseMembership: (body) => {
          submitted.push(body);
          return undefined;
        },
      });

      renderTab();
      const dialog = await openGiveAccessDialog(user);

      expect(within(dialog).getByText(/warehouse manager/iu)).toBeVisible();

      await selectHeroOption(
        user,
        within(dialog).getByRole('button', { name: /person/iu }),
        'lena.boiko@example.test',
      );
      await selectHeroOption(
        user,
        within(dialog).getByRole('button', { name: /role in/iu }),
        'Picker',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Give access' }),
      );

      await waitFor(() =>
        expect(submitted).toEqual([
          {
            userId: otherUserIds.lena,
            roleId: assignableWarehouseRoleIds.picker,
          },
        ]),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/central dc/iu),
      );
    });
  });

  describe('withdrawing warehouse access (AC-25b, AC-25c)', () => {
    const rowFor = (email: string): HTMLElement => {
      const row = screen.getByText(email).closest('li');
      if (!row) {
        throw new Error(`No person row found for ${email}`);
      }
      return row;
    };

    it('states what is preserved, withdraws the membership and removes the person from the pane (AC-25b)', async () => {
      const user = userEvent.setup();
      const submitted: unknown[] = [];
      stubWorkspaceServer({
        context: namedWorkspaceContext(withAccessManagement),
        onRevokeWarehouseMembership: () => {
          submitted.push(true);
          return undefined;
        },
      });

      renderTab();
      await detailPane();

      await user.click(
        within(rowFor('anna.kravets@example.test')).getByRole('button', {
          name: /withdraw access/iu,
        }),
      );
      const dialog = await screen.findByRole('alertdialog', {
        name: /withdraw access/iu,
      });
      expect(dialog).toHaveTextContent(/other memberships .* unaffected/iu);

      await user.click(
        within(dialog).getByRole('button', { name: 'Withdraw access' }),
      );

      await waitFor(() => expect(submitted).toEqual([true]));
      await waitFor(() =>
        expect(
          screen.queryByText('anna.kravets@example.test'),
        ).not.toBeInTheDocument(),
      );
    });

    it('handles a server denial of withdrawal independently of the offered control, without disclosing the target (AC-25c)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext(withAccessManagement),
        onRevokeWarehouseMembership: () => ({
          body: {
            code: 'workspace.manager_transfer_required',
            message:
              'Warehouse Manager changes only through the protected transfer.',
          },
          status: 409,
        }),
      });

      renderTab();
      await detailPane();

      // The client offers the control on Anna's row — it holds no data that
      // could mark her membership as protected — and the server is the one
      // that refuses.
      const withdraw = within(rowFor('anna.kravets@example.test')).getByRole(
        'button',
        { name: /withdraw access/iu },
      );
      expect(withdraw).toBeEnabled();
      await user.click(withdraw);
      const dialog = await screen.findByRole('alertdialog', {
        name: /withdraw access/iu,
      });
      await user.click(
        within(dialog).getByRole('button', { name: 'Withdraw access' }),
      );

      await waitFor(() => expect(toast.danger).toHaveBeenCalled());
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByText('anna.kravets@example.test')).toBeInTheDocument();
    });
  });

  // The approved frames' responsive contract (design-handoff.md §Responsive
  // behavior). jsdom applies no stylesheet, so the breakpoint behaviour is
  // asserted through the responsive utility classes the frames translate to.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('puts the 340px list and the detail pane side by side with a 24px gap from the split-view breakpoint up', async () => {
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const split = (await detailPane()).parentElement;
      expect(split?.className).toContain('gap-6');
      expect(split?.className).toContain('lg:grid-cols-[340px_minmax(0,1fr)]');
    });

    it('collapses to full-width cards below the breakpoint and gives the detail screen an "All warehouses" affordance', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(watchOnly) });

      renderTab();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      expect(list.parentElement?.className).not.toContain('hidden');

      await selectWarehouse(user, 'North Hub');

      // Selecting navigates to the detail screen below the breakpoint, while
      // the split view keeps both panes from `lg` up.
      expect(list.parentElement?.className).toContain('hidden');
      expect(list.parentElement?.className).toContain('lg:block');
      const back = screen.getByRole('button', { name: 'All warehouses' });
      expect(back.className).toContain('lg:hidden');

      await user.click(back);
      expect(list.parentElement?.className).not.toContain('hidden');
    });
  });

  describe('accessibility', () => {
    it('keeps the archive dialog cancel before its destructive primary and returns focus to the trigger on Escape', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({ context: namedWorkspaceContext(fullAuthority) });

      renderTab();

      const trigger = await screen.findByRole('button', {
        name: 'Archive warehouse',
      });
      await user.click(trigger);
      const dialog = await screen.findByRole('alertdialog', {
        name: /archive central dc/iu,
      });

      const buttons = within(dialog).getAllByRole('button');
      const cancelIndex = buttons.findIndex(
        (button) => button.textContent === 'Cancel',
      );
      const archiveIndex = buttons.findIndex(
        (button) => button.textContent === 'Archive warehouse',
      );
      expect(cancelIndex).toBeLessThan(archiveIndex);

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
      );
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it('exposes the reason the archive action is unavailable rather than only dimming it (AC-11a)', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(fullAuthority),
        warehouses: [
          { id: warehouseIds.central, name: 'Central DC', archivedAt: null },
        ],
      });

      renderTab();

      const archive = within(await detailPane()).getByRole('button', {
        name: 'Archive warehouse',
      });
      const describedBy = archive.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
        /a workspace always keeps one/iu,
      );
    });
  });

  describe('the Enter action (CR-AC-04, CR-AC-13, CR-AC-14, CR-RG-02)', () => {
    it("navigates to that Warehouse's view when Enter is activated", async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: {
          ...namedWorkspaceContext(watchOnly),
          warehouses: [membershipWarehouse(warehouseIds.central, null)],
        },
      });

      renderTabWithRouter();

      const row = await warehouseRowFor('Central DC');
      await user.click(within(row).getByRole('link', { name: /enter/iu }));

      expect(
        await screen.findByText(`Entered warehouse ${warehouseIds.central}`),
      ).toBeInTheDocument();
    });

    it('leaves rename, archive/restore and grant/withdraw access reachable on a row that also renders Enter', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: {
          ...namedWorkspaceContext(fullAuthority),
          warehouses: [membershipWarehouse(warehouseIds.central, null)],
        },
      });

      renderTabWithRouter();

      const row = await warehouseRowFor('Central DC');
      expect(
        within(row).getByRole('link', { name: /enter/iu }),
      ).toBeInTheDocument();

      await user.click(
        within(row).getByRole('button', { name: /central dc/iu }),
      );

      const detail = await detailPane();
      expect(
        within(detail).getByRole('button', { name: 'Save name' }),
      ).toBeInTheDocument();
      expect(
        within(detail).getByRole('button', { name: 'Archive warehouse' }),
      ).toBeInTheDocument();
    });
  });
});
