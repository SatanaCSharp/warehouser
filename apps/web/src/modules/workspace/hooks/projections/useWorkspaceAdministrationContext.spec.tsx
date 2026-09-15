import type { ErrorComponentProps } from '@tanstack/react-router';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useWorkspaceAdministrationContext } from 'modules/workspace/hooks/projections/useWorkspaceAdministrationContext';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import { ROUTES } from 'shared/constants/routes';
import type { AppStore } from 'store';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
} from 'test/workspace-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T12 / CR-AC-05 (amended by `global-loader/sad.md` §11) — the non-optional
// `WorkspaceContext` is route-scoped. This suite builds its own tiny route
// tree rather than the production one, exactly as
// `shared/hooks/projections/useEnteredWarehouse.spec.tsx` does: all the hook
// needs is a route whose id equals `ROUTES.WORKSPACE`, so the production
// `workspaceRoute` singleton is never imported or mutated here.

/**
 * CR-AC-05's type guarantee, checked by `tsc -p tsconfig.json --noEmit` rather
 * than at runtime: the projection returns `WorkspaceContext`, never
 * `WorkspaceContext | undefined`. Widening the return type makes the
 * declaration below stop compiling, which is the only place that fact can be
 * asserted — the contract `WarehouseSwitcher` and `RetainedContextMessage`
 * read keeps its optional field for the shell (`sad.md` §4.6).
 */
type ReturnsNonOptionalContext =
  undefined extends ReturnType<typeof useWorkspaceAdministrationContext>
    ? false
    : true;

const returnsNonOptionalContext: ReturnsNonOptionalContext = true;

/**
 * Consumes the projection the way `WorkspaceAdministration` does — no `?.`,
 * no `??`, no branch — so this probe only compiles while the guarantee holds.
 */
const Probe = (): ReactElement => {
  const { warehouses, workspace } = useWorkspaceAdministrationContext();

  return (
    <p data-testid="probe">{`${workspace.name} · ${warehouses.length}`}</p>
  );
};

/** Surfaces the refusal the projection throws, which its route boundary catches. */
const ProbeError = ({ error }: ErrorComponentProps): ReactElement => (
  <p data-testid="probe-error">{error.message}</p>
);

const primeWorkspaceContext = async (store: AppStore): Promise<void> => {
  await store
    .dispatch(
      workspaceContextApi.endpoints.getWorkspaceContext.initiate(undefined, {
        subscribe: false,
      }),
    )
    .unwrap();
};

const renderProbeAt = (initialEntry: string, store: AppStore): void => {
  const testRootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: () => <Outlet />,
  });
  const homeProbeRoute = createRoute({
    component: Probe,
    errorComponent: ProbeError,
    getParentRoute: () => testRootRoute,
    path: ROUTES.HOME,
  });
  // The probe is this route's own component, as `WorkspacePage` is
  // `workspaceRoute`'s: the match the hook reads is the one it renders in.
  const workspaceProbeRoute = createRoute({
    component: Probe,
    errorComponent: ProbeError,
    getParentRoute: () => testRootRoute,
    path: ROUTES.WORKSPACE,
  });

  const router = createRouter({
    context: { store },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: testRootRoute.addChildren([homeProbeRoute, workspaceProbeRoute]),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

describe('useWorkspaceAdministrationContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the Workspace context, non-optional, inside the guarded Workspace match', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    });
    const store = authenticatedWorkspaceStore();
    // What `requireWorkspaceCapability` has already done by the time the
    // destination renders: the entry is in the cache before the first paint.
    await primeWorkspaceContext(store);

    renderProbeAt(ROUTES.WORKSPACE, store);

    expect(await screen.findByTestId('probe')).toHaveTextContent(
      'Acme Logistics · 1',
    );
    // The compile-time half of the same claim (see the type above).
    expect(returnsNonOptionalContext).toBe(true);
  });

  it('refuses to answer outside the Workspace match, where nothing has awaited the context', async () => {
    stubWorkspaceServer({
      context: namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    });
    const store = authenticatedWorkspaceStore();
    await primeWorkspaceContext(store);

    // The shell reads the same cache entry through
    // `useCurrentWorkspaceContext`, whose field stays optional (CR-RG-08).
    // This projection is not that read, and says so rather than answering
    // from a cache no route has guaranteed.
    renderProbeAt(ROUTES.HOME, store);

    expect(await screen.findByTestId('probe-error')).toHaveTextContent(
      /inside the Workspace route/iu,
    );
  });

  it('never invents a context when the guaranteed entry is absent', async () => {
    // The falsifier for the type: with nothing awaited, the projection throws
    // rather than returning `undefined` behind a non-optional signature.
    stubWorkspaceServer({
      context: namedWorkspaceContext([WorkspacePermissionId.WAREHOUSES_WATCH]),
    });

    renderProbeAt(ROUTES.WORKSPACE, authenticatedWorkspaceStore());

    expect(await screen.findByTestId('probe-error')).toHaveTextContent(
      /Workspace context/iu,
    );
  });
});
