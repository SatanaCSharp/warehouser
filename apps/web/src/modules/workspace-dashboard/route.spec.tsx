import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { loadWorkspaceDashboard } from 'modules/workspace-dashboard/loaders/workspace-dashboard.loader';
import { workspaceDashboardRoute } from 'modules/workspace-dashboard/route';
import { Provider } from 'react-redux';
import type { AppRouter } from 'router';
import { createAppRouter } from 'router';
import { rootRoute } from 'routes/__root.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { RoutePendingState } from 'shared/components/RoutePendingState';
import { ROUTES } from 'shared/constants/routes';
import { authenticatedStore } from 'test/access-fixtures';
import {
  stubWorkspaceDashboardServer,
  workspacePanelMarkers,
} from 'test/dashboard-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T19 — the Workspace Dashboard's route declaration and the address it serves
// (AC-15). Colocated with `modules/workspace-dashboard/route.tsx`, the
// declaration these cases pin (`placing-web-tests.md` §1).
//
// **The criterion this file exists for.** AC-15 and frame `ujNPP` tile 1
// require a denial **rendered at the address**, not a redirect away from it:
// the route authenticates and performs no capability check of its own. A
// `requireWorkspaceCapability` copied from `modules/workspace/route.tsx` would
// satisfy every other case in this feature and break exactly this one, which is
// why both the behaviour and the declaration are asserted.

const toast = vi.hoisted(() => {
  const fn = vi.fn(() => 'pending-key');
  return Object.assign(fn, {
    danger: vi.fn((_message: unknown, options?: { onClose?: () => void }) => {
      options?.onClose?.();
      return 'toast-key';
    }),
    success: vi.fn(() => 'toast-key'),
    close: vi.fn(),
  });
});

vi.mock('shared/alerts/toast', () => ({ toast }));

const ROUTE_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'route.tsx',
);

const enterAddress = (
  workspacePermissionIds: readonly WorkspacePermissionId[],
): AppRouter => {
  stubWorkspaceDashboardServer({ workspacePermissionIds });
  const store = authenticatedStore();
  const router = createAppRouter({
    appStore: store,
    initialEntries: [ROUTES.WORKSPACE_DASHBOARD],
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return router;
};

const matchedTheDashboard = (router: AppRouter): boolean =>
  router.state.matches.some(
    (match) => match.routeId === workspaceDashboardRoute.id,
  );

describe('workspaceDashboardRoute', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // `design-handoff.md` § Addresses and navigation — the Workspace Dashboard
  // takes the new nested address rather than becoming the Workspace landing,
  // and `/workspace` stays the administration destination unchanged.
  it('is declared at /workspace/dashboard as a flat sibling of /workspace', () => {
    expect(ROUTES.WORKSPACE).toBe('/workspace');
    expect(ROUTES.WORKSPACE_DASHBOARD).toBe('/workspace/dashboard');
    // Read from the `Route` instance rather than from `options`: TanStack types
    // `RoutePathOptions` as `{ path } | { id }`, so `options.path` is
    // inaccessible on every route in this repository. `fullPath` is the
    // address the assembled tree resolves this route at, which is the claim —
    // `path` alone is the segment with its leading slash trimmed.
    expect(workspaceDashboardRoute.fullPath).toBe(ROUTES.WORKSPACE_DASHBOARD);
    // A root child, so it inherits nothing from the administration route — in
    // particular not that route's capability guard (ADR 14-08's promotion rule,
    // sad.md §5).
    expect(workspaceDashboardRoute.options.getParentRoute?.()).toBe(rootRoute);
  });

  // `guides/adding-a-web-module.md` §5 — `errorComponent` comes with the
  // loader, so a failed primary read paints; the route's `pendingComponent` is
  // the destination's only waiting affordance, and the dispatches live in
  // `loaders/` rather than here (`frontend-architecture.md` §Route).
  it('wires the loader and declares the pending and error components beside it', () => {
    expect(workspaceDashboardRoute.options.loader).toBe(loadWorkspaceDashboard);
    expect(workspaceDashboardRoute.options.errorComponent).toBe(
      RouteErrorState,
    );
    expect(workspaceDashboardRoute.options.pendingComponent).toBe(
      RoutePendingState,
    );
  });

  // AC-15 — the declaration itself, asserted one commit earlier than a render
  // can: the route authenticates and names no capability guard at all.
  it('declares authentication only and no capability guard', () => {
    const source = readFileSync(ROUTE_SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');

    expect(source).toMatch(/requireAuth/u);
    expect(source).not.toMatch(/requireWorkspaceCapability/u);
    expect(source).not.toMatch(/redirect/u);
  });

  // AC-15 — the address is reached by a stale link, a bookmark or a revoked
  // grant, and what it serves is the denial **at that address**. The
  // administration route redirects an actor carrying none of its Permissions to
  // `/`; this one must not.
  it('renders the denial at the address instead of redirecting when the Permission is absent', async () => {
    const router = enterAddress([]);

    await waitFor(() => {
      expect(matchedTheDashboard(router)).toBe(true);
    });
    expect(router.state.location.pathname).toBe(ROUTES.WORKSPACE_DASHBOARD);
    expect(
      screen.queryByText(workspacePanelMarkers.demandPressure),
    ).not.toBeInTheDocument();
  });

  // AC-14 — and the holder reaches the figures at the same address, so the
  // absence above is the Permission and not the address.
  it('paints the Panels at the address for an actor holding the Permission', async () => {
    const router = enterAddress([
      WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
    ]);

    expect(
      await screen.findByText(workspacePanelMarkers.demandPressure),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(ROUTES.WORKSPACE_DASHBOARD);
  });
});
