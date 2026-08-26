import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { warehouseRoute } from 'routes/warehouse.route';
import { ROUTE_SEGMENTS } from 'shared/constants/routes';

// T17 — the Demand destination (sad.md §5 Web: `modules/customer-order` owns
// it, not `modules/demand` — sad.md §8 Naming). A child of the Warehouse
// layout, which already authenticates and resolves entry, so this route
// declares no `beforeLoad` of its own (`adding-a-web-module.md` §5). It
// renders no server data yet — that is T18's own loader — so it declares no
// `loader` either (`adding-a-web-module.md` §"When the route declares a
// loader").
export const customerOrderRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: ROUTE_SEGMENTS.DEMAND,
  component: lazyRouteComponent(() => import('./page'), 'CustomerOrderPage'),
});
