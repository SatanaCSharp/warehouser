import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { requireAuth } from 'guards/auth.guard';
import { rootRoute } from 'routes/__root.route';
import { ROUTES } from 'shared/constants/routes';

export const accessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.ACCESS,
  component: lazyRouteComponent(() => import('./page'), 'AccessPage'),
  beforeLoad: ({ context }) => requireAuth(context),
});
