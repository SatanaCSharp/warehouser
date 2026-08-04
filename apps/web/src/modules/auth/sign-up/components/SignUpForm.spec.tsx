import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SignUpForm } from 'modules/auth/sign-up/components/SignUpForm';
import { renderWithProviders } from 'test/render';

describe('SignUpForm', () => {
  it('focuses the first invalid field and explains both corrections', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<SignUpForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Enter a valid email address'),
    ).toBeVisible();
    expect(
      screen.getByText('Password must contain 8 to 128 characters'),
    ).toBeVisible();
    expect(screen.getByText('Enter a Warehouse name.')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('normalizes email while preserving password whitespace exactly', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<SignUpForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText('Email'),
      '  Jane.Doe@Example.Test  ',
    );
    await user.type(screen.getByLabelText('Password'), '  exact pass  ');
    await user.type(screen.getByLabelText('Warehouse name'), '  Склад é  ');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        {
          email: 'jane.doe@example.test',
          password: '  exact pass  ',
          warehouseName: 'Склад é',
        },
        expect.anything(),
      ),
    );
  });

  it('exposes password visibility and textual loading states', async () => {
    const user = userEvent.setup();
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    renderWithProviders(<SignUpForm onSubmit={onSubmit} />);

    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(
      screen.getByRole('button', { name: 'Hide password' }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'jane@example.test');
    await user.type(password, 'long enough');
    await user.type(screen.getByLabelText('Warehouse name'), 'Main Warehouse');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByRole('button', { name: 'Creating account…' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Warehouse name')).toBeDisabled();
    act(() => {
      resolveSubmit?.();
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Create account' }),
      ).toBeEnabled(),
    );
  });

  it.each([
    ['x'.repeat(101), 'Warehouse name must contain 1 to 100 characters.'],
    ['Ware\u200Bhouse', 'Warehouse name contains an unsupported character.'],
  ])('announces invalid Warehouse name %p', async (warehouseName, message) => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Email'), 'jane@example.test');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.type(screen.getByLabelText('Warehouse name'), warehouseName);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByLabelText('Warehouse name')).toHaveFocus();
  });
});
