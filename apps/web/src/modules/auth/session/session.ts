import {
  getCurrentSession,
  signOut as revokeCurrentSession,
} from 'modules/auth/api/auth-api';
import {
  authBecameAnonymous,
  authBecameAuthenticated,
  selectAuthStatus,
} from 'store/slices/authSlice';

import type { AuthenticatedUser } from '@warehouser/contracts/auth';
import type { AppStore } from 'store';
import type { AuthStatus } from 'store/slices/authSlice';

type RestoreSession = () => Promise<AuthenticatedUser | null>;
type ResolvedAuthStatus = Exclude<AuthStatus, 'unknown'>;

export const createSessionBootstrap = (restore: RestoreSession) => {
  const inFlight = new WeakMap<AppStore, Promise<ResolvedAuthStatus>>();

  return (store: AppStore): Promise<ResolvedAuthStatus> => {
    const currentStatus = selectAuthStatus(store.getState());
    if (currentStatus !== 'unknown') {
      return Promise.resolve(currentStatus);
    }

    const currentRequest = inFlight.get(store);
    if (currentRequest) {
      return currentRequest;
    }

    const request = restore()
      .then((session) => {
        if (session) {
          store.dispatch(authBecameAuthenticated(session.user));
          return 'authenticated' as const;
        }

        store.dispatch(authBecameAnonymous());
        return 'anonymous' as const;
      })
      .finally(() => {
        inFlight.delete(store);
      });

    inFlight.set(store, request);
    return request;
  };
};

export const initializeSession = createSessionBootstrap(getCurrentSession);

export const completeSignOut = async (
  store: AppStore,
  revoke: () => Promise<void> = revokeCurrentSession,
): Promise<void> => {
  await revoke();
  store.dispatch(authBecameAnonymous());
};
