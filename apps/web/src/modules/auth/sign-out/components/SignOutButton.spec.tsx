import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SignOutButton } from 'modules/auth/sign-out/components/SignOutButton';
import { renderWithProviders } from 'test/render';

describe('SignOutButton', () => {
  it('shows the Sign out label and accessible name, collapsing the label below sm', () => {
    renderWithProviders(<SignOutButton />);

    const button = screen.getByRole('button', { name: 'Sign out' });
    const label = screen.getByText('Sign out');
    expect(button).toContainElement(label);
    expect(label.className).toContain('hidden');
    expect(label.className).toContain('sm:inline');
  });
});
