import { describe, expect, it } from 'vitest';

import {
  selectAuthStatus,
  selectCurrentUser,
  selectIsAuthenticated,
} from 'modules/auth/store/auth.selectors';
import {
  authBecameAnonymous,
  authBecameAuthenticated,
} from 'modules/auth/store/auth.slice';
import { makeStore } from 'store';

const user = { id: '00000000-0000-4000-8000-000000000001' };

describe('auth slice', () => {
  it('starts unknown and contains no reusable credential field', () => {
    const store = makeStore();

    expect(store.getState().auth).toEqual({ status: 'unknown', user: null });
    expect('token' in store.getState().auth).toBe(false);
  });

  it('transitions between authenticated and anonymous through safe user data', () => {
    const store = makeStore();

    store.dispatch(authBecameAuthenticated(user));
    expect(selectAuthStatus(store.getState())).toBe('authenticated');
    expect(selectCurrentUser(store.getState())).toEqual(user);
    expect(selectIsAuthenticated(store.getState())).toBe(true);

    store.dispatch(authBecameAnonymous());
    expect(store.getState().auth).toEqual({ status: 'anonymous', user: null });
  });
});
