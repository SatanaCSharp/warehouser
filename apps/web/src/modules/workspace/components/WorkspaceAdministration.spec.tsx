import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceAdministration } from 'modules/workspace/components/WorkspaceAdministration';
import { loadWorkspaceAdministration } from 'modules/workspace/loaders/workspace-administration.loader';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import { ROUTES } from 'shared/constants/routes';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
  unnamedWorkspaceContext,
} from 'test/workspace-fixtures';

import type { ReactElement } from 'react';
import type { AppStore } from 'store';

const ADMINISTRATION_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'WorkspaceAdministration.tsx',
);

const administrationSource = (): string =>
  readFileSync(ADMINISTRATION_SOURCE, 'utf8');

const allWatchPermissions = [
  WorkspacePermissionId.WAREHOUSES_WATCH,
  WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
  WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
];

const AdministrationRoutePage = (): ReactElement => <WorkspaceAdministration />;

/** The address `WarehouseEnterLink` resolves; it renders no destination here. */
const EnteredWarehouseProbe = (): ReactElement => <p>Entered a warehouse</p>;

/**
 * T12 — the destination is rendered inside a match whose id is
 * `ROUTES.WORKSPACE`, which is where `useWorkspaceAdministrationContext` reads
 * its guarantee from (`global-loader/sad.md` §4.6). The tree is built here
 * rather than imported from `router.ts`, so the production `workspaceRoute`
 * singleton is never mutated by a spec — the same shape
 * `WarehousesTab.spec.tsx` and `useEnteredWarehouse.spec.tsx` already use.
 */
