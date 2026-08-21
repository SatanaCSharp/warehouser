import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { warehouseRoute } from 'routes/warehouse.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { RoutePendingState } from 'shared/components/RoutePendingState';
import { ROUTE_SEGMENTS } from 'shared/constants/routes';

// T6 / CH-03 — the access surface is a child of the Warehouse layout, so the
// Warehouse it operates on is the one its address names rather than an ambient
// selection. It declares **no `beforeLoad` of its own**: the parent already
// authenticates and resolves entry, and the address deliberately carries no
// capability gate — a member of the Warehouse holding neither `ROLES:WATCH` nor
// `USERS:WATCH` is admitted and finds the surface unpopulated (CR-AC-21), which
// is why adding one here would be both a no-op guard and a behavior change
// (`adding-a-web-module.md` §3).
//
// T1 / CH-02, CH-02a — it does declare the pending and error contract its own
// await window needs. `errorComponent` paints the standard error state when the
// primary read fails; the `pendingComponent` beside it is the branch's, not
// this route's, for the reason recorded at the declaration below.
export const accessRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: ROUTE_SEGMENTS.ACCESS,
  component: lazyRouteComponent(() => import('./page'), 'AccessPage'),
  errorComponent: RouteErrorState,
  // T1 / CR-AC-02 — this route never renders this component. It is declared
  // because `setupPendingTimeout` registers the router's commit timer only for
  // a route that has a `pendingComponent`, and the router clears a parent's
  // timer as soon as the parent's own match settles: without a timer of its
  // own this route's window would go unpainted whenever the parent resolves
  // from cache, which is the common `/workspace` → `/access` path. Do not
  // delete it as unused (ADR 0002).
  pendingComponent: RoutePendingState,
  // T1 / CR-AC-16 — the same `async` parent guard one level down, so the same
  // microtask must not paint over a live destination.
  pendingMs: 150,
  // TanStack's default is 500 ms, which would hold the pending state on
  // screen after its data had arrived (`sad.md` §5.1).
  pendingMinMs: 0,
  // T1 / CR-AC-13 — a route branch owns ONE pending boundary, at its top.
  // `Match.js` wraps a match in its own `React.Suspense` as soon as it
  // declares a `pendingComponent`, which on a cold navigation would paint the
  // parent's fallback, commit `WarehouseLayout`, then paint a second fallback.
  // Suppressing this route's boundary sends its suspension to
  // `warehouseRoute`'s instead, so one `RoutePendingState` — the same element
  // at the same position — spans both windows. Do not delete it as dead
  // configuration: it is the reason the `pendingComponent` above never
  // renders, and each deletion breaks a different criterion (ADR 0002).
  wrapInSuspense: false,
});
