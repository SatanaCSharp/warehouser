import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { requireAuth } from 'guards/auth.guard';
import { rootRoute } from 'routes/__root.route';
import { ROUTES } from 'shared/constants/routes';

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.HOME,
  component: lazyRouteComponent(() => import('./page'), 'HomePage'),
  beforeLoad: ({ context }) => requireAuth(context),
});
