import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workspaceContextApi } from 'shared/api/workspace-context-api';
import { ROUTES } from 'shared/constants/routes';
import { WarehouseSwitcher } from 'shared/layouts/WarehouseSwitcher';
import { makeStore } from 'store';

import type { UserEvent } from '@testing-library/user-event';
import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import type { WorkspacePermissionId as WorkspacePermissionIdType } from '@warehouser/shared-types/enums';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { ReactElement } from 'react';
import type { AppStore } from 'store';

// T9 / change-request:workspace-warehouse — the grouped context switcher
// (spec.md CR-AC-01–CR-AC-04, CR-RG-02, CR-RG-03; sad.md §6.3; approved frame
// `Shell / Context Switcher / States / v1` (`Qa6Z3`)).
//
// The control is navigation, not mutation: every row is a destination, the
// stored-selection write lives in `useRecordWarehouseEntry` (T8), and the row
// marked current comes from the entered route — never from
// `effectiveWarehouseId` (CR-AC-09).

const workspaceId = '00000000-0000-4000-8000-000000000001';
const roleId = '00000000-0000-4000-8000-000000000099';
const centralId = '00000000-0000-4000-8000-000000000010';
const northId = '00000000-0000-4000-8000-000000000011';
const oldDepotId = '00000000-0000-4000-8000-000000000012';

const centralEntry: WorkspaceContext['warehouses'][number] = {
  warehouseId: centralId,
  name: 'Central DC',
  archivedAt: null,
  roleId,
  roleKind: 'warehouse_manager',
};

const northEntry: WorkspaceContext['warehouses'][number] = {
  warehouseId: northId,
  name: 'North Hub',
  archivedAt: null,
  roleId,
  roleKind: 'custom',
};

const archivedOldDepotEntry: WorkspaceContext['warehouses'][number] = {
  warehouseId: oldDepotId,
  name: 'Old Depot',
  archivedAt: '2026-08-01T09:00:00.000Z',
  roleId,
  roleKind: 'custom',
};

const liveOldDepotEntry: WorkspaceContext['warehouses'][number] = {
  ...archivedOldDepotEntry,
  archivedAt: null,
};

type ContextOverrides = {
  effectiveWarehouseId?: string | null;
  warehouses?: WorkspaceContext['warehouses'];
  workspaceName?: string | null;
  workspacePermissionIds?: WorkspacePermissionIdType[];
};

const buildContext = ({
  effectiveWarehouseId = null,
  warehouses = [centralEntry, northEntry, archivedOldDepotEntry],
  workspaceName = null,
  workspacePermissionIds = [WorkspacePermissionId.WAREHOUSES_WATCH],
}: ContextOverrides = {}): WorkspaceContext => ({
  workspace: { id: workspaceId, name: workspaceName },
  workspacePermissionIds,
  warehouses,
  effectiveWarehouseId,
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

const stubFetchSequence = (
  ...responses: Array<() => Response>
): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn();
  for (const factory of responses) {
    fetchMock.mockImplementationOnce(() => Promise.resolve(factory()));
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

type SwitcherHarness = {
  currentPath: () => string;
  store: AppStore;
};

/**
 * Renders the switcher from the ROOT route — an ancestor of the Warehouse
 * match, exactly as `RootLayout` does — so the current-row marking is read
 * from the matched route tree rather than from any state the component owns.
 */
const renderSwitcherAt = (
  initialPath: string,
  options: { store?: AppStore; verdict?: WarehouseEntryVerdict } = {},
): SwitcherHarness => {
  const store = options.store ?? makeStore();
  const rootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: (): ReactElement => (
      <>
        <WarehouseSwitcher />
        <Outlet />
      </>
    ),
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.HOME,
    component: (): ReactElement => <p>home</p>,
  });
  const workspaceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WORKSPACE,
    component: (): ReactElement => <p>workspace view</p>,
  });
  const warehouseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: ({ params }): WarehouseEntryVerdict =>
      options.verdict ?? { status: 'entered', warehouseId: params.warehouseId },
    component: (): ReactElement => <Outlet />,
  });
  const warehouseIndexRoute = createRoute({
    getParentRoute: () => warehouseRoute,
    path: '/',
    component: (): ReactElement => <p>warehouse view</p>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      workspaceRoute,
      warehouseRoute.addChildren([warehouseIndexRoute]),
    ]),
    context: { store },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return {
    currentPath: () => router.state.location.pathname,
    store,
  };
};

