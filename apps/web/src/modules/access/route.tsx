import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { warehouseRoute } from 'routes/warehouse.route';
import { ROUTE_SEGMENTS } from 'shared/constants/routes';

// T6 / CH-03 — the access surface is a child of the Warehouse layout, so the
// Warehouse it operates on is the one its address names rather than an ambient
// selection. It declares **no `beforeLoad` of its own**: the parent already
// authenticates and resolves entry, and the address deliberately carries no
// capability gate — a member of the Warehouse holding neither `ROLES:WATCH` nor
// `USERS:WATCH` is admitted and finds the surface unpopulated (CR-AC-21), which
// is why adding one here would be both a no-op guard and a behavior change
// (`adding-a-web-module.md` §3).
export const accessRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: ROUTE_SEGMENTS.ACCESS,
  component: lazyRouteComponent(() => import('./page'), 'AccessPage'),
});
