import { createRoute, redirect } from '@tanstack/react-router';

import { rootRoute } from 'routes/__root.route';
import { warehouseRoute } from 'routes/warehouse.route';
import { ROUTES, ROUTE_SEGMENTS } from 'shared/constants/routes';

// T4 / CH-10 / CR-AC-16 — the Warehouse-level splat child. Because it is a
// child of `warehouseRoute`, `/warehouses/:warehouseId/anything` matches the
// layout route (and this splat) rather than falling through to the root
// splat, so the entry check runs before any not-found handling — the
// structural reason CR-AC-07 precedes CR-AC-16 (ADR 0001). The root-level
// splat is T7's; it will be appended to this file.
//
// The redirect fires only for an `entered` verdict (CR-AC-16's second
// paragraph: "only a member can ever reach" it). `context` already carries
// the ancestor `warehouseRoute.beforeLoad`'s published verdict, so a refused
// actor reaches this `beforeLoad` too (every matched route's `beforeLoad`
// runs regardless of what the parent renders), but must NOT be redirected —
// CR-AC-07 requires they remain at the address they requested so
// `WarehouseLayout` can render the refusal there instead.
export const warehouseCatchAllRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: ROUTE_SEGMENTS.SPLAT,
  beforeLoad: ({ context }) => {
    if (context.status !== 'entered') {
      return;
    }
    // TanStack Router handles its redirect descriptor as a thrown control signal.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: ROUTES.HOME });
  },
});

// T7 / CH-10 / CR-AC-16 — the root-level splat. An address matching no route,
// including a bookmarked `/access` that stops resolving under CH-03, is sent to
// the root, where CR-AC-08 resolves the actor's context. It matches no address
// to any particular Warehouse and performs no Warehouse resolution of its own.
//
// It carries no authentication branch: an unauthenticated actor is sent to
// sign-in by the existing `requireAuth` on `/`, unchanged. And it can never
// receive an address naming a Warehouse the actor may not enter — those match
// the Warehouse branch and are refused in place by CR-AC-07, which is why no
// path exists from a refusal to the landing resolver.
export const rootCatchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTE_SEGMENTS.SPLAT,
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: ROUTES.HOME });
  },
});
