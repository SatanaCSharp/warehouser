import { redirect } from '@tanstack/react-router';

import { initializeSession } from 'modules/auth/session/session';
import { ROUTES } from 'shared/constants/routes';
import { selectIsAuthenticated } from 'store/slices/authSlice';

import type { RouterContext } from 'routes/__root.route';

export const requireAuth = async ({ store }: RouterContext): Promise<void> => {
  await initializeSession(store);

  if (!selectIsAuthenticated(store.getState())) {
    // TanStack Router handles its redirect descriptor as a thrown control signal.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: ROUTES.LOGIN });
  }
};
