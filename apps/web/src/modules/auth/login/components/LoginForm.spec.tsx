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
    await user.click(screen.getByRole('button', { name: /log in/iu }));

    expect(
      await screen.findByText('Enter a valid email address'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Password must be at least 8 characters'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: /log in/iu }));

    expect(onSubmit).toHaveBeenCalledWith(
      { email: 'jane@example.com', password: 'longenoughpassword' },
      expect.anything(),
    );
  });
});
