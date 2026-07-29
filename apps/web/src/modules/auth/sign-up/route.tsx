import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { requireAnonymous } from 'guards/anonymous-user.guard';
import { rootRoute } from 'routes/__root.route';
import { ROUTES } from 'shared/constants/routes';

export const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.SIGN_UP,
  component: lazyRouteComponent(() => import('./page'), 'SignUpPage'),
  beforeLoad: ({ context }) => requireAnonymous(context),
});
