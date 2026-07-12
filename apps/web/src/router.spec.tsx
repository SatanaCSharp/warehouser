import { HeroUIProvider } from '@heroui/react';
import { RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { router } from 'router';
import { store } from 'store/index';

describe('router', () => {
  it('renders LoginForm at /login', async () => {
    render(
      <HeroUIProvider>
        <Provider store={store}>
          <RouterProvider router={router} />
        </Provider>
      </HeroUIProvider>,
    );

    // router.navigate triggers an async route transition (and the
    // subsequent LoginForm mount) outside of RTL's own act-environment
    // detection around render()/fireEvent, so it must be wrapped explicitly.
    // This only actually suppresses React's act() warnings once
    // globalThis.IS_REACT_ACT_ENVIRONMENT is set (see src/test/setup.ts);
    // without it, act() is a no-op and the warnings still fire.
    await act(async () => {
      await router.navigate({ to: '/login' });
    });

    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });
});
