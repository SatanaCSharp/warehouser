import { authApi } from 'modules/auth/api/auth-api';
import { selectAuthStatus } from 'modules/auth/store/auth.selectors';
import {
  authBecameAnonymous,
  authBecameAuthenticated,
} from 'modules/auth/store/auth.slice';

import type { AuthenticatedUser } from '@warehouser/contracts/auth';
import type { AuthStatus } from 'modules/auth/store/auth.slice';
import type { AppStore } from 'store';

type RestoreSession = (store: AppStore) => Promise<AuthenticatedUser | null>;
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

    const request = restore(store)
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

export const initializeSession = createSessionBootstrap((store) =>
  store
    .dispatch(
      authApi.endpoints.getCurrentSession.initiate(undefined, {
        forceRefetch: true,
        subscribe: false,
      }),
    )
    .unwrap(),
);
