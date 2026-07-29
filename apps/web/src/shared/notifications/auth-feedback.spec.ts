import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiFailure } from 'shared/api/api-client';
import {
  notifyApiFailure,
  notifySignInSuccess,
  notifySignOutSuccess,
  notifySignUpSuccess,
} from 'shared/notifications/auth-feedback';

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  isActive: vi.fn(() => false),
}));

vi.mock('react-toastify', () => ({ toast }));

describe('auth feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates the same translated API failure', () => {
    const error = new ApiFailure('auth.invalid_credentials');

    notifyApiFailure(error);
    toast.isActive.mockReturnValueOnce(true);
    notifyApiFailure(error);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('notifies sign-up and sign-out success but not sign-in or restoration', () => {
    notifySignUpSuccess();
    notifySignInSuccess();
    notifySignOutSuccess();

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
