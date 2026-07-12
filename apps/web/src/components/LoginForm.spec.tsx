import { configureStore, type EnhancedStore } from '@reduxjs/toolkit';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import LoginForm from 'components/LoginForm';
import authReducer, { type AuthState } from 'store/slices/authSlice';
import { renderWithProviders } from 'test/render';

const renderLoginForm = (): EnhancedStore<{ auth: AuthState }> => {
  const store = configureStore({ reducer: { auth: authReducer } });
  renderWithProviders(<LoginForm />, store);
  return store;
};

describe('LoginForm', () => {
  it('shows validation errors and does not update auth state for invalid input', async () => {
    const user = userEvent.setup();
    const store = renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: /log in/iu }));

    expect(
      await screen.findByText('Enter a valid email address'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Password must be at least 8 characters'),
    ).toBeInTheDocument();
    expect(store.getState().auth).toEqual({ user: null, token: null });
  });

  it('dispatches setCredentials with a mock token for valid input', async () => {
    const user = userEvent.setup();
    const store = renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /log in/iu }));

    await waitFor(() => {
      expect(store.getState().auth).toEqual({
        user: { email: 'jane@example.com' },
        token: 'mock-token',
      });
    });
  });
});
