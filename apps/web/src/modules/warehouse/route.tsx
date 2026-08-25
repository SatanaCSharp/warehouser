import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { warehouseRoute } from 'routes/warehouse.route';

// T4 — the Warehouse dashboard: the index child of the layout route. Its
// path is `/`, which resolves to the same `fullPath` as its parent
// (`joinPaths([parentFullPath, '/'])`), making it the index match for
// `ROUTES.WAREHOUSE`. No `beforeLoad` of its own — the parent already
// authenticates and resolves entry (sad.md §5).
export const warehouseDashboardRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./page'), 'WarehousePage'),
});
