import { RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from 'router';
import { ROUTES } from 'shared/constants/routes';
import { makeStore } from 'store';

import type { AppRouter } from 'router';
import type { AppStore } from 'store';

// T7 — `/` is the application's one landing resolver (CR-AC-08) and the
// destination every unmatched address falls back to (CR-AC-16). These cases
// exercise the real production route tree through `createAppRouter`, because
// what is under test is the ORDER of navigations the router performs, which a
// component-level harness cannot observe.
const WAREHOUSE_A = '00000000-0000-4000-8000-000000000010';
const WAREHOUSE_B = '00000000-0000-4000-8000-000000000011';
const SESSION_USER = { id: '00000000-0000-4000-8000-000000000001' };

const NO_CONTEXT_HEADING = 'Nothing is entered yet';
const ERROR_HEADING = 'Something went wrong';

type ContextOverrides = {
  effectiveWarehouseId?: string | null;
  warehouseIds?: readonly string[];
  workspacePermissionIds?: readonly WorkspacePermissionId[];
};

const workspaceContextBody = ({
  effectiveWarehouseId = null,
  warehouseIds = [],
  workspacePermissionIds = [],
}: ContextOverrides): Record<string, unknown> => ({
  workspace: { id: '00000000-0000-4000-8000-000000000020', name: 'Acme' },
  workspacePermissionIds,
  warehouses: warehouseIds.map((warehouseId, index) => ({
    warehouseId,
    name: `Warehouse ${index + 1}`,
    archivedAt: null,
    roleId: '00000000-0000-4000-8000-000000000030',
    roleKind: 'custom',
  })),
  effectiveWarehouseId,
});

type ServerOptions = ContextOverrides & {
  /** Answers the actor-context read with a failure instead of a body. */
  contextFails?: boolean;
  /**
   * Fails only the FIRST actor-context read and answers every later one
   * normally — the shape a retry has to distinguish itself against.
   */
  contextFailsOnce?: boolean;
  /** Leaves the actor-context read unresolved, so landing stays pending. */
  contextPending?: boolean;
  authenticated?: boolean;
};

const stubServer = ({
  authenticated = true,
  contextFails = false,
  contextFailsOnce = false,
  contextPending = false,
  ...context
}: ServerOptions = {}): ReturnType<typeof vi.fn> => {
  let contextReads = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/api/v1/auth/session')) {
      // No session is a 204 with no body, which resolves to "anonymous". A
      // 4xx/5xx here would be a FAILED read — a different outcome entirely.
      return Promise.resolve(
        authenticated
          ? Response.json({ user: SESSION_USER })
          : new Response(null, { status: 204 }),
      );
    }
    if (url.includes('/api/v1/workspace/context')) {
      if (contextPending) {
        return new Promise<Response>(() => {});
      }
      contextReads += 1;
      const fails = contextFails || (contextFailsOnce && contextReads === 1);
      return Promise.resolve(
        fails
          ? Response.json({}, { status: 500 })
          : Response.json(workspaceContextBody(context)),
      );
    }
    // Every other read (a Warehouse's access projection, the Workspace's own
    // datasets) is answered empty: what these cases assert is where the actor
    // LANDS, not what the destination then renders.
    return Promise.resolve(
      Response.json({
        items: [],
        hasNext: false,
        hasPrev: false,
        nextCursor: null,
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderRoute = (
  initialEntry: string,
): { router: AppRouter; store: AppStore } => {
  const store = makeStore();
  const router = createAppRouter({
    appStore: store,
    initialEntries: [initialEntry],
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return { router, store };
};

describe('landing resolution at / (T7)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // CR-AC-08 rule (1). The actor also has a live effective Warehouse, so this
  // case additionally proves rule (1) is evaluated before rule (2).
  it('resolves an actor holding administration authority into the Workspace view (rule 1)', async () => {
    stubServer({
      workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
      effectiveWarehouseId: WAREHOUSE_A,
      warehouseIds: [WAREHOUSE_A],
    });

    const { router } = renderRoute(ROUTES.HOME);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ROUTES.WORKSPACE),
    );
  });

  // CR-AC-10 — a registrant's Workspace Owner Role carries all four
  // administration Permissions, so they land in their new Workspace by rule (1).
  it('lands a registrant holding the Workspace Owner Role in the Workspace view (CR-AC-10)', async () => {
    stubServer({
      workspacePermissionIds: [
        WorkspacePermissionId.WAREHOUSES_WATCH,
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
        WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
        WorkspacePermissionId.WORKSPACE_RENAME,
      ],
      effectiveWarehouseId: WAREHOUSE_A,
      warehouseIds: [WAREHOUSE_A],
    });

    const { router } = renderRoute(ROUTES.HOME);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ROUTES.WORKSPACE),
    );
  });

  // CR-AC-08 rule (2) / CR-RG-04 — the derivation is consumed unchanged.
  it('resolves the Warehouse the derivation names into that Warehouse view (rule 2)', async () => {
    stubServer({
      effectiveWarehouseId: WAREHOUSE_B,
      warehouseIds: [WAREHOUSE_A, WAREHOUSE_B],
    });

    const { router } = renderRoute(ROUTES.HOME);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/warehouses/${WAREHOUSE_B}`),
    );
  });

  // CR-AC-08 rule (3) / CR-RG-04 — two live memberships and no stored
  // selection is exactly the shape a membership-picking heuristic would
  // resolve. The actor must remain at the root instead.
  it('leaves an actor with several memberships and no stored selection at the root (rule 3)', async () => {
    stubServer({
      effectiveWarehouseId: null,
      warehouseIds: [WAREHOUSE_A, WAREHOUSE_B],
    });

    const { router } = renderRoute(ROUTES.HOME);

    expect(await screen.findByText(NO_CONTEXT_HEADING)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(ROUTES.HOME);
  });

  // CR-AC-08 — "exactly one navigation follows and the actor is never shown a
  // context they are then moved out of". Counting the router's own history
  // entries is what makes the "exactly one" clause testable.
  it('resolves landing in exactly one navigation', async () => {
    stubServer({
      effectiveWarehouseId: WAREHOUSE_A,
      warehouseIds: [WAREHOUSE_A],
    });

    const { router } = renderRoute(ROUTES.HOME);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/warehouses/${WAREHOUSE_A}`),
    );

    // A second resolution would have bounced the actor back through `/`.
    expect(router.history.length).toBe(1);
  });

  // CR-AC-08 — while the read is unresolved the actor stays at the root and NO
  // rule is evaluated, so they are never shown a context they are then moved
  // out of. The no-context state is a RESOLVED outcome (rule 3) and must not
  // appear during the pending window.
  it('evaluates no rule while the context read is unresolved', async () => {
    stubServer({ contextPending: true });

    const { router } = renderRoute(ROUTES.HOME);

    await waitFor(() => expect(router.state.isLoading).toBe(false), {
      timeout: 50,
    }).catch(() => undefined);

    expect(router.state.location.pathname).toBe(ROUTES.HOME);
    expect(screen.queryByText(NO_CONTEXT_HEADING)).not.toBeInTheDocument();
    expect(screen.queryByText(ERROR_HEADING)).not.toBeInTheDocument();
  });

  // CR-AC-08 final paragraph — a failed read means the actor's access is
  // UNKNOWN, not that they have none, so the root renders the standard error
  // state with a way to retry and NOT the no-context state.
  it('renders the route error state, not the no-context state, when the read fails', async () => {
    stubServer({ contextFails: true });

    const { router } = renderRoute(ROUTES.HOME);

    expect(await screen.findByText(ERROR_HEADING)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NO_CONTEXT_HEADING)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(ROUTES.HOME);
  });

  // CR-AC-08 — "a way to retry" means the failed read is re-issued, not that a
  // button exists. Clearing the React error boundary alone leaves the route
  // match in its error state, so it re-throws the same error and the actor is
  // stuck on a screen whose only control does nothing.
  it('re-runs the failed read and lands the actor when the retry is activated', async () => {
    stubServer({
      contextFailsOnce: true,
      workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
    });
    const user = userEvent.setup();

    const { router } = renderRoute(ROUTES.HOME);
    expect(await screen.findByText(ERROR_HEADING)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    // The second read succeeds, so rule (1) resolves and the actor lands.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ROUTES.WORKSPACE),
    );
    expect(screen.queryByText(ERROR_HEADING)).not.toBeInTheDocument();
  });

  // CR-RG-05 — `workspace.guard.ts` refuses `/workspace` against the identical
  // administration set rule (1) admits on, so an actor it bounces to `/` can
  // never be sent straight back at it. Landing settles, rather than ping-ponging.
  it('never bounces an actor between / and /workspace (CR-RG-05)', async () => {
    stubServer({ effectiveWarehouseId: null, warehouseIds: [] });

    const { router } = renderRoute(ROUTES.WORKSPACE);

    // The guard refuses and sends them to `/`, where rule (1) cannot match
    // (same set) and rule (2) has nothing to name, so they settle at the root.
    expect(await screen.findByText(NO_CONTEXT_HEADING)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(ROUTES.HOME);
  });
});

