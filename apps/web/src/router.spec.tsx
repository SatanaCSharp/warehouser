import { RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import remove from 'lodash/remove';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from 'router';
import { workspaceContextApi } from 'shared/api/workspace-context-api';
import { ROUTES } from 'shared/constants/routes';
import { makeStore } from 'store';

import type { AppRouter } from 'router';
import type { AppStore } from 'store';

const toast = vi.hoisted(() => {
  const fn = vi.fn(() => 'pending-key');
  return Object.assign(fn, {
    // `alertApiFailure` keeps a failure code in its dedupe registry until the
    // queue reports that toast closed. Nothing renders a toast here, so close
    // each one on the spot and let every scenario observe its own failure.
    danger: vi.fn((_message: unknown, options?: { onClose?: () => void }) => {
      options?.onClose?.();
      return 'toast-key';
    }),
    success: vi.fn(() => 'toast-key'),
    close: vi.fn(),
  });
});

vi.mock('shared/alerts/toast', () => ({ toast }));

type RenderedRoute = { router: AppRouter; store: AppStore };

const readableAccess = {
  warehouseId: '00000000-0000-4000-8000-000000000002',
  roleId: '00000000-0000-4000-8000-000000000003',
  roleKind: 'custom',
  permissionIds: ['ROLES:WATCH'],
  archivedAt: null,
} as const;

// T6 / CH-03 — the access surface is a child of the Warehouse layout, so every
// case that opens it names the Warehouse it is opening in the address.
const accessAddress = (
  warehouseId: string = readableAccess.warehouseId,
): string => `/warehouses/${warehouseId}/access`;

// T6 / CR-AC-07 — reaching a Warehouse address at all requires a membership in
// the addressed Warehouse, which the actor context is the sole source of.
const membershipsIn = (
  ...warehouseIds: readonly string[]
): Record<string, unknown>[] =>
  warehouseIds.map((warehouseId, index) => ({
    warehouseId,
    name: `Warehouse ${index + 1}`,
    archivedAt: null,
    roleId: readableAccess.roleId,
    roleKind: 'custom',
  }));

// The authenticated shell reads the Workspace actor context to decide whether
// the Workspace navigation entry exists at all (AC-30). That read is not one
// of the datasets the access cases below are about, so answer it out of band
// and let each of them keep its own ordered request script.
const withWorkspaceContext = (
  requestScript: ReturnType<typeof vi.fn>,
  workspacePermissionIds: readonly WorkspacePermissionId[] = [],
  effectiveWarehouseId: string | null = null,
  warehouses: readonly Record<string, unknown>[] = [],
): ReturnType<typeof vi.fn> =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/api/v1/workspace/context')) {
      return Promise.resolve(
        Response.json({
          workspace: {
            id: '00000000-0000-4000-8000-000000000020',
            name: 'Acme Logistics',
          },
          workspacePermissionIds,
          warehouses,
          effectiveWarehouseId,
        }),
      );
    }
    return requestScript(input, init) as Promise<Response>;
  });

