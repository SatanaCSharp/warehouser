import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { requireAuth } from 'guards/auth.guard';
import { requireWorkspaceCapability } from 'guards/workspace.guard';
import { rootRoute } from 'routes/__root.route';
import { ROUTES } from 'shared/constants/routes';

export const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.WORKSPACE,
  component: lazyRouteComponent(() => import('./page'), 'WorkspacePage'),
  beforeLoad: async (opts) => {
    await requireAuth(opts.context);
    await requireWorkspaceCapability(opts.context);
  },
});