describe('unmatched addresses (T7, CR-AC-16)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // CR-AC-16 — a bookmarked `/access` stops resolving under CH-03, and is the
  // named example in the criterion.
  it.each([
    ['a bookmarked /access', '/access'],
    ['an address naming no destination', '/nothing/here'],
  ])(
    'sends %s to the root, where landing resolves it',
    async (_label, entry) => {
      stubServer({ effectiveWarehouseId: null, warehouseIds: [] });

      const { router } = renderRoute(entry);

      expect(await screen.findByText(NO_CONTEXT_HEADING)).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(ROUTES.HOME);
    },
  );

  // The unmatched address performs no Warehouse resolution of its own: it
  // hands the actor to the landing resolver, which applies the same rules it
  // applies to every other arrival.
  it('resolves an unmatched address through the landing rules, not to a default', async () => {
    stubServer({
      effectiveWarehouseId: WAREHOUSE_A,
      warehouseIds: [WAREHOUSE_A],
    });

    const { router } = renderRoute('/nothing/here');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/warehouses/${WAREHOUSE_A}`),
    );
  });

  // CR-AC-16 — "An unauthenticated actor opening an unmatched address
  // continues to reach sign-in through the existing auth guard, unchanged."
  it('still sends an unauthenticated actor to sign-in', async () => {
    stubServer({ authenticated: false });

    const { router } = renderRoute('/nothing/here');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(ROUTES.LOGIN),
    );
  });
});