const openSwitcher = async (user: UserEvent): Promise<HTMLElement> => {
  await user.click(
    await screen.findByRole('button', { name: /context switcher/iu }),
  );
  return screen.findByRole('listbox');
};

const warehousePath = (warehouseId: string): string =>
  `/warehouses/${warehouseId}`;

describe('WarehouseSwitcher — grouped structure (CR-AC-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('presents one Workspace row above a labelled group of the memberships (Qa6Z3)', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ workspaceName: 'Acme Logistics' })),
    );
    const user = userEvent.setup();
    renderSwitcherAt(warehousePath(centralId));

    const listbox = await openSwitcher(user);
    const workspaceGroup = within(listbox).getByRole('group', {
      name: 'Workspace',
    });
    const warehouseGroup = within(listbox).getByRole('group', {
      name: 'Warehouses',
    });

    const workspaceRows = within(workspaceGroup).getAllByRole('option');
    expect(workspaceRows).toHaveLength(1);
    expect(workspaceRows[0]).toHaveAccessibleName(/acme logistics/iu);

    expect(
      within(warehouseGroup)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      expect.stringContaining('Central DC'),
      expect.stringContaining('North Hub'),
      expect.stringContaining('Old Depot'),
    ]);

    // The single Workspace row sits above every Warehouse row.
    expect(within(listbox).getAllByRole('option')[0]).toBe(workspaceRows[0]);
  });

  it('labels the unnamed Workspace with the unnamed-Workspace placeholder', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ workspaceName: null })),
    );
    const user = userEvent.setup();
    renderSwitcherAt(warehousePath(centralId));

    const listbox = await openSwitcher(user);
    expect(
      within(listbox).getByRole('option', { name: /untitled workspace/iu }),
    ).toBeInTheDocument();
  });

  it('names the trigger for the entered context, and for no context, without disagreeing with it', async () => {
    stubFetchSequence(
      () => jsonResponse(buildContext()),
      () => jsonResponse(buildContext()),
    );
    renderSwitcherAt(warehousePath(centralId));

    expect(
      await screen.findByRole('button', { name: /context switcher/iu }),
    ).toHaveAccessibleName('Context switcher, Central DC');

    cleanup();
    renderSwitcherAt(ROUTES.HOME);

    expect(
      await screen.findByRole('button', { name: /context switcher/iu }),
    ).toHaveAccessibleName('Context switcher, choose a context');
  });

  it('renders the group labels as non-focusable section headers, never as rows', async () => {
    stubFetchSequence(() => jsonResponse(buildContext()));
    const user = userEvent.setup();
    renderSwitcherAt(warehousePath(centralId));

    const listbox = await openSwitcher(user);
    expect(
      within(listbox).queryByRole('option', { name: 'Warehouses' }),
    ).not.toBeInTheDocument();

    const header = within(listbox).getByText('Warehouses');
    expect(header).not.toHaveAttribute('tabindex');
    expect(header.closest('[role="option"]')).toBeNull();
  });
});

describe('WarehouseSwitcher — rows are destinations (CR-AC-02)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enters the Workspace view when the Workspace row is chosen, closing the popover', async () => {
    stubFetchSequence(() => jsonResponse(buildContext()));
    const user = userEvent.setup();
    const harness = renderSwitcherAt(warehousePath(centralId));

    const listbox = await openSwitcher(user);
    await user.click(
      within(listbox).getByRole('option', { name: /untitled workspace/iu }),
    );

    await waitFor(() => expect(harness.currentPath()).toBe(ROUTES.WORKSPACE));
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    );
  });

  it('enters that Warehouse view when a Warehouse row is chosen, closing the popover', async () => {
    stubFetchSequence(() => jsonResponse(buildContext()));
    const user = userEvent.setup();
    const harness = renderSwitcherAt(ROUTES.HOME);

    const listbox = await openSwitcher(user);
    await user.click(
      within(listbox).getByRole('option', { name: /north hub/iu }),
    );

    await waitFor(() =>
      expect(harness.currentPath()).toBe(warehousePath(northId)),
    );
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    );
  });

  it('requests no credential and writes no stored selection when a row is chosen', async () => {
    const fetchMock = stubFetchSequence(() => jsonResponse(buildContext()));
    const user = userEvent.setup();
    renderSwitcherAt(ROUTES.HOME);

    const listbox = await openSwitcher(user);
    await user.click(
      within(listbox).getByRole('option', { name: /north hub/iu }),
    );

    await waitFor(() =>
      expect(screen.getByText('warehouse view')).toBeVisible(),
    );
    expect(screen.queryByLabelText(/password/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    for (const [url] of fetchMock.mock.calls as Array<[string]>) {
      expect(url).not.toContain('active-warehouse');
      expect(url).not.toContain('/auth/');
    }
  });
});

