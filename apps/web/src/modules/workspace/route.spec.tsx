import { RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadWorkspaceAdministration } from 'modules/workspace/loaders/workspace-administration.loader';
import { workspaceRoute } from 'modules/workspace/route';
import { createAppRouter } from 'router';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { RoutePendingState } from 'shared/components/RoutePendingState';
import { ROUTES } from 'shared/constants/routes';
import { makeStore } from 'store';
import { stubWorkspaceServer, workspaceIds } from 'test/workspace-fixtures';

import type { AppRouter } from 'router';

// T1 / CH-02, CH-02a — the Workspace administration route's own pending and
// error contract. Its `beforeLoad` authenticates and then awaits the Workspace
// context before the destination may render, and until this change nothing
// painted for that window: the actor stayed on the page they came from
// (`change.md` §3, CH-02). Colocated with `modules/workspace/route.tsx`, the
// declaration these cases pin (`placing-web-tests.md` §1).

const WORKSPACE_HEADING = 'Acme Logistics';
// `common.json` `shell.landing.pendingLabel` — the copy `RoutePendingState`
// renders, and after CH-12 the application's only waiting copy.
const PENDING_LABEL = 'Preparing your workspace…';

/**
 * How long the Workspace-context read is held for. `workspaceRoute` carries
 * `pendingMs: 0`, so any real delay is enough for the pending state to paint;
 * the value only has to leave room for the destination to be observed
 * replacing it afterwards.
 */
const DELAYED_CONTEXT_MS = 300;

/**
 * The Workspace's own fixtures, plus the session restore `requireAuth` needs
 * and a held Workspace-context read. Wrapping the fixture stub rather than
 * replacing it keeps every other read — the Warehouses, users, Roles,
 * Permissions and members the destination's tabs ask for — answered exactly as
 * the rest of the suite answers them.
 */
const stubWorkspaceSession = (contextDelayMs: number): void => {
  stubWorkspaceServer();
  const answer = globalThis.fetch;

  vi.stubGlobal(
    'fetch',
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input instanceof Request ? input.url : input);

      if (url.endsWith('/api/v1/auth/session')) {
        return Promise.resolve(
          Response.json({ user: { id: workspaceIds.actingUser } }),
        );
      }

      const answered = answer(input, init);
      if (!url.includes('/api/v1/workspace/context')) {
        return answered;
      }

      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(answered), contextDelayMs);
      });
    },
  );
};

const renderWorkspaceRoute = (): { router: AppRouter } => {
  const store = makeStore();
  const router = createAppRouter({
    appStore: store,
    initialEntries: [ROUTES.WORKSPACE],
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return { router };
};

describe('the workspace route paints its await window (T1, CR-AC-02)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // CR-AC-02 — "`RoutePendingState` is on screen while `beforeLoad`/`loader`
  // is outstanding, and is replaced by the destination when the route
  // settles". Driven through the production route tree, so the shipped
  // `pendingComponent` is the one under test: a re-declared probe route would
  // stay green after the declaration was deleted.
  it('paints the pending state while the guard is outstanding and replaces it with the destination', async () => {
    stubWorkspaceSession(DELAYED_CONTEXT_MS);

    const { router } = renderWorkspaceRoute();

    expect(await screen.findByText(PENDING_LABEL)).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { name: WORKSPACE_HEADING }),
    ).toBeInTheDocument();
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(ROUTES.WORKSPACE);
  });

  // `sad.md` §5.1 — a root child with no live parent destination behind it,
  // whose awaited window is a real network round trip, so it paints
  // immediately rather than after a threshold. Asserted on the shipped route
  // object because neither value is inferable from the option name: the
  // router's own defaults are 1000 ms and 500 ms, and the second would hold
  // the fallback on screen after the context had arrived.
  it('declares an immediate pending state and no minimum display time', () => {
    expect(workspaceRoute.options.pendingComponent).toBe(RoutePendingState);
    expect(workspaceRoute.options.errorComponent).toBe(RouteErrorState);
    expect(workspaceRoute.options.pendingMs).toBe(0);
    expect(workspaceRoute.options.pendingMinMs).toBe(0);
  });

  // T4 / CH-03 — the destination's datasets are awaited by the route, and the
  // function that dispatches them lives in `loaders/` rather than here, so
  // `route.tsx` keeps the shape `frontend-architecture.md` §Route gives it:
  // loader *wiring*, and no dispatch (ADR 0001).
  it('declares the workspace administration loader (CR-AC-03)', () => {
    expect(workspaceRoute.options.loader).toBe(loadWorkspaceAdministration);
  });
});
