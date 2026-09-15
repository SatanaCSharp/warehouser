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

  // Not every rejection RTK dispatches is an RTK Query endpoint's. A plain `createAsyncThunk`
  // rejection carries an `arg` that names no endpoint at all, and `meta.arg` can be any value the
  // thunk was called with — a string, a number, nothing. The allowlist is a *named* exception, so
  // an action it cannot name must fall on the alerting side rather than be silenced by an
  // `undefined` that happens not to be in the set.
  it.each([
    ['an arg naming no endpoint', { unrelated: true }],
    ['an endpoint name that is not a string', { endpointName: 42 }],
    ['no arg at all', undefined],
  ])('still alerts a rejection carrying %s', (_case, arg) => {
    const next = vi.fn();
    const action = {
      meta: {
        ...(arg !== undefined && { arg }),
        rejectedWithValue: true,
        requestId: 'request-id',
        requestStatus: 'rejected',
      },
      payload: { code: 'api.unexpected' },
      type: 'thunk/rejected',
    };

    apiErrorMiddleware({} as never)(next)(action);

    expect(alertApiFailure).toHaveBeenCalledWith({ code: 'api.unexpected' });
    expect(next).toHaveBeenCalledWith(action);
  });
});