const renderInWorkspaceRoute = (store: AppStore): void => {
  const testRootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: () => <Outlet />,
  });
  const warehouseProbeRoute = createRoute({
    component: EnteredWarehouseProbe,
    getParentRoute: () => testRootRoute,
    path: ROUTES.WAREHOUSE,
  });
  const workspaceTestRoute = createRoute({
    component: AdministrationRoutePage,
    getParentRoute: () => testRootRoute,
    path: ROUTES.WORKSPACE,
  });

  const router = createRouter({
    context: { store },
    history: createMemoryHistory({ initialEntries: [ROUTES.WORKSPACE] }),
    routeTree: testRootRoute.addChildren([
      warehouseProbeRoute,
      workspaceTestRoute,
    ]),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

/**
 * What `requireWorkspaceCapability` has already awaited by the time the
 * destination renders in the app (`guards/workspace.guard.ts`), done here so
 * every case below starts from the cache state production guarantees.
 */
const primeWorkspaceContext = async (store: AppStore): Promise<void> => {
  await store
    .dispatch(
      workspaceContextApi.endpoints.getWorkspaceContext.initiate(undefined, {
        subscribe: false,
      }),
    )
    .unwrap();
};

const renderAdministration = async (): Promise<void> => {
  const store = authenticatedWorkspaceStore();
  await primeWorkspaceContext(store);
  renderInWorkspaceRoute(store);
};

// The shell's cases stay in one suite because every one of them is about the
// same rendered destination: which sections exist, how it reads, and how it
// names the Workspace behind them.
// eslint-disable-next-line max-lines-per-function
describe('WorkspaceAdministration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the four tabs in the approved order — Warehouses / Workspace roles / Members / Permissions — when fully authorized', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext(allWatchPermissions),
    });

    await renderAdministration();

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining('Warehouses'),
      expect.stringContaining('Workspace roles'),
      expect.stringContaining('Members'),
      expect.stringContaining('Permissions'),
    ]);
  });

  it('shows the Warehouses tab only under WAREHOUSES:WATCH and requests no other dataset', async () => {
    const requestedUrls = stubWorkspaceServer({
      context: namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    });

    await renderAdministration();

    expect(
      await screen.findByRole('tab', { name: /warehouses/iu }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /workspace roles/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /^members$/iu }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        requestedUrls.some((url) => url.includes('/workspace/roles')),
      ).toBe(false),
    );
    expect(
      requestedUrls.some((url) => url.includes('/workspace/members')),
    ).toBe(false);
  });

  it('shows the Workspace roles tab only under WORKSPACE_ROLES:WATCH', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ]),
    });

    await renderAdministration();

    expect(
      await screen.findByRole('tab', { name: /workspace roles/iu }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /warehouses/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /^members$/iu }),
    ).not.toBeInTheDocument();
  });

  it('shows the Members tab only under WORKSPACE_MEMBERS:WATCH', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([
        WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
      ]),
    });

    await renderAdministration();

    expect(
      await screen.findByRole('tab', { name: /^members$/iu }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /warehouses/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /workspace roles/iu }),
    ).not.toBeInTheDocument();
  });

  it('describes the selected section, changing the description with the tab', async () => {
    const user = userEvent.setup();
    stubWorkspaceServer({
      context: namedWorkspaceContext(allWatchPermissions),
    });

    await renderAdministration();

    expect(
      await screen.findByText(/your workspace owns every warehouse below it/iu),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /workspace roles/iu }));

    expect(
      await screen.findByText(
        /workspace roles decide who may administer this workspace/iu,
      ),
    ).toBeInTheDocument();
  });

  // Responsive contract of the approved frames (design-handoff.md §Responsive
  // behavior). jsdom applies no stylesheet, so the breakpoint behaviour is
  // asserted through the responsive utility classes the frames translate to:
  // one heading row from `sm` up, stacked and full-width below it.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('shares one row between the heading and its primary action from the sm breakpoint up, and stacks them below it', async () => {
      stubWorkspaceServer({
        context: unnamedWorkspaceContext(),
      });

      await renderAdministration();

      const heading = await screen.findByRole('heading', { level: 1 });
      const headerRow = heading.closest('header');
      expect(headerRow?.className).toContain('flex-col');
      expect(headerRow?.className).toContain('sm:flex-row');
      expect(headerRow?.className).toContain('sm:items-center');
      expect(headerRow?.className).toContain('sm:justify-between');
    });

    it('stacks the page action full width below the sm breakpoint', async () => {
      stubWorkspaceServer({ context: unnamedWorkspaceContext() });

      await renderAdministration();

      const action = await screen.findByRole('button', {
        name: /name workspace/iu,
      });
      expect(action.className).toContain('w-full');
      expect(action.className).toContain('sm:w-auto');
    });

    it('shortens the "Workspace roles" tab label to "Roles" below the sm breakpoint, keeping the full label at sm and above', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(allWatchPermissions),
      });

      await renderAdministration();

      const fullLabel = await screen.findByText('Workspace roles');
      const shortLabel = screen.getByText('Roles');
      expect(fullLabel.className).toContain('hidden');
      expect(fullLabel.className).toContain('sm:inline');
      expect(shortLabel.className).toContain('sm:hidden');
    });
  });

  describe('accessibility', () => {
    it('exposes a level-1 heading, a labelled tab list and a tab panel', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext(allWatchPermissions),
      });

      await renderAdministration();

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: /acme logistics/iu,
        }),
      ).toBeInTheDocument();
      const tabList = screen.getByRole('tablist', {
        name: 'Workspace sections',
      });
      expect(within(tabList).getAllByRole('tab')).toHaveLength(4);
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('keeps the keyboard order page heading → page action → tabs', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
          ...allWatchPermissions,
        ]),
      });

      await renderAdministration();

      const action = await screen.findByRole('button', {
        name: /name workspace/iu,
      });
      const heading = screen.getByRole('heading', { level: 1 });
      const firstTab = screen.getAllByRole('tab')[0];

      // Document order is what both the visual hierarchy and the tab sequence
      // follow (design-handoff.md §Accessibility).
      const documentOrder = [...document.querySelectorAll('*')];
      expect(documentOrder.indexOf(heading)).toBeLessThan(
        documentOrder.indexOf(action),
      );
      expect(documentOrder.indexOf(action)).toBeLessThan(
        documentOrder.indexOf(firstTab),
      );

      await user.tab();
      expect(action).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('tab', { selected: true })).toHaveFocus();
    });
  });

  describe('naming the workspace (AC-29)', () => {
    it('shows the unnamed-Workspace placeholder and opens the name dialog', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
      });

      await renderAdministration();

      expect(await screen.findByText('Untitled workspace')).toBeInTheDocument();
      expect(screen.getByText('Not named yet')).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: /name workspace/iu }),
      );

      expect(
        await screen.findByRole('dialog', { name: /name your workspace/iu }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: /workspace name/iu }),
      ).toHaveValue('');
    });

    it('offers renaming a named Workspace, seeded with its current name (AC-29)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
      });

      await renderAdministration();

      await user.click(
        await screen.findByRole('button', { name: /rename workspace/iu }),
      );

      expect(
        screen.getByRole('textbox', { name: /workspace name/iu }),
      ).toHaveValue('Acme Logistics');
    });

    // The rename control is a capability of this destination in its own right,
    // so an actor holding only `WORKSPACE:RENAME` must find it here — and must
    // not be shown a tab shell with nothing in it, because AC-30 omits what
    // the actor cannot use rather than presenting it empty.
    it('offers the naming control, and no empty tab shell, when WORKSPACE:RENAME is the only Workspace Permission held (AC-29, AC-30)', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
      });

      await renderAdministration();

      expect(
        await screen.findByRole('button', { name: /rename workspace/iu }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    });

    it('omits the naming control entirely without WORKSPACE:RENAME (AC-30)', async () => {
      stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WAREHOUSES_WATCH,
        ]),
      });

      await renderAdministration();

      expect(await screen.findByText('Untitled workspace')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /name workspace/iu }),
      ).not.toBeInTheDocument();
    });

    it('replaces the placeholder with the submitted name on save (AC-29)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
        onRenameWorkspace: () => ({
          body: {
            id: '00000000-0000-4000-8000-000000000100',
            name: 'Acme Logistics',
          },
          status: 200,
        }),
      });

      await renderAdministration();

      await user.click(
        await screen.findByRole('button', { name: /name workspace/iu }),
      );
      await user.type(
        screen.getByRole('textbox', { name: /workspace name/iu }),
        'Acme Logistics',
      );
      await user.click(screen.getByRole('button', { name: 'Save name' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: /acme logistics/iu,
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Untitled workspace')).not.toBeInTheDocument();
      expect(screen.queryByText('Not named yet')).not.toBeInTheDocument();
    });

    it('names the broken rule on the field and leaves the unnamed state as it was (AC-29a)', async () => {
      const user = userEvent.setup();
      stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
        onRenameWorkspace: () => ({
          body: {
            code: 'workspace.invalid_input',
            message: 'Correct the highlighted Workspace fields.',
            details: { field: 'name', rule: 'control_or_format_character' },
          },
          status: 400,
        }),
      });

      await renderAdministration();

      await user.click(
        await screen.findByRole('button', { name: /name workspace/iu }),
      );
      const nameField = screen.getByRole('textbox', {
        name: /workspace name/iu,
      });
      await user.type(nameField, 'Anything');
      await user.click(screen.getByRole('button', { name: 'Save name' }));

      expect(
        await screen.findByText(
          'Workspace name contains an unsupported character.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // The Workspace is still unnamed behind the open dialog.
      expect(screen.getByText('Untitled workspace')).toBeInTheDocument();
    });

    it('names the empty-name rule before any request is made (AC-29a)', async () => {
      const user = userEvent.setup();
      const requestedUrls = stubWorkspaceServer({
        context: unnamedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_RENAME,
        ]),
      });

      await renderAdministration();

      await user.click(
        await screen.findByRole('button', { name: /name workspace/iu }),
      );
      await user.type(
        screen.getByRole('textbox', { name: /workspace name/iu }),
        '   ',
      );
      await user.click(screen.getByRole('button', { name: 'Save name' }));

      expect(
        await screen.findByText(
          'A workspace name cannot be empty once trimmed.',
        ),
      ).toBeInTheDocument();
      expect(
        requestedUrls.filter((url) => url.endsWith('/api/v1/workspace')),
      ).toHaveLength(0);
    });
  });

  // T45 — regression coverage for the defect where every tab panel rendered
  // `{null}`, so the Warehouses tab was reachable by URL but showed nothing.
  // These cases render `WarehousesTab` only by selecting the tab through
  // `WorkspaceAdministration`, never by mounting `WarehousesTab` directly, so
  // they fail if the panel wiring regresses even though `WarehousesTab`'s own
  // suite stays green.
  describe('rendering the Warehouses tab panel content (AC-12, AC-30)', () => {
    it('renders the Warehouses tab content — its Warehouse list — reached through WorkspaceAdministration under WAREHOUSES:WATCH', async () => {
      stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WAREHOUSES_WATCH,
        ]),
      });

      await renderAdministration();

      const list = await screen.findByRole('list', { name: 'Warehouses' });
      expect(within(list).getByText('Central DC')).toBeInTheDocument();
    });

    it('renders no Warehouses content and requests no Warehouse list without WAREHOUSES:WATCH', async () => {
      const requestedUrls = stubWorkspaceServer({
        context: namedWorkspaceContext([
          WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
        ]),
      });

      await renderAdministration();

      await screen.findByRole('tab', { name: /workspace roles/iu });
      // The Permissions tab's `Warehouses` Permission group carries the same
      // accessible name as the Warehouses list (`sad.md` §11, risk row 3), and
      // that tab is admitted and force-mounted for this actor — so a
      // `list`-by-name query here matches whichever of the two happened to
      // render first. The absence of the Warehouses tab is what actually
      // establishes the absence of its panel, and a Warehouse record is what
      // only the Warehouses list renders.
      expect(
        screen.queryByRole('tab', { name: 'Warehouses' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Central DC')).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          requestedUrls.some((url) =>
            url.endsWith('/api/v1/workspace/warehouses'),
          ),
        ).toBe(false),
      );
    });

    // General guard against the same class of defect on the other three tabs.
    // A blanket "no tab panel is ever empty" assertion would fail today for
    // `workspaceRoles` (T38) and `members` (T39), whose panels are still
    // legitimately `{null}` because no task has wired their content yet — so
    // this table is deliberately explicit about which tabs are shipped.
    // Add a tab's id here, with a matcher for content only its panel
    // produces, the same day its content task lands; until then leaving it
    // out is correct, not an oversight.
    const shippedTabContent: ReadonlyArray<{
      accessibleTabName: RegExp;
      contentMatcher: RegExp;
      id: string;
    }> = [
      {
        accessibleTabName: /warehouses/iu,
        contentMatcher: /central dc/iu,
        id: 'warehouses',
      },
    ];

    it.each(shippedTabContent)(
      'never renders an empty panel for the shipped "$id" tab',
      async ({ accessibleTabName, contentMatcher }) => {
        stubWorkspaceServer({
          context: namedWorkspaceContext(allWatchPermissions),
        });

        await renderAdministration();

        const user = userEvent.setup();
        await user.click(
          await screen.findByRole('tab', { name: accessibleTabName }),
        );

        const panel = await screen.findByRole('tabpanel');
        expect(panel.textContent?.trim()).not.toBe('');
        expect(panel.textContent).toMatch(contentMatcher);
      },
    );
  });

  // T12 / CH-05, CH-13 — both branches this file used to open with were
  // unreachable: `guards/workspace.guard.ts` unwraps `getWorkspaceContext` in
  // `beforeLoad`, so the entry is fulfilled before the destination renders and
  // neither `isLoading` nor a missing context was ever observed here. What
  // replaces them is a type: `useWorkspaceAdministrationContext` returns a
  // non-optional `WorkspaceContext` inside the guarded route (CR-AC-05 as
  // amended by `global-loader/sad.md` §11).
  describe('the removed readiness branches (CR-AC-05)', () => {
    it('holds no loading branch and imports no Spinner', () => {
      const source = administrationSource();

      expect(source).not.toMatch(/\bSpinner\b/u);
      expect(source).not.toMatch(/\bis(?:Ready|Loading|Fetching)\b/u);
      expect(source).not.toMatch(/t\('loading'\)/u);
    });

    it('holds no `if (!workspaceContext) return null` and returns ReactElement', () => {
      const source = administrationSource();

      expect(source).not.toMatch(/if \(!workspaceContext\)/u);
      expect(source).not.toMatch(/return null/u);
      expect(source).not.toContain('ReactElement | null');
      expect(source).toMatch(
        /export const WorkspaceAdministration = \(\): ReactElement =>/u,
      );
    });

    it('reads the route-scoped projection rather than the shell contract', () => {
      const source = administrationSource();

      expect(source).toContain('useWorkspaceAdministrationContext');
      expect(source).not.toContain('useCurrentWorkspaceContext');
    });

    it('still names the Workspace and its sections with the context the route guaranteed', async () => {
      // The surviving arm, unchanged: the heading, the placeholder chip's
      // condition and the section description all read the same context.
      stubWorkspaceServer({
        context: namedWorkspaceContext(allWatchPermissions),
      });

      await renderAdministration();

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: /acme logistics/iu,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/your workspace owns every warehouse below it/iu),
      ).toBeInTheDocument();
      expect(screen.queryByText('Not named yet')).not.toBeInTheDocument();
    });
  });
});

