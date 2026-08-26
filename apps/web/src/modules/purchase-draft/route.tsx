import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

import { loadPurchaseDrafts } from 'modules/purchase-draft/loaders/purchase-draft.loader';
import { warehouseRoute } from 'routes/warehouse.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { RoutePendingState } from 'shared/components/RoutePendingState';
import { ROUTE_SEGMENTS } from 'shared/constants/routes';

// T20 — the Purchase drafts destination (sad.md §5 Web, design-handoff.md
// `yGhkK`/`F0SpRx`/`O42LHI`). A child of the Warehouse layout, which already
// authenticates and resolves entry, so this route declares no `beforeLoad`
// of its own. It awaits the Purchase Draft summaries its destination paints
// (`frontend-architecture.md` §Route); the dispatch itself lives in
// `loaders/purchase-draft.loader.ts`, wired here only.
export const purchaseDraftRoute = createRoute({
  getParentRoute: () => warehouseRoute,
  path: ROUTE_SEGMENTS.PURCHASE_DRAFTS,
  component: lazyRouteComponent(() => import('./page'), 'PurchaseDraftPage'),
  errorComponent: RouteErrorState,
  loader: loadPurchaseDrafts,
  pendingComponent: RoutePendingState,
});
