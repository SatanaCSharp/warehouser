import { beforeEach, describe, expect, it, vi } from 'vitest';

import { alertApiFailure } from 'shared/alerts/api-feedback';

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  isActive: vi.fn(() => false),
}));

vi.mock('react-toastify', () => ({ toast }));

describe('API feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates the same translated API failure', () => {
    const error = { code: 'auth.invalid_credentials' };

    alertApiFailure(error);
    toast.isActive.mockReturnValueOnce(true);
    alertApiFailure(error);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
