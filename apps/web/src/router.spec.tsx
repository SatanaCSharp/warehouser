import { HeroUIProvider } from '@heroui/react';
import { RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from 'router';
import { makeStore } from 'store';

import type { AppRouter } from 'router';
import type { AppStore } from 'store';

type RenderedRoute = { router: AppRouter; store: AppStore };

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

describe('router', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('creates an account, authenticates the linked user, and enters home', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000012' },
          }),
        ),
    );
    const user = userEvent.setup();
    const { router, store } = renderRoute('/sign-up');

    await user.type(await screen.findByLabelText('Email'), 'new@example.test');
    await user.type(screen.getByLabelText('Password'), 'long enough');
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
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('updates RTK auth state and enters the protected route after login', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000001' },
          }),
        ),
    );
    const user = userEvent.setup();
    const { router, store } = renderRoute('/login');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /log in/iu }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(store.getState().auth).toEqual({
      status: 'authenticated',
      user: { id: '00000000-0000-4000-8000-000000000001' },
    });
    expect(
      await screen.findByText('Design System Preview'),
    ).toBeInTheDocument();
  });

  it('waits for restoration and admits a valid session to the protected route', async () => {
    let resolveSession: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveSession = resolve;
        }),
    );
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
