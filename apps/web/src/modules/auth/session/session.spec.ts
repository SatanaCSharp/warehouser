import { describe, expect, it, vi } from 'vitest';

import {
  createSessionBootstrap,
  completeSignOut,
} from 'modules/auth/session/session';
import { makeStore } from 'store';

const authenticated = {
  user: { id: '00000000-0000-4000-8000-000000000001' },
};

describe('session bootstrap', () => {
  it('coalesces concurrent callers into one restoration request', async () => {
    let resolveRequest: ((value: typeof authenticated) => void) | undefined;
    const restore = vi.fn(
      () =>
        new Promise<typeof authenticated>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const initialize = createSessionBootstrap(restore);
    const store = makeStore();

    const first = initialize(store);
    const second = initialize(store);
    expect(restore).toHaveBeenCalledTimes(1);

    resolveRequest?.(authenticated);
    await expect(Promise.all([first, second])).resolves.toEqual([
      'authenticated',
      'authenticated',
    ]);
    expect(store.getState().auth).toEqual({
      status: 'authenticated',
      user: authenticated.user,
    });
  });

  it('resolves an absent, expired, or revoked session to anonymous', async () => {
    const initialize = createSessionBootstrap(vi.fn().mockResolvedValue(null));
    const store = makeStore();

    await expect(initialize(store)).resolves.toBe('anonymous');
    expect(store.getState().auth).toEqual({ status: 'anonymous', user: null });
  });
});

describe('sign-out state', () => {
  it('clears browser auth only after server revocation completes', async () => {
    let finishRevocation: (() => void) | undefined;
    const revoke = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRevocation = resolve;
        }),
    );
    const store = makeStore();
    store.dispatch({
      type: 'auth/authBecameAuthenticated',
      payload: authenticated.user,
    });

    const completion = completeSignOut(store, revoke);
    expect(store.getState().auth.status).toBe('authenticated');

    finishRevocation?.();
    await completion;
    expect(store.getState().auth).toEqual({ status: 'anonymous', user: null });
  });

  it('retains authenticated state when revocation fails', async () => {
    const store = makeStore();
    store.dispatch({
      type: 'auth/authBecameAuthenticated',
      payload: authenticated.user,
    });

    await expect(
      completeSignOut(
        store,
        vi.fn().mockRejectedValue(new Error('unavailable')),
      ),
    ).rejects.toThrow('unavailable');
    expect(store.getState().auth.status).toBe('authenticated');
  });
});
