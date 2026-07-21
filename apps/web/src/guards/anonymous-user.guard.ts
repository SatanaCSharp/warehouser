import { redirect } from '@tanstack/react-router';

import { ROUTES } from 'shared/constants/routes';
import { selectIsAuthenticated } from 'store/slices/authSlice';

import type { RouterContext } from 'routes/__root.route';

export const requireAnonymous = ({ store }: RouterContext): void => {
  if (selectIsAuthenticated(store.getState())) {
    // TanStack Router handles its redirect descriptor as a thrown control signal.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: ROUTES.HOME });
  }
};
