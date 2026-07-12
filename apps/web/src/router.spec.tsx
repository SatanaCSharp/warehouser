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
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    );

    await act(async () => {
      await router.navigate({ to: '/login' });
    });

    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });
});
