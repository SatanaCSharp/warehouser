import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { DemandPendingState } from 'modules/customer-order/components/DemandPendingState';
import { loadDemand } from 'modules/customer-order/loaders/demand.loader';
import { warehouseRoute } from 'routes/warehouse.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { ROUTE_SEGMENTS } from 'shared/constants/routes';

// T19 — the Demand destination (sad.md §5 Web: `modules/customer-order` owns
// it, not `modules/demand` — sad.md §8 Naming). A child of the Warehouse
// layout, which already authenticates and resolves entry, so this route
// declares no `beforeLoad` of its own. It awaits the consolidated demand its
// destination paints (`frontend-architecture.md` §Route); the dispatch itself
// lives in `loaders/demand.loader.ts`, wired here only.
//
// Readiness is the route's, so the skeleton shaped like the demand table is
// this route's `pendingComponent` rather than a branch inside the page
// (`frontend-architecture.md` §Page, frame `hWFRW` tile `EZn9c`). It imports
// one small component and no page, so the lazy `import('./page')` boundary is
// unaffected.
export const customerOrderRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: ROUTE_SEGMENTS.DEMAND,
  component: lazyRouteComponent(() => import('./page'), 'CustomerOrderPage'),
  errorComponent: RouteErrorState,
  loader: loadDemand,
  pendingComponent: DemandPendingState,
});
