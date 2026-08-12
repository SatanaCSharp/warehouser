import { RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from 'router';
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

// The authenticated shell reads the Workspace actor context to decide whether
// the Workspace navigation entry exists at all (AC-30). That read is not one
// of the datasets the access cases below are about, so answer it out of band
// and let each of them keep its own ordered request script.
const withWorkspaceContext = (
  requestScript: ReturnType<typeof vi.fn>,
  workspacePermissionIds: readonly WorkspacePermissionId[] = [],
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
          warehouses: [],
          effectiveWarehouseId: null,
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

  it('loads only role-authorized access datasets at /access', async () => {
    // Routed by path rather than by call order: which datasets are requested is
    // the contract here, not the order the workspace's tabs happen to ask for
    // them in.
    const responsesByPath: [string, unknown][] = [
      [
        '/auth/session',
        { user: { id: '00000000-0000-4000-8000-000000000001' } },
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

    renderRoute('/access');

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
      if (url.endsWith('/api/v1/access/current')) {
        currentReads += 1;
        return Promise.resolve(
          Response.json({
            ...readableAccess,
            permissionIds: currentReads === 1 ? ['ROLES:CREATE'] : [],
          }),
        );
      }
      if (url.endsWith('/api/v1/access/roles') && init?.method === 'POST') {
        return Promise.resolve(
          Response.json(
            { code: 'access.denied', message: 'Access denied' },
            { status: 403 },
          ),
        );
      }
      if (url.endsWith('/api/v1/access/roles')) {
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
      if (url.endsWith('/api/v1/access/permissions')) {
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

    renderRoute('/access');
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
    vi.stubGlobal('fetch', withWorkspaceContext(fetchMock));

    renderRoute('/access');

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
      if (url.endsWith('/api/v1/access/current')) {
        return Promise.resolve(
          Response.json({ ...readableAccess, permissionIds: ['USERS:WATCH'] }),
        );
      }
      // Members' Role-name lookup loads Roles even without a role-admin
      // Permission (US-07) — the Members tab is not gated on that request.
      if (url.endsWith('/api/v1/access/roles')) {
        return Promise.resolve(
          Response.json({
            items: [],
            hasNext: false,
            hasPrev: false,
            nextCursor: null,
          }),
        );
      }
      if (url.endsWith('/api/v1/access/members')) {
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

    renderRoute('/access');

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
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000012' },
            access: {
              warehouseId: '00000000-0000-4000-8000-000000000013',
              roleId: '00000000-0000-4000-8000-000000000014',
              roleKind: 'warehouse_manager',
              permissionIds: ['ROLES:WATCH'],
            },
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
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000001' },
          }),
        )
        .mockResolvedValueOnce(Response.json(readableAccess)),
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
    expect(
      await screen.findByText('Design System Preview'),
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          user: { id: '00000000-0000-4000-8000-000000000001' },
        }),
      )
      .mockResolvedValueOnce(Response.json(readableAccess))
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
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSession = resolve;
          }),
      )
      .mockResolvedValueOnce(Response.json(readableAccess));
    vi.stubGlobal('fetch', withWorkspaceContext(fetchMock));
    const { router, store } = renderRoute('/');

    expect(store.getState().auth.status).toBe('unknown');
    expect(screen.queryByText('Design System Preview')).not.toBeInTheDocument();

    resolveSession?.(
      Response.json({
        user: { id: '00000000-0000-4000-8000-000000000001' },
      }),
    );

    expect(
      await screen.findByText('Design System Preview'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(store.getState().auth.status).toBe('authenticated');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
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

    await screen.findByRole('link', { name: 'Dashboard' });
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
});
