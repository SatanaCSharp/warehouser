import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alertSignInSuccess,
  alertSignOutAction,
  alertSignUpAction,
} from 'modules/auth/alerts/auth-feedback';

const toast = vi.hoisted(() => {
  const fn = vi.fn(() => 'pending-key');
  return Object.assign(fn, {
    danger: vi.fn(() => 'toast-key'),
    success: vi.fn(() => 'toast-key'),
    close: vi.fn(),
  });
});

vi.mock('shared/alerts/toast', () => ({ toast }));

describe('auth feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies sign-up and sign-out success but not sign-in or restoration', async () => {
    await alertSignUpAction(Promise.resolve({ data: {} }));
    alertSignInSuccess();
    await alertSignOutAction(Promise.resolve({ data: {} }));

    expect(toast).toHaveBeenNthCalledWith(1, 'Creating your account…', {
      isLoading: true,
      timeout: 0,
    });
    expect(toast).toHaveBeenNthCalledWith(2, 'Signing you out…', {
      isLoading: true,
      timeout: 0,
    });
    expect(toast.success).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenNthCalledWith(
      1,
      'Your account was created.',
    );
    expect(toast.success).toHaveBeenNthCalledWith(2, 'You have signed out.');
  });

  it('closes the pending toast without success feedback when signing out fails', async () => {
    await alertSignOutAction(
      Promise.resolve({ error: { code: 'auth.sign_out_unavailable' } }),
    );

    expect(toast.close).toHaveBeenCalledWith('pending-key');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
