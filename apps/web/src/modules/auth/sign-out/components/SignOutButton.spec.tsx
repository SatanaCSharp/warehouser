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

  it('collapses to icon-only sizing below sm, matching HeroUI icon-only sizing at sm and above', () => {
    renderWithProviders(<SignOutButton />);

    const button = screen.getByRole('button', { name: 'Sign out' });
    expect(button.className).toContain('w-10');
    expect(button.className).toContain('px-0');
    expect(button.className).toContain('sm:w-auto');
    expect(button.className).toContain('sm:px-4');
  });
});
