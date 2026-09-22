import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { requireAuth } from 'guards/auth.guard';
import { loadWorkspaceDashboard } from 'modules/workspace/dashboard/loaders/workspace-dashboard.loader';
import { rootRoute } from 'routes/__root.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { RoutePendingState } from 'shared/components/RoutePendingState';
import { ROUTES } from 'shared/constants/routes';

// T19 — the Workspace Dashboard's address. A flat root child rather than a
// child of `/workspace`: a module has exactly one `route.tsx` and one
// `page.tsx`, and `/workspace` is already occupied by administration, so the
// Workspace Dashboard is its own flat sibling module (ADR 14-08's promotion
// rule, sad.md §5). It therefore inherits nothing from the administration
// route — in particular not that route's capability guard.
//
// **It declares authentication only.** AC-15 and frame `ujNPP` tile 1 require
// the denial to be rendered **at** the address, not redirected away from it:
// the address is what a stale link, a bookmark or a revoked grant meets, and
// what it must serve is the statement. So there is no capability guard here;
// the loader decides what to dispatch and the page chooses between the two
// whole surfaces (`docs/system/adr/19-08-2026-declarative-permission-gates.md`
// §Decision 3).
//
// The destination paints four server-read Panels, so the route awaits every
// one of them before it mounts (`frontend-architecture.md` §Route). The
// dispatches themselves live in `loaders/workspace-dashboard.loader.ts`, wired
// here only — this file holds routing concerns and no dispatch of its own.
//
// `pendingComponent` and `errorComponent` come with the loader, so the awaited
// window and a failed primary read both paint
// (`guides/adding-a-web-module.md` §5). Without the latter a rejected context
// read would leave this match in `error` with no boundary of its own and paint
// an empty outlet.
export const workspaceDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.WORKSPACE_DASHBOARD,
  component: lazyRouteComponent(
    () => import('./page'),
    'WorkspaceDashboardPage',
  ),
  errorComponent: RouteErrorState,
  pendingComponent: RoutePendingState,
  // A root child with no live parent destination behind it, so there is
  // nothing to keep on screen: the awaited window is a real network round trip
  // and is painted immediately. The router's own default is 1000 ms, and
  // TanStack's `pendingMinMs` default of 500 ms would hold the pending state
  // on screen after the figures had arrived (sad.md §5.1) — the same pair
  // `modules/workspace/route.tsx` declares for the same reason.
  pendingMs: 0,
  pendingMinMs: 0,
  loader: loadWorkspaceDashboard,
  beforeLoad: ({ context }) => requireAuth(context),
});