describe('WarehouseSwitcher — the inert Workspace row (CR-AC-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const inertCases: Array<[string, WorkspacePermissionIdType[]]> = [
    ['a non-member of the Workspace', []],
    [
      'a Workspace Member holding only Permissions outside the administration set',
      [
        WorkspacePermissionId.WORKSPACE_ROLES_CREATE,
        WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN,
      ],
    ],
  ];

  for (const [actor, workspacePermissionIds] of inertCases) {
    it(`renders the Workspace row inert, disabled and explained for ${actor}`, async () => {
      stubFetchSequence(() =>
        jsonResponse(buildContext({ workspacePermissionIds })),
      );
      const user = userEvent.setup();
      const harness = renderSwitcherAt(warehousePath(centralId));

      const listbox = await openSwitcher(user);
      const workspaceRow = within(listbox).getByRole('option', {
        name: /untitled workspace/iu,
      });

      expect(workspaceRow).toHaveAttribute('aria-disabled', 'true');
      expect(workspaceRow.tagName).not.toBe('A');
      expect(workspaceRow).toHaveTextContent('No access');
      expect(workspaceRow).toHaveTextContent(
        'You do not have access to the workspace.',
      );

      await user.click(workspaceRow);
      expect(harness.currentPath()).toBe(warehousePath(centralId));

      workspaceRow.focus();
      await user.keyboard('{Enter}');
      expect(harness.currentPath()).toBe(warehousePath(centralId));

      // The Warehouses stay listed and selectable beneath it.
      expect(
        within(listbox).getByRole('option', { name: /north hub/iu }),
      ).not.toHaveAttribute('aria-disabled', 'true');
    });
  }

  for (const permission of [
    WorkspacePermissionId.WAREHOUSES_WATCH,
    WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
    WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
    WorkspacePermissionId.WORKSPACE_RENAME,
  ]) {
    it(`renders the Workspace row as a live destination for an actor holding ${permission}`, async () => {
      stubFetchSequence(() =>
        jsonResponse(buildContext({ workspacePermissionIds: [permission] })),
      );
      const user = userEvent.setup();
      const harness = renderSwitcherAt(warehousePath(centralId));

      const listbox = await openSwitcher(user);
      const workspaceRow = within(listbox).getByRole('option', {
        name: /untitled workspace/iu,
      });

      expect(workspaceRow).not.toHaveAttribute('aria-disabled', 'true');
      expect(workspaceRow).not.toHaveTextContent('No access');

      await user.click(workspaceRow);
      await waitFor(() => expect(harness.currentPath()).toBe(ROUTES.WORKSPACE));
    });
  }
});

describe('WarehouseSwitcher — archived rows (CR-AC-04, CR-RG-02)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists an archived membership, labels it archived and refuses to enter it', async () => {
    stubFetchSequence(() => jsonResponse(buildContext()));
    const user = userEvent.setup();
    const harness = renderSwitcherAt(ROUTES.HOME);

    const listbox = await openSwitcher(user);
    const archivedRow = within(listbox).getByRole('option', {
      name: /old depot/iu,
    });

    expect(archivedRow).toHaveTextContent('Archived');
    expect(archivedRow).toHaveAttribute('aria-disabled', 'true');
    expect(archivedRow).toHaveAttribute('data-disabled', 'true');

    await user.click(archivedRow);
    expect(harness.currentPath()).toBe(ROUTES.HOME);
  });
});