const renderRoute = (initialEntry: string): RenderedRoute => {
  const store = makeStore();
  const router = createAppRouter({
    appStore: store,
    initialEntries: [initialEntry],
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return { router, store };
};

// The route suite deliberately keeps complete authenticated and anonymous
// journeys together so each assertion uses the same production router harness.
// eslint-disable-next-line max-lines-per-function
describe('router', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders LoginForm at /login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    renderRoute('/login');

    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('renders the approved create-account flow at /sign-up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    renderRoute('/sign-up');

    expect(
      await screen.findByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('loads only role-authorized access datasets at the Warehouse access address', async () => {
    // Routed by path rather than by call order: which datasets are requested is
    // the contract here, not the order the workspace's tabs happen to ask for
    // them in.
    const responsesByPath: [string, unknown][] = [
      [
        '/auth/session',
        { user: { id: '00000000-0000-4000-8000-000000000001' } },
      ],
      [
        '/workspace/context',
        {
          workspace: {
            id: '00000000-0000-4000-8000-000000000020',
            name: 'Acme Logistics',
          },
          workspacePermissionIds: [],
          warehouses: membershipsIn(readableAccess.warehouseId),
          effectiveWarehouseId: null,
        },
      ],
      [
        '/access/current',
        {
          warehouseId: '00000000-0000-4000-8000-000000000002',
          roleId: '00000000-0000-4000-8000-000000000003',
          roleKind: 'custom',
          permissionIds: ['ROLES:WATCH'],
          archivedAt: null,
        },
      ],
      [
        '/access/roles',
        {
          items: [
            {
              id: '00000000-0000-4000-8000-000000000003',
              name: 'Operators',
              assignedMemberCount: 0,
              kind: 'custom',
              permissionIds: ['ROLES:WATCH'],
            },
          ],
          hasNext: false,
          hasPrev: false,
          nextCursor: null,
        },
      ],
      [
        '/access/permissions',
        {
          items: [
            { id: 'ROLES:WATCH', label: 'View roles', kind: 'assignable' },
          ],
          hasNext: false,
          hasPrev: false,
          nextCursor: null,
        },
      ],
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      const route = responsesByPath.find(([path]) => url.includes(path));
      return Promise.resolve(
        route ? Response.json(route[1]) : Response.json({}, { status: 404 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute(accessAddress());

    expect(
      await screen.findByRole('heading', { name: 'Access' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Roles' })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Permissions' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Members' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('Operators')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/members'),
      expect.anything(),
    );
  });

  it('refetches current access and removes stale controls after a mutation denial', async () => {
    const user = userEvent.setup();
    let currentReads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input;
      if (url.endsWith('/api/v1/auth/session')) {
        return Promise.resolve(
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000001' },
          }),
        );
      }
      if (url.includes('/api/v1/workspace/context')) {
        return Promise.resolve(
          Response.json({
            workspace: {
              id: '00000000-0000-4000-8000-000000000020',
              name: 'Acme Logistics',
            },
            workspacePermissionIds: [],
            warehouses: membershipsIn(readableAccess.warehouseId),
            effectiveWarehouseId: null,
          }),
        );
      }
      if (url.endsWith('/access/current')) {
        currentReads += 1;
        return Promise.resolve(
          Response.json({
            ...readableAccess,
            permissionIds: currentReads === 1 ? ['ROLES:CREATE'] : [],
          }),
        );
      }
      if (url.endsWith('/access/roles') && init?.method === 'POST') {
        return Promise.resolve(
          Response.json(
            { code: 'access.denied', message: 'Access denied' },
            { status: 403 },
          ),
        );
      }
      if (url.endsWith('/access/roles')) {
        return Promise.resolve(
          Response.json({
            items: [
              {
                id: readableAccess.roleId,
                name: 'Operators',
                assignedMemberCount: 0,
                kind: 'custom',
                permissionIds: [],
              },
            ],
            hasNext: false,
            hasPrev: false,
            nextCursor: null,
          }),
        );
      }
      if (url.endsWith('/access/permissions')) {
        return Promise.resolve(
          Response.json({
            items: [],
            hasNext: false,
            hasPrev: false,
            nextCursor: null,
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute(accessAddress());
    await user.click(
      await screen.findByRole('button', { name: 'Create role' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Create role' });
    await user.type(within(dialog).getByLabelText('Role name'), 'Auditor');
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }));

    expect(await screen.findByText('Access unavailable')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create role' }),
    ).not.toBeInTheDocument();
    expect(toast.danger).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(currentReads).toBeGreaterThan(1);
  });

  it('does not request or render protected access datasets without read permission', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          user: { id: '00000000-0000-4000-8000-000000000001' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          warehouseId: '00000000-0000-4000-8000-000000000002',
          roleId: '00000000-0000-4000-8000-000000000003',
          roleKind: 'custom',
          permissionIds: [],
          archivedAt: null,
        }),
      );
    vi.stubGlobal(
      'fetch',
      withWorkspaceContext(
        fetchMock,
        [],
        null,
        membershipsIn(readableAccess.warehouseId),
      ),
    );

    renderRoute(accessAddress());

    expect(
      await screen.findByRole('heading', { name: 'Access unavailable' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole('link', { name: 'Access' }),
    ).not.toBeInTheDocument();
  });

  it('loads only member-authorized data when the user has USERS:WATCH', async () => {
    const memberId = '00000000-0000-4000-8000-000000000004';
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input;
      if (url.endsWith('/api/v1/auth/session')) {
        return Promise.resolve(
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000001' },
          }),
        );
      }
      if (url.includes('/api/v1/workspace/context')) {
        return Promise.resolve(
          Response.json({
            workspace: {
              id: '00000000-0000-4000-8000-000000000020',
              name: 'Acme Logistics',
            },
            workspacePermissionIds: [],
            warehouses: membershipsIn(readableAccess.warehouseId),
            effectiveWarehouseId: null,
          }),
        );
      }
      if (url.endsWith('/access/current')) {
        return Promise.resolve(
          Response.json({ ...readableAccess, permissionIds: ['USERS:WATCH'] }),
        );
      }
      // Members' Role-name lookup loads Roles even without a role-admin
      // Permission (US-07) — the Members tab is not gated on that request.
      if (url.endsWith('/access/roles')) {
        return Promise.resolve(
          Response.json({
            items: [],
            hasNext: false,
            hasPrev: false,
            nextCursor: null,
          }),
        );
      }
      if (url.endsWith('/access/members')) {
        return Promise.resolve(
          Response.json({
            items: [
              {
                userId: memberId,
                roleId: '00000000-0000-4000-8000-000000000003',
                roleKind: 'custom',
                email: 'member@example.test',
              },
            ],
            hasNext: false,
            hasPrev: false,
            nextCursor: null,
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute(accessAddress());

    expect(
      await screen.findByRole('heading', { name: 'Access' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Members' })).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Roles' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Permissions' }),
    ).not.toBeInTheDocument();
    // The approved Members list (email + search), not the raw-UUID dataset
    // card (AC-09/10 adjacent — sad.md §6.5).
    expect(await screen.findByLabelText('Search members')).toBeInTheDocument();
    expect(screen.getByText('member@example.test')).toBeInTheDocument();
    expect(screen.queryByText(memberId)).not.toBeInTheDocument();
  });

  it('creates an account, authenticates the linked user, and enters home', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          // AC-01 — registration answers with the whole bootstrap outcome,
          // not just the identity and its Warehouse access.
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000012' },
            workspace: {
              id: '00000000-0000-4000-8000-000000000015',
              name: null,
            },
            workspacePermissionIds: ['WORKSPACE:RENAME', 'WAREHOUSES:CREATE'],
            access: {
              warehouseId: '00000000-0000-4000-8000-000000000013',
              roleId: '00000000-0000-4000-8000-000000000014',
              roleKind: 'warehouse_manager',
              permissionIds: ['ROLES:WATCH'],
              archivedAt: null,
            },
            effectiveWarehouseId: '00000000-0000-4000-8000-000000000013',
          }),
        )
        .mockResolvedValueOnce(Response.json(readableAccess)),
    );
    const user = userEvent.setup();
    const { router, store } = renderRoute('/sign-up');

    await user.type(await screen.findByLabelText('Email'), 'new@example.test');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.type(screen.getByLabelText('Warehouse name'), 'Main Warehouse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(store.getState().auth).toEqual({
      status: 'authenticated',
      user: { id: '00000000-0000-4000-8000-000000000012' },
    });
  });

  it('keeps duplicate sign-up anonymous and offers sign-in', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          Response.json(
            {
              code: 'auth.email_already_registered',
              message: 'This email is already registered.',
            },
            { status: 409 },
          ),
        ),
    );
    const user = userEvent.setup();
    const { router, store } = renderRoute('/sign-up');

    await user.type(
      await screen.findByLabelText('Email'),
      'existing@example.test',
    );
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.type(screen.getByLabelText('Warehouse name'), 'Main Warehouse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('This email is already registered.'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Sign in instead' }),
    ).toHaveAttribute('href', '/login');
    expect(router.state.location.pathname).toBe('/sign-up');
    expect(store.getState().auth.status).toBe('anonymous');
  });

  it('redirects anonymous users from the protected home route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    const { router } = renderRoute('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(
      await screen.findByText('Your session ended. Sign in again to continue.'),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Sign in to your account' }),
    ).toHaveFocus();
  });

  it('updates RTK auth state and enters the protected route after sign-in without a success toast', async () => {
    // T7 — the actor holds no administration authority and the derivation
    // names no Warehouse, so landing reaches CR-AC-08 rule (3).
    vi.stubGlobal(
      'fetch',
      withWorkspaceContext(
        vi
          .fn()
          .mockResolvedValueOnce(new Response(null, { status: 204 }))
          .mockResolvedValueOnce(
            Response.json({
              user: { id: '00000000-0000-4000-8000-000000000001' },
            }),
          ),
      ),
    );
    const user = userEvent.setup();
    const { router, store } = renderRoute('/login');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /sign in/iu }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(store.getState().auth).toEqual({
      status: 'authenticated',
      user: { id: '00000000-0000-4000-8000-000000000001' },
    });
    // CR-AC-08 rule (3) / CR-AC-18 — the actor remains at the root, which
    // renders the no-context state.
    expect(
      await screen.findByText('Nothing is entered yet'),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown email', 'unknown@example.com'],
    ['incorrect password', 'jane@example.com'],
  ])('shows the same generic failure for %s', async (_scenario, email) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          Response.json(
            {
              code: 'auth.invalid_credentials',
              message: 'Invalid credentials.',
            },
            { status: 401 },
          ),
        ),
    );
    const user = userEvent.setup();
    const { router, store } = renderRoute('/login');

    await user.type(await screen.findByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Password'), 'wrong password');
    await user.click(screen.getByRole('button', { name: /sign in/iu }));

    await waitFor(() =>
      expect(toast.danger).toHaveBeenCalledWith(
        'The email or password is incorrect.',
        expect.any(Object),
      ),
    );
    expect(router.state.location.pathname).toBe('/login');
    expect(store.getState().auth.status).toBe('anonymous');
  });

  it('revokes the current session before feedback and Visitor navigation', async () => {
    let resolveSignOut: ((response: Response) => void) | undefined;
    // T6 / CR-AC-06 — `/` is outside every Warehouse view, so no access
    // projection is read there any more: the script is sign-in, session,
    // sign-out.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          user: { id: '00000000-0000-4000-8000-000000000001' },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSignOut = resolve;
          }),
      );
    vi.stubGlobal('fetch', withWorkspaceContext(fetchMock));
    const user = userEvent.setup();
    const { router, store } = renderRoute('/login');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.click(screen.getByRole('button', { name: /sign in/iu }));
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(store.getState().auth.status).toBe('authenticated');
    expect(router.state.location.pathname).toBe('/');
    expect(toast.success).not.toHaveBeenCalled();

    resolveSignOut?.(new Response(null, { status: 204 }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(store.getState().auth.status).toBe('anonymous');
    expect(toast.success).toHaveBeenCalledWith('You have signed out.');
  });

  it('waits for restoration and admits a valid session to the protected route', async () => {
    let resolveSession: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveSession = resolve;
        }),
    );
    vi.stubGlobal('fetch', withWorkspaceContext(fetchMock));
    const { router, store } = renderRoute('/');

    expect(store.getState().auth.status).toBe('unknown');
    expect(
      screen.queryByText('Nothing is entered yet'),
    ).not.toBeInTheDocument();

    resolveSession?.(
      Response.json({
        user: { id: '00000000-0000-4000-8000-000000000001' },
      }),
    );

    // T4 — `/` renders the no-context state block rather than a dashboard
    // (CH-03); the landing rules that would resolve an actor into a
    // Warehouse or Workspace view are T7's.
    expect(
      await screen.findByText('Nothing is entered yet'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(store.getState().auth.status).toBe('authenticated');
    // T6 / CR-AC-06 — the session restore is the ONLY request the root makes:
    // outside a Warehouse view there is no addressed Warehouse, so no access
    // projection is read. (The actor-context read is answered out of band by
    // `withWorkspaceContext` and never reaches this script.)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  // AC-30: a User with no Workspace capability in their own Workspace —
  // including a Warehouse Member who is not a Workspace Member at all — must
  // never reach the Workspace destination, and the Sidebar must never expose
  // it as a control. Route visibility is advisory (design-handoff.md
  // §Implementation constraints); the redirect proves the web omits the
  // unusable destination rather than rendering it disabled or empty.
  const stubWorkspaceRouteFetch = (
    workspacePermissionIds: readonly WorkspacePermissionId[],
  ): ReturnType<typeof vi.fn> =>
    vi.fn((input: RequestInfo | URL) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input;
      if (url.endsWith('/api/v1/auth/session')) {
        return Promise.resolve(
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000001' },
          }),
        );
      }
      if (url.endsWith('/api/v1/access/current')) {
        return Promise.resolve(
          Response.json({ ...readableAccess, permissionIds: [] }),
        );
      }
      if (url.includes('/api/v1/workspace/context')) {
        return Promise.resolve(
          Response.json({
            workspace: {
              id: '00000000-0000-4000-8000-000000000020',
              name: 'Acme Logistics',
            },
            workspacePermissionIds,
            warehouses: [],
            effectiveWarehouseId: null,
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

  it('redirects a direct navigation to the Workspace route when the actor holds no Workspace capability (AC-30)', async () => {
    vi.stubGlobal('fetch', stubWorkspaceRouteFetch([]));

    const { router } = renderRoute(ROUTES.WORKSPACE);

    await waitFor(() =>
      expect(router.state.location.pathname).not.toBe(ROUTES.WORKSPACE),
    );
    expect(router.state.location.pathname).toBe(ROUTES.HOME);
  });

  it('omits the Workspace Sidebar entry and never renders the destination when the actor holds no Workspace capability (AC-30)', async () => {
    vi.stubGlobal('fetch', stubWorkspaceRouteFetch([]));

    renderRoute(ROUTES.HOME);

    // T10 / CR-AC-18 — this actor reaches CR-AC-08 rule (3) and stays at the
    // root, where the sidebar renders no navigation list at all. AC-30's
    // guarantee therefore holds a fortiori: there is no Workspace entry to
    // present, and the destination itself is never rendered.
    await screen.findByText('Nothing is entered yet');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Workspace' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Acme Logistics')).not.toBeInTheDocument();
  });

  it('admits a direct navigation to the Workspace route when the actor holds any Workspace watch capability', async () => {
    vi.stubGlobal(
      'fetch',
      stubWorkspaceRouteFetch([WorkspacePermissionId.WAREHOUSES_WATCH]),
    );

    const { router } = renderRoute(ROUTES.WORKSPACE);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ROUTES.WORKSPACE),
    );
    expect(await screen.findByText('Acme Logistics')).toBeInTheDocument();
  });

  // AC-29 + AC-30: `WORKSPACE:RENAME` is a Workspace capability of this same
  // destination — the naming control lives in its header, next to the tabs.
  // A custom Workspace Role holding only that Permission must therefore reach
  // the destination and be offered the control; redirecting it away would
  // leave the member holding a Permission they can never exercise.
  it('admits a direct navigation to the Workspace route, and offers the naming control, when the actor holds only WORKSPACE:RENAME (AC-29, AC-30)', async () => {
    vi.stubGlobal(
      'fetch',
      stubWorkspaceRouteFetch([WorkspacePermissionId.WORKSPACE_RENAME]),
    );

    const { router } = renderRoute(ROUTES.WORKSPACE);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ROUTES.WORKSPACE),
    );
    expect(
      await screen.findByRole('button', { name: /rename workspace/iu }),
    ).toBeInTheDocument();
  });

  it('offers the Workspace Sidebar entry when the actor holds only WORKSPACE:RENAME (AC-30)', async () => {
    vi.stubGlobal(
      'fetch',
      stubWorkspaceRouteFetch([WorkspacePermissionId.WORKSPACE_RENAME]),
    );

    renderRoute(ROUTES.HOME);

    expect(
      await screen.findByRole('link', { name: 'Workspace' }),
    ).toHaveAttribute('href', ROUTES.WORKSPACE);
  });
});

