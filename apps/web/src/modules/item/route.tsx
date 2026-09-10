import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { ItemPendingState } from 'modules/item/components/ItemPendingState';
import { loadItems } from 'modules/item/loaders/item.loader';
import { warehouseRoute } from 'routes/warehouse.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { ROUTE_SEGMENTS } from 'shared/constants/routes';

// T18 — the Items destination (sad.md §5 Web). A child of the Warehouse
// layout, which already authenticates and resolves entry, so this route
// declares no `beforeLoad` of its own. It awaits the Items list its
// destination paints (`frontend-architecture.md` §Route); the dispatch itself
// lives in `loaders/item.loader.ts`, wired here only.
//
// Its waiting state is the table's own shape rather than the application-level
// spinner, because this destination has one worth drawing (design-handoff.md
// §States, frame `hWFRW` tile `EZn9c`). It is declared here for the same reason
// the loader is: readiness belongs to the route.
export const itemRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: ROUTE_SEGMENTS.ITEMS,
  component: lazyRouteComponent(() => import('./page'), 'ItemPage'),
  errorComponent: RouteErrorState,
  loader: loadItems,
  pendingComponent: ItemPendingState,
});
