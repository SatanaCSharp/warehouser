import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { PurchaseDraftPendingState } from 'modules/purchase-draft/components/PurchaseDraftPendingState';
import { loadPurchaseDrafts } from 'modules/purchase-draft/loaders/purchase-draft.loader';
import { warehouseRoute } from 'routes/warehouse.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
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
  // The destination's own waiting affordance rather than the application-level
  // spinner: this list has a shape worth drawing, so the skeleton reads as the
  // drafts arriving (design-handoff.md §States, frame `hWFRW`).
  pendingComponent: PurchaseDraftPendingState,
});
