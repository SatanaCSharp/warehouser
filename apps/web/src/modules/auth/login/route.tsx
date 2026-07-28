import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';

import { requireAnonymous } from 'guards/anonymous-user.guard';
import { rootRoute } from 'routes/__root.route';
import { ROUTES } from 'shared/constants/routes';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.LOGIN,
  component: lazyRouteComponent(() => import('./page'), 'LoginPage'),
  beforeLoad: ({ context }) => requireAnonymous(context),
  validateSearch: z.object({
    reason: z.literal('session-ended').optional(),
  }),
});