describe('WarehouseSwitcher — current-row marking (CR-AC-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks the entered Warehouse with an indicator and the word Current, not colour alone', async () => {
    stubFetchSequence(() => jsonResponse(buildContext()));
    const user = userEvent.setup();
    renderSwitcherAt(warehousePath(centralId));

    const listbox = await openSwitcher(user);
    const currentRow = within(listbox).getByRole('option', {
      name: /central dc/iu,
    });

    expect(currentRow).toHaveAttribute('aria-selected', 'true');
    expect(currentRow).toHaveTextContent('Current');
    expect(currentRow.querySelector('svg')).not.toBeNull();
    expect(
      within(listbox).getByRole('option', { name: /north hub/iu }),
    ).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the Workspace row current inside the Workspace view', async () => {
    stubFetchSequence(() => jsonResponse(buildContext()));
    const user = userEvent.setup();
    renderSwitcherAt(ROUTES.WORKSPACE);

    const listbox = await openSwitcher(user);
    const workspaceRow = within(listbox).getByRole('option', {
      name: /untitled workspace/iu,
    });

    expect(workspaceRow).toHaveAttribute('aria-selected', 'true');
    expect(workspaceRow).toHaveTextContent('Current');
  });

  it('marks no row at the root, even when a stored selection names a live membership', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ effectiveWarehouseId: centralId })),
    );
    const user = userEvent.setup();
    renderSwitcherAt(ROUTES.HOME);

    const listbox = await openSwitcher(user);
    for (const option of within(listbox).getAllByRole('option')) {
      expect(option).toHaveAttribute('aria-selected', 'false');
    }
    expect(within(listbox).queryByText('Current')).not.toBeInTheDocument();
  });

  it('marks no row around a refusal', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ effectiveWarehouseId: centralId })),
    );
    const user = userEvent.setup();
    renderSwitcherAt(warehousePath(centralId), {
      verdict: {
        status: 'refused',
        reason: 'not-a-member',
        warehouseId: centralId,
      },
    });

    const listbox = await openSwitcher(user);
    for (const option of within(listbox).getAllByRole('option')) {
      expect(option).toHaveAttribute('aria-selected', 'false');
    }
  });
});

describe('WarehouseSwitcher — the three retained messages (CR-RG-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the never-chosen message beside the control, which stays reachable', async () => {
    stubFetchSequence(() => jsonResponse(buildContext()));
    const user = userEvent.setup();
    renderSwitcherAt(ROUTES.HOME);

    expect(
      await screen.findByRole('heading', {
        name: 'Choose a warehouse to work in',
      }),
    ).toBeInTheDocument();

    const listbox = await openSwitcher(user);
    expect(
      within(listbox).getByRole('option', { name: /north hub/iu }),
    ).toBeInTheDocument();
  });

  it('renders the nothing-available message, and no invented action, when no row is selectable (CR-AC-18)', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ warehouses: [archivedOldDepotEntry] })),
    );
    const user = userEvent.setup();
    renderSwitcherAt(ROUTES.HOME);

    expect(
      await screen.findByRole('heading', {
        name: 'No warehouse is available to you',
      }),
    ).toBeInTheDocument();

    const listbox = await openSwitcher(user);
    expect(
      within(listbox).getByRole('option', { name: /old depot/iu }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.queryByRole('button', { name: 'Choose warehouse' }),
    ).not.toBeInTheDocument();
  });

  it('renders the selection-ended message beside the control, naming the remembered Warehouse', async () => {
    const store = makeStore();
    const fetchMock = stubFetchSequence(
      () =>
        jsonResponse(
          buildContext({
            effectiveWarehouseId: oldDepotId,
            warehouses: [centralEntry, liveOldDepotEntry],
          }),
        ),
      () =>
        jsonResponse(
          buildContext({
            effectiveWarehouseId: null,
            warehouses: [centralEntry],
          }),
        ),
    );
    renderSwitcherAt(ROUTES.HOME, { store });

    await screen.findByRole('button', { name: /context switcher/iu });
    store.dispatch(
      workspaceContextApi.util.invalidateTags(['WorkspaceContext']),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(
      await screen.findByRole('alert', {
        name: /old depot is no longer available to you/iu,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /context switcher/iu }),
    ).toBeInTheDocument();
  });

  it('shows no retained message inside an entered Warehouse whose entry write never landed', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ effectiveWarehouseId: null })),
    );
    const user = userEvent.setup();
    renderSwitcherAt(warehousePath(centralId));

    const listbox = await openSwitcher(user);
    expect(
      within(listbox).getByRole('option', { name: /central dc/iu }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.queryByRole('heading', {
        name: 'Choose a warehouse to work in',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'No warehouse is available to you',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows no retained message inside the Workspace view', async () => {
    stubFetchSequence(() =>
      jsonResponse(buildContext({ effectiveWarehouseId: null })),
    );
    renderSwitcherAt(ROUTES.WORKSPACE);

    await screen.findByRole('button', { name: /context switcher/iu });
    expect(
      screen.queryByRole('heading', {
        name: 'Choose a warehouse to work in',
      }),
    ).not.toBeInTheDocument();
  });
});
