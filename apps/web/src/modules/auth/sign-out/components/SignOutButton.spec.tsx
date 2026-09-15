import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignOutButton } from 'modules/auth/sign-out/components/SignOutButton';
import {
  selectAuthStatus,
  selectCurrentUser,
} from 'modules/auth/store/auth.selectors';
import { authenticatedStore } from 'test/access-fixtures';
import { renderWithProviders } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());

// The button triggers the generated mutation directly, so it is stubbed at the
// endpoint that declares it; `useNavigate` is stubbed because this suite
// renders the button outside a router, and because the case below has to hold
// the navigation open to observe what happens before it resolves.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}));

vi.mock('modules/auth/api/auth-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('modules/auth/api/auth-api')>()),
  useSignOutMutation: () => [signOut, { isLoading: false }],
}));

describe('SignOutButton', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

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

  // The premise CR-RG-01 rests on: the session becomes anonymous while the
  // signed-out surface is still mounted, because this dispatch happens *before*
  // the awaited `navigate`. `MembersTab.spec.tsx`'s merge blocker drives that
  // window on the member list; this case is what keeps the window real.
  it('marks the session anonymous before the navigation it awaits resolves (CR-RG-01 premise)', async () => {
    const user = userEvent.setup();
    const store = authenticatedStore();
    signOut.mockResolvedValue({ data: undefined });
    let completeNavigation = (): void => {};
    navigate.mockReturnValue(
      new Promise<void>((resolve) => {
        completeNavigation = (): void => resolve();
      }),
    );

    renderWithProviders(<SignOutButton />, store);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    // Asserted while the navigation is still pending: had the dispatch moved
    // after the await, the actor would still be resolved here.
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    expect(selectCurrentUser(store.getState())).toBeNull();
    expect(selectAuthStatus(store.getState())).toBe('anonymous');

    completeNavigation();
  });
});