// T4 / ADR 0001 — the Warehouse layout route. `sad.md` §11 requires three
// TanStack Router v1 behaviors to be pinned by tests before anything is
// built on them: a parent `beforeLoad`'s return value reaching the match
// context, `beforeLoad` not re-running while navigating between the
// layout's own children, and the `$` splat ranking below the layout's
// explicit children. Each is called out below at the test that pins it.
//
// Kept as one suite for the same reason `describe('router')` above is: each
// case must exercise the real production route tree through `renderRoute`, and
// the shared Warehouse fixtures below are what make the entry verdicts
// comparable across them.
// eslint-disable-next-line max-lines-per-function
describe('Warehouse layout route (T4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const MEMBER_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000040';
  const ARCHIVED_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000041';
  const NON_MEMBER_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000099';

  type FixtureWarehouse = {
    warehouseId: string;
    name: string;
    archivedAt: string | null;
  };

  const stubWarehouseFetch = (
    warehouses: readonly FixtureWarehouse[],
  ): ReturnType<typeof vi.fn> =>
    vi.fn((input: RequestInfo | URL) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input;
      if (url.endsWith('/api/v1/auth/session')) {
        return Promise.resolve(
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000001' },
          }),
        );
      }
      if (url.includes('/api/v1/workspace/context')) {
        return Promise.resolve(
          Response.json({
            workspace: {
              id: '00000000-0000-4000-8000-000000000020',
              name: 'Acme Logistics',
            },
            workspacePermissionIds: [],
            warehouses: warehouses.map((warehouse) => ({
              ...warehouse,
              roleId: '00000000-0000-4000-8000-000000000030',
              roleKind: 'custom',
            })),
            effectiveWarehouseId: null,
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

  // Pins TanStack behavior #1: a parent `beforeLoad`'s return value reaches
  // the match context. `WarehouseLayout` renders `<Outlet />` only when it
  // reads `status: 'entered'` from that context, so the dashboard rendering
  // at all is proof the verdict `warehouseRoute.beforeLoad` returned reached
  // its component. `DesignSystemExample` moved unchanged from
  // `modules/home/components/` renders here.
  it("publishes the parent beforeLoad's verdict into the match context and enters for a live membership", async () => {
    vi.stubGlobal(
      'fetch',
      stubWarehouseFetch([
        { warehouseId: MEMBER_WAREHOUSE_ID, name: 'Main', archivedAt: null },
      ]),
    );

    const { router } = renderRoute(`/warehouses/${MEMBER_WAREHOUSE_ID}`);

    expect(
      await screen.findByText('Design System Preview'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/warehouses/${MEMBER_WAREHOUSE_ID}`,
    );
  });

  // CR-AC-05 / CR-AC-07 — the address determines the Warehouse, so moving
  // from an entered Warehouse to one the actor holds no membership in must
  // re-resolve entry rather than carry the first verdict over. This is the
  // security-critical companion to the `cause: 'stay'` preservation below:
  // changing `:warehouseId` is a different match (`cause: 'enter'`), so the
  // verdict is recomputed; only navigation *within* one Warehouse preserves
  // it. Without this test, preserving the verdict on 'stay' could silently
  // admit an actor to W2 on W1's membership.
  it('re-resolves entry when :warehouseId changes, refusing a non-member moved to from an entered Warehouse', async () => {
    vi.stubGlobal(
      'fetch',
      stubWarehouseFetch([
        { warehouseId: MEMBER_WAREHOUSE_ID, name: 'Main', archivedAt: null },
      ]),
    );

    const { router } = renderRoute(`/warehouses/${MEMBER_WAREHOUSE_ID}`);
    expect(
      await screen.findByText('Design System Preview'),
    ).toBeInTheDocument();

    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE,
        params: { warehouseId: NON_MEMBER_WAREHOUSE_ID },
      });
    });

    expect(
      await screen.findByText("This address isn't available to you"),
    ).toBeInTheDocument();
    expect(screen.queryByText('Design System Preview')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/warehouses/${NON_MEMBER_WAREHOUSE_ID}`,
    );
  });

  // CR-AC-07 — refused at the requested address: no redirect, no navigation
  // list, and no Warehouse content around the refusal.
  it('refuses a non-member in place at the requested address, rendering no Warehouse content', async () => {
    vi.stubGlobal('fetch', stubWarehouseFetch([]));

    const { router } = renderRoute(`/warehouses/${NON_MEMBER_WAREHOUSE_ID}`);

    expect(
      await screen.findByText("This address isn't available to you"),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/warehouses/${NON_MEMBER_WAREHOUSE_ID}`,
    );
    // The Warehouse-view sidebar (CR-AC-11) is out of T4's scope; the
    // shell's own `Sidebar` still renders its unconditional Dashboard link
    // to `/` regardless of context. What T4 owns is that no Warehouse
    // content renders around the refusal.
    expect(screen.queryByText('Design System Preview')).not.toBeInTheDocument();
  });

  // Pins TanStack behavior #3: the `$` splat ranks below the layout's
  // explicit children, so `/warehouses/:id/anything` still matches the
  // layout route (and its splat child) rather than the root splat — the
  // structural reason CR-AC-07 precedes CR-AC-16 (ADR 0001). Refused here
  // too, at the deeper address, never reaching not-found handling.
  it('refuses an address beneath a non-member warehouse identically, never reaching unmatched-address handling', async () => {
    vi.stubGlobal('fetch', stubWarehouseFetch([]));

    const { router } = renderRoute(
      `/warehouses/${NON_MEMBER_WAREHOUSE_ID}/anything`,
    );

    expect(
      await screen.findByText("This address isn't available to you"),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/warehouses/${NON_MEMBER_WAREHOUSE_ID}/anything`,
    );
  });

  // CR-AC-17 — an archived membership is refused with the explicit archived
  // explanation, distinct from the non-disclosing refusal above.
  it('refuses an archived membership with the explicit archived explanation', async () => {
    vi.stubGlobal(
      'fetch',
      stubWarehouseFetch([
        {
          warehouseId: ARCHIVED_WAREHOUSE_ID,
          name: 'Retired',
          archivedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    const { router } = renderRoute(`/warehouses/${ARCHIVED_WAREHOUSE_ID}`);

    expect(
      await screen.findByText('This warehouse is archived'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/warehouses/${ARCHIVED_WAREHOUSE_ID}`,
    );
  });

  // Same address the splat matched for a non-member above, but the splat
  // does reach an entered member — proving the redirect is scoped to that
  // verdict alone (CR-AC-16's second paragraph: "only a member can ever
  // reach" it) and confirming again that the splat matched rather than the
  // root's default-not-found handling.
  it('redirects an entered member off an unmatched address beneath their own warehouse', async () => {
    vi.stubGlobal(
      'fetch',
      stubWarehouseFetch([
        { warehouseId: MEMBER_WAREHOUSE_ID, name: 'Main', archivedAt: null },
      ]),
    );

    const { router } = renderRoute(
      `/warehouses/${MEMBER_WAREHOUSE_ID}/anything`,
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ROUTES.HOME),
    );
  });

  // Pins TanStack behavior #2: `beforeLoad` does not re-run while
  // navigating between the layout's own children. Mutating the cached
  // Workspace context directly (no network fetch) simulates the membership
  // vanishing without triggering `resolveWarehouseEntry` again; navigating
  // to the splat child (still under the same layout match) must not read
  // that mutation, or the actor would be evicted from a Warehouse they are
  // working in — the load-bearing consequence CR-AC-20 and ADR 0001 record.
  // CR-AC-17 / CR-RG-02 — leaving a Warehouse ends the entry the verdict
  // records. Returning to that same address is a fresh entry and must be
  // resolved fresh: an archived Warehouse is refused "whether from a
  // bookmark, a restored session, or an address that was live when the tab
  // was opened". Preserving the verdict for the life of the session would
  // admit the actor to a Warehouse archived while they were away.
  it('re-resolves entry when the same Warehouse is re-entered after leaving it (CR-AC-17)', async () => {
    vi.stubGlobal(
      'fetch',
      stubWarehouseFetch([
        { warehouseId: MEMBER_WAREHOUSE_ID, name: 'Main', archivedAt: null },
      ]),
    );

    const { router, store } = renderRoute(`/warehouses/${MEMBER_WAREHOUSE_ID}`);
    expect(
      await screen.findByText('Design System Preview'),
    ).toBeInTheDocument();

    await act(async () => {
      await router.navigate({ to: ROUTES.HOME });
    });

    // The Warehouse is archived while the actor is away from it.
    store.dispatch(
      workspaceContextApi.util.updateQueryData(
        'getWorkspaceContext',
        undefined,
        (draft) => {
          const archived = draft.warehouses.find(
            (warehouse) => warehouse.warehouseId === MEMBER_WAREHOUSE_ID,
          );
          if (archived) {
            archived.archivedAt = '2026-08-13T00:00:00.000Z';
          }
        },
      ),
    );

    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE,
        params: { warehouseId: MEMBER_WAREHOUSE_ID },
      });
    });

    expect(
      await screen.findByText('This warehouse is archived'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Design System Preview')).not.toBeInTheDocument();
  });

  it('does not re-run the layout beforeLoad while navigating between its own children (CR-AC-20)', async () => {
    vi.stubGlobal(
      'fetch',
      stubWarehouseFetch([
        { warehouseId: MEMBER_WAREHOUSE_ID, name: 'Main', archivedAt: null },
      ]),
    );

    const { router, store } = renderRoute(`/warehouses/${MEMBER_WAREHOUSE_ID}`);
    expect(
      await screen.findByText('Design System Preview'),
    ).toBeInTheDocument();

    store.dispatch(
      workspaceContextApi.util.updateQueryData(
        'getWorkspaceContext',
        undefined,
        (draft) => {
          remove(
            draft.warehouses,
            (warehouse) => warehouse.warehouseId === MEMBER_WAREHOUSE_ID,
          );
        },
      ),
    );

    await router.navigate({
      to: '/warehouses/$warehouseId/$',
      params: { warehouseId: MEMBER_WAREHOUSE_ID, _splat: 'anything' },
    });

    // If the layout's `beforeLoad` had re-run against the mutated cache, it
    // would have found no membership and refused — but a refusal renders in
    // place (CR-AC-07) rather than reaching the splat's redirect, so the
    // actor would still be at the `/anything` address instead of `/`. The
    // splat's own `beforeLoad` fired and redirected home unconditionally
    // (proving the "only a member can ever reach it" branch above), which
    // is only reachable if the layout's original `entered` verdict was
    // still in effect — proof the layout's own `beforeLoad` did not re-run.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ROUTES.HOME),
    );
    expect(
      screen.queryByText("This address isn't available to you"),
    ).not.toBeInTheDocument();
  });
});
