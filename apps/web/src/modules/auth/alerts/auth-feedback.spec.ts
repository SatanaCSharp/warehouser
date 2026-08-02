import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alertSignInSuccess,
  alertSignOutSuccess,
  alertSignUpSuccess,
} from 'modules/auth/alerts/auth-feedback';

const toast = vi.hoisted(() => ({
  success: vi.fn(),
}));

vi.mock('react-toastify', () => ({ toast }));

describe('auth feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies sign-up and sign-out success but not sign-in or restoration', () => {
    alertSignUpSuccess();
    alertSignInSuccess();
    alertSignOutSuccess();

    expect(toast.success).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenNthCalledWith(
      1,
      'Your account was created.',
      expect.any(Object),
    );
    expect(toast.success).toHaveBeenNthCalledWith(
      2,
      'You have signed out.',
      expect.any(Object),
    );
  });
});
