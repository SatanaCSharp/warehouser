import { beforeEach, describe, expect, it, vi } from 'vitest';

import { alertApiFailure } from 'shared/alerts/api-feedback';
import { apiErrorMiddleware } from 'store/middleware/api-error.middleware';

vi.mock('shared/alerts/api-feedback', () => ({
  alertApiFailure: vi.fn(),
}));

const rejectedAction = (payload: unknown): object => ({
  meta: {
    rejectedWithValue: true,
    requestId: 'request-id',
    requestStatus: 'rejected',
  },
  payload,
  type: 'api/executeMutation/rejected',
});

describe('apiErrorMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('notifies normalized API failures and forwards the action', () => {
    const next = vi.fn();
    const action = rejectedAction({ code: 'api.network' });

    apiErrorMiddleware({} as never)(next)(action);

    expect(alertApiFailure).toHaveBeenCalledWith({ code: 'api.network' });
    expect(next).toHaveBeenCalledWith(action);
  });

  it('ignores rejected actions without a normalized API failure', () => {
    const next = vi.fn();
    const action = rejectedAction({ message: 'unrestricted failure' });

    apiErrorMiddleware({} as never)(next)(action);

    expect(alertApiFailure).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(action);
  });
});
