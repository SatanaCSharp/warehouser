import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { warehouseRoute } from 'routes/warehouse.route';
import { ROUTE_SEGMENTS } from 'shared/constants/routes';

// T17 — the Purchase drafts destination (sad.md §5 Web). A child of the
// Warehouse layout, which already authenticates and resolves entry, so this
// route declares no `beforeLoad` of its own. It renders no server data yet —
// that is T19's own loader — so it declares no `loader` either.
export const purchaseDraftRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: ROUTE_SEGMENTS.PURCHASE_DRAFTS,
  component: lazyRouteComponent(() => import('./page'), 'PurchaseDraftPage'),
});
