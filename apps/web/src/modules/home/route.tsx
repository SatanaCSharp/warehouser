import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { requireAuth } from 'guards/auth.guard';
import { resolveLandingContext } from 'guards/landing.guard';
import { rootRoute } from 'routes/__root.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { RoutePendingState } from 'shared/components/RoutePendingState';
import { ROUTES } from 'shared/constants/routes';

// T7 / CR-AC-08 — `/` is the application's one landing resolver rather than a
// destination. `beforeLoad` authenticates, then resolves where the actor's
// access puts them; TanStack's own pending state covers the window before the
// Workspace context read settles, so no rule is evaluated while it is
// unresolved and exactly one navigation follows. `errorComponent` renders the
// standard error state when that read fails — deliberately not the no-context
// state, because a failed read means the actor's access is unknown, not that
// they have none.
export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.HOME,
  component: lazyRouteComponent(() => import('./page'), 'HomePage'),
  errorComponent: RouteErrorState,
  pendingComponent: RoutePendingState,
  // `/` resolves rather than renders, so there is no partial content to keep
  // on screen while the read settles — the router's 1000 ms default would
  // leave the actor on a blank shell for a second before anything appeared.
  // Showing the pending state immediately is what the approved landing frame
  // draws, and `pendingMinMs: 0` keeps a fast read from being held back to
  // satisfy a minimum display time.
  pendingMs: 0,
  pendingMinMs: 0,
  beforeLoad: async ({ context }) => {
    await requireAuth(context);
    await resolveLandingContext(context);
  },
});
