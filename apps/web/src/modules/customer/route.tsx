import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { CustomerPendingState } from 'modules/customer/components/CustomerPendingState';
import { loadCustomers } from 'modules/customer/loaders/customer.loader';
import { warehouseRoute } from 'routes/warehouse.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { ROUTE_SEGMENTS } from 'shared/constants/routes';

// delivery-addresses T21 — the Customers destination (frames `KRDln`,
// `b7gaH9`). A child of the Warehouse layout, which already authenticates and
// resolves entry, so this route declares no `beforeLoad` of its own. It awaits
// the Customers list its destination paints
// (`frontend-architecture.md` §Route); the dispatch itself lives in
// `loaders/customer.loader.ts`, wired here only.
//
// Route visibility is advisory UI behavior, never the server authorization
// boundary (design-handoff.md §Implementation constraints): the address
// resolves for every member and the loader issues nothing without
// `CUSTOMERS:WATCH`, so the destination has nothing to show a refused actor.
export const customerRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: ROUTE_SEGMENTS.CUSTOMERS,
  component: lazyRouteComponent(() => import('./page'), 'CustomerPage'),
  errorComponent: RouteErrorState,
  loader: loadCustomers,
  pendingComponent: CustomerPendingState,
});
