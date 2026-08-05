import { HeroUIProvider } from '@heroui/react';
import { RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from 'router';
import { makeStore } from 'store';

import type { AppRouter } from 'router';
import type { AppStore } from 'store';

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  isActive: vi.fn(() => false),
}));

vi.mock('react-toastify', () => ({ toast }));

type RenderedRoute = { router: AppRouter; store: AppStore };

const readableAccess = {
  warehouseId: '00000000-0000-4000-8000-000000000002',
  roleId: '00000000-0000-4000-8000-000000000003',
  roleKind: 'custom',
  permissionIds: ['ROLES:WATCH'],
} as const;

const renderRoute = (initialEntry: string): RenderedRoute => {
  const store = makeStore();
  const router = createAppRouter({
    appStore: store,
    initialEntries: [initialEntry],
  });

  render(
    <Provider store={store}>
      <HeroUIProvider>
        <RouterProvider router={router} />
      </HeroUIProvider>
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
          permissionIds: ['ROLES:WATCH'],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
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
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [
            { id: 'ROLES:WATCH', label: 'View roles', kind: 'assignable' },
          ],
          hasNext: false,
          hasPrev: false,
          nextCursor: null,
        }),
      );
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
    expect(toast.error).toHaveBeenCalled();
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
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          user: { id: '00000000-0000-4000-8000-000000000001' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ ...readableAccess, permissionIds: ['USERS:WATCH'] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              userId: memberId,
              roleId: '00000000-0000-4000-8000-000000000003',
              roleKind: 'custom',
            },
          ],
          hasNext: false,
          hasPrev: false,
          nextCursor: null,
        }),
      );
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
    expect(await screen.findByText(memberId)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
      expect(toast.error).toHaveBeenCalledWith(
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
    vi.stubGlobal('fetch', fetchMock);
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
    expect(toast.success).toHaveBeenCalledWith(
      'You have signed out.',
      expect.any(Object),
    );
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
    vi.stubGlobal('fetch', fetchMock);
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
});
