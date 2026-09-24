import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { loadWarehouseDashboard } from 'modules/warehouse/loaders/warehouse-dashboard.loader';
import { warehouseRoute } from 'routes/warehouse.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';

// T4 — the Warehouse dashboard: the index child of the layout route. Its
// path is `/`, which resolves to the same `fullPath` as its parent
// (`joinPaths([parentFullPath, '/'])`), making it the index match for
// `ROUTES.WAREHOUSE`. No `beforeLoad` of its own — the parent already
// authenticates and resolves entry (sad.md §5).
//
// `dashboards` T16 — the destination now paints four server-read Panels, so
// the route awaits every one the actor's Permissions admit before it mounts
// (`frontend-architecture.md` §Route; dashboards `sad.md` §6.1). The
// dispatches themselves live in `loaders/warehouse-dashboard.loader.ts`, wired
// here only — this file holds routing concerns and no dispatch of its own.
//
// `errorComponent` comes with the loader, because a failed primary read has
// to paint ("Declare `pendingComponent` and `errorComponent` alongside it, so
// the awaited window and a failed primary read both paint" —
// `guides/adding-a-web-module.md` §5). Without it a rejected projection read
// left this match in `error` with no boundary of its own and painted an empty
// outlet under the shell: no denial, no error state, nothing.
//
// It declares no `pendingComponent`, and that is not an omission. The parent
// `warehouseRoute` already paints the await window for this whole branch at
// `pendingMs: 150`, and CR-AC-13 forbids the branch mounting a second
// `RoutePendingState` beneath the first — so the index child owns no readiness
// affordance of its own (readiness-removal CR-AC-15, amended by this task).
export const warehouseDashboardRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./page'), 'WarehousePage'),
  errorComponent: RouteErrorState,
  loader: loadWarehouseDashboard,
});
