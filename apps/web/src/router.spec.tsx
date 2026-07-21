import { HeroUIProvider } from '@heroui/react';
import { RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

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
  it('renders LoginForm at /login', async () => {
    renderRoute('/login');

    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('redirects anonymous users from the protected home route', async () => {
    const { router } = renderRoute('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('updates RTK auth state and enters the protected route after login', async () => {
    const user = userEvent.setup();
    const { router, store } = renderRoute('/login');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /log in/iu }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(store.getState().auth).toEqual({
      user: { email: 'jane@example.com' },
      token: 'mock-token',
    });
    expect(
      await screen.findByText('Design System Preview'),
    ).toBeInTheDocument();
  });
});
