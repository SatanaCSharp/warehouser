import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { requireAuth } from 'guards/auth.guard';
import { requireWorkspaceCapability } from 'guards/workspace.guard';
import { loadWorkspaceAdministration } from 'modules/workspace/loaders/workspace-administration.loader';
import { rootRoute } from 'routes/__root.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { RoutePendingState } from 'shared/components/RoutePendingState';
import { ROUTES } from 'shared/constants/routes';

// T1 / CH-02, CH-02a — the destination's first-paint readiness is the route's
// (`change.md` CH-01). `beforeLoad` authenticates and then awaits the
// Workspace context, and until this declaration nothing painted for that
// window: the actor stayed on the page they came from (CR-AC-02).
// `errorComponent` paints the standard error state when that primary read
// fails, rather than letting the rejection propagate to the root (CH-02a).
export const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.WORKSPACE,
  component: lazyRouteComponent(() => import('./page'), 'WorkspacePage'),
  errorComponent: RouteErrorState,
  pendingComponent: RoutePendingState,
  // A root child with no live parent destination behind it, so there is
  // nothing to keep on screen: the awaited window is a real network round
  // trip and is painted immediately. The router's own default is 1000 ms.
  pendingMs: 0,
  // TanStack's default is 500 ms, which would hold the pending state on
  // screen after the context had arrived (`sad.md` §5.1).
  pendingMinMs: 0,
  // T4 / CH-03 — the destination's first-paint readiness is the route's, so
  // every tab dataset the actor's Workspace Permissions admit is awaited here
  // rather than fetched after the page mounts (CR-AC-03). The dispatches live
  // in `loaders/`, so this file keeps the shape `frontend-architecture.md`
  // §Route gives it: loader wiring, and no dispatch of its own (ADR 0001).
  loader: loadWorkspaceAdministration,
  beforeLoad: async (opts) => {
    await requireAuth(opts.context);
    await requireWorkspaceCapability(opts.context);
  },
});