// CR-AC-03's third clause — force-mounted panels. The loaders dispatch with
// `subscribe: false` (`sad.md` §4.4), so a loader-filled entry holds no
// subscriber of its own and RTK Query starts its 60-second `keepUnusedDataFor`
// timer the moment the read settles. Force-mounting every admitted panel is
// what gives each admitted tab's own query hook a mount on first paint, and
// with it the subscription that retains the entry for the destination's
// lifetime. Without it an unopened admitted tab's entry is evicted after a
// minute's dwell, and — with no readiness term left after CH-09 — that tab
// paints its empty message for a dataset merely in flight.
describe('WorkspaceAdministration force-mounted tab panels (CR-AC-03)', () => {
  /** RTK Query's default `keepUnusedDataFor`, in milliseconds. */
  const RETENTION_WINDOW_MS = 60_000;

  const CONTEXT_URL = '/api/v1/workspace/context';
  const MEMBERS_URL = '/api/v1/workspace/members';
  const PERMISSIONS_URL = '/api/v1/workspace/permissions';
  const ROLES_URL = '/api/v1/workspace/roles';
  const USERS_URL = '/api/v1/workspace/users';
  const WAREHOUSES_URL = '/api/v1/workspace/warehouses';

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("mounts and subscribes every admitted tab's own query hook on first paint, with no tab opened", async () => {
    const requestedUrls = stubWorkspaceServer({
      context: namedWorkspaceContext(allWatchPermissions),
    });

    await renderAdministration();

    await screen.findByRole('tablist', { name: 'Workspace sections' });
    // Every admitted tab's dataset, not only the selected tab's: a panel that
    // is not committed runs no hook, so this list is the observable form of
    // "each admitted tab's own query hook mounts on first paint".
    await waitFor(() =>
      expect([...new Set(requestedUrls)].sort()).toStrictEqual([
        CONTEXT_URL,
        MEMBERS_URL,
        PERMISSIONS_URL,
        ROLES_URL,
        USERS_URL,
        WAREHOUSES_URL,
      ]),
    );
  });

  it('reads only, so a committed but unselected panel writes nothing', async () => {
    // Force-mounting commits four surfaces that own mutations. Committing them
    // must stay inert in the strong sense: no panel may issue a write merely
    // because it was mounted behind the selected one.
    stubWorkspaceServer({
      context: namedWorkspaceContext(allWatchPermissions),
    });

    await renderAdministration();

    await screen.findByRole('region', { name: 'Workspace roles' });
    const methods = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([, init]) => init?.method ?? 'GET');
    expect([...new Set(methods)]).toStrictEqual(['GET']);
  });

  it('keeps an unopened admitted tab past keepUnusedDataFor, so opening it issues no request and shows no empty message', async () => {
    // CR-AC-03's own falsifier. The clock is faked before the loader runs,
    // because the removal timeout is scheduled the moment a subscriber-less
    // read settles — a clock installed afterwards would never see it.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const requestedUrls = stubWorkspaceServer({
      context: namedWorkspaceContext(allWatchPermissions),
    });
    const store = authenticatedWorkspaceStore();

    await loadWorkspaceAdministration({ context: { store } });
    renderInWorkspaceRoute(store);
    // Scoped to the selected panel: every admitted tab's content is in the DOM
    // at once now, and the Permissions tab's `Warehouses` group carries the
    // same accessible name as the Warehouses list (`sad.md` §11, risk row 3).
    await within(await screen.findByRole('tabpanel')).findByRole('list', {
      name: 'Warehouses',
    });

    requestedUrls.length = 0;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETENTION_WINDOW_MS * 2);
    });

    await user.click(screen.getByRole('tab', { name: /workspace roles/iu }));

    expect(
      within(screen.getByRole('tabpanel')).getByRole('region', {
        name: 'Workspace roles',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('This workspace has no custom workspace role yet.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('This workspace has no workspace member yet.'),
    ).not.toBeInTheDocument();
    expect(requestedUrls).toStrictEqual([]);
  });

  it('marks every unselected panel inert, so only the selected one is on the accessibility tree', async () => {
    // React Aria mounts a force-mounted panel **inert but present**: it carries
    // no `tabpanel` role and its subtree is out of the keyboard order and the
    // accessibility tree, which is the whole of `sad.md` §8's accessibility
    // clause. jsdom applies no stylesheet, so the attribute React Aria sets is
    // what the guarantee is read from.
    stubWorkspaceServer({
      context: namedWorkspaceContext(allWatchPermissions),
    });

    await renderAdministration();

    // The three access panels now paint their own surface on the first render
    // and fill in as their reads arrive (T11, CR-AC-08), so awaiting one of
    // them no longer waits for anything. The Warehouses list is what the
    // selected panel is read from, so it is what this case awaits.
    const selected = await screen.findByRole('tabpanel');
    expect(
      await within(selected).findByRole('list', { name: 'Warehouses' }),
    ).toBeInTheDocument();

    const unselected = [
      screen.getByRole('region', { name: 'Workspace roles' }),
      screen.getByRole('region', { name: 'Workspace members' }),
      screen.getByRole('region', { name: 'Workspace permissions' }),
    ];

    // Exactly one panel carries the `tabpanel` role, and it is the selected
    // one — the three force-mounted siblings are present but inert.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(selected).not.toHaveAttribute('inert');
    unselected.forEach((content) => {
      expect(content.closest('[inert]')).not.toBeNull();
    });
  });
});
