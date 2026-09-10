import { alertApiFailure } from 'shared/alerts/api-feedback';
import { apiErrorMiddleware } from 'store/middleware/api-error.middleware';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared/alerts/api-feedback', () => ({
  alertApiFailure: vi.fn(),
}));

const rejectedAction = (
  payload: unknown,
  endpointName = 'renameWorkspace',
): object => ({
  meta: {
    arg: { endpointName },
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

  // T8 / CR-AC-09 — the entry-record write is fire-and-forget: a rejection
  // must never surface an alert over an otherwise-working Warehouse view.
  // This is the one documented exception to the single alert path; every
  // other endpoint keeps alerting, including a failure carrying the exact
  // same normalized code.
  it('silences a setActiveWarehouse failure but keeps alerting every other endpoint', () => {
    const next = vi.fn();
    const silencedAction = rejectedAction(
      { code: 'api.unexpected' },
      'setActiveWarehouse',
    );
    const otherAction = rejectedAction(
      { code: 'api.unexpected' },
      'renameWorkspace',
    );

    apiErrorMiddleware({} as never)(next)(silencedAction);
    expect(alertApiFailure).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(silencedAction);

    apiErrorMiddleware({} as never)(next)(otherAction);
    expect(alertApiFailure).toHaveBeenCalledWith({ code: 'api.unexpected' });
    expect(next).toHaveBeenCalledWith(otherAction);
  });
});
