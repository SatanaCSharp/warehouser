import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoginForm } from 'modules/auth/login/components/LoginForm';
import { renderWithProviders } from 'test/render';

describe('LoginForm', () => {
  it('shows validation errors and does not submit invalid input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: /sign in/iu }));

    expect(
      await screen.findByText('Enter a valid email address'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Password must contain 8 to 128 characters'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /sign in/iu }));

    expect(onSubmit).toHaveBeenCalledWith(
      { email: 'jane@example.com', password: 'longenoughpassword' },
      expect.anything(),
    );
  });

  it('normalizes email while preserving password text exactly', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), ' Jane@Example.COM ');
    await user.type(screen.getByLabelText('Password'), '  long enough  ');
    await user.click(screen.getByRole('button', { name: /sign in/iu }));

    expect(onSubmit).toHaveBeenCalledWith(
      { email: 'jane@example.com', password: '  long enough  ' },
      expect.anything(),
    );
  });

  it('keeps labels visible and exposes an accessible password visibility control', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm onSubmit={vi.fn()} />);

    const password = screen.getByLabelText('Password');
    expect(screen.getByText('Email')).toBeVisible();
    expect(screen.getByText('Password')).toBeVisible();
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));

    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeVisible();
  });

  it('disables the fields and announces progress while submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => new Promise<void>(() => undefined));
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.click(screen.getByRole('button', { name: /sign in/iu }));

    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });
});
