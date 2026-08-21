import { RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadAccessSurface } from 'modules/access/loaders/access-surface.loader';
import { accessRoute } from 'modules/access/route';
import { createAppRouter } from 'router';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { RoutePendingState } from 'shared/components/RoutePendingState';
import { ROUTES } from 'shared/constants/routes';
import { makeStore } from 'store';
import {
  stubWarehouseSession,
  warehouseMemberships,
  warehouseSessionIds,
} from 'test/workspace-fixtures';

import type { AppRouter } from 'router';
import type { AppStore } from 'store';

const NON_DISCLOSING_REFUSAL = "This address isn't available to you";
// `common.json` `shell.landing.pendingLabel` — the copy `RoutePendingState`
// renders, and after CH-12 the application's only waiting copy.
const PENDING_LABEL = 'Preparing your workspace…';

const readableAccess = {
  warehouseId: '00000000-0000-4000-8000-000000000002',
  roleId: '00000000-0000-4000-8000-000000000003',
} as const;

// T6 / CH-03 — the access surface is a child of the Warehouse layout, so every
// case that opens it names the Warehouse it is opening in the address.
const accessAddress = (warehouseId: string): string =>
  `/warehouses/${warehouseId}/access`;

// T6 / CR-AC-07 — reaching a Warehouse address at all requires a membership in
// the addressed Warehouse, which the actor context is the sole source of.
const membershipsIn = (
  ...warehouseIds: readonly string[]
): Record<string, unknown>[] =>
  warehouseIds.map((warehouseId, index) => ({
    warehouseId,
    name: `Warehouse ${index + 1}`,
    archivedAt: null,
    roleId: readableAccess.roleId,
    roleKind: 'custom',
  }));

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

// T6 — the access surface is now a child of the Warehouse layout, so the
// Warehouse it operates on is the one its address names. These cases prove the
// two consequences the relocation exists for: authority follows the addressed
// Warehouse alone (CR-AC-06), and entry follows membership rather than the
// capability the surface happens to need (CR-AC-21).
describe('Warehouse access address (T6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const W1 = '00000000-0000-4000-8000-000000000060';
  const W2 = '00000000-0000-4000-8000-000000000061';
  const ROLE_IN_W1 = '00000000-0000-4000-8000-000000000062';
  const ROLE_IN_W2 = '00000000-0000-4000-8000-000000000063';

  const page = (items: unknown[]): Record<string, unknown> => ({
    items,
    hasNext: false,
    hasPrev: false,
    nextCursor: null,
  });

  /**
   * Answers each Warehouse's own access reads at its own exact per-Warehouse
   * URL, with a deliberately different Role, Permission catalogue and member in
   * each. A request that forgets its Warehouse, or names the other one, 404s
   * here — which is how these cases prove the surface read the address.
   */
  const stubTwoWarehouses = (
    permissionsIn: Record<string, string[]>,
  ): ReturnType<typeof vi.fn> => {
    const perWarehouse: Record<string, Record<string, unknown>> = {
      [W1]: {
        current: {
          warehouseId: W1,
          roleId: ROLE_IN_W1,
          roleKind: 'custom',
          permissionIds: permissionsIn[W1],
          archivedAt: null,
        },
        roles: page([
          {
            id: ROLE_IN_W1,
            name: 'North Operators',
            assignedMemberCount: 1,
            kind: 'custom',
            permissionIds: permissionsIn[W1],
          },
        ]),
        permissions: page([
          { id: 'ROLES:WATCH', label: 'View roles', kind: 'assignable' },
        ]),
        members: page([
          {
            userId: '00000000-0000-4000-8000-000000000064',
            roleId: ROLE_IN_W1,
            roleKind: 'custom',
            email: 'north@example.test',
          },
        ]),
      },
      [W2]: {
        current: {
          warehouseId: W2,
          roleId: ROLE_IN_W2,
          roleKind: 'custom',
          permissionIds: permissionsIn[W2],
          archivedAt: null,
        },
        roles: page([
          {
            id: ROLE_IN_W2,
            name: 'South Pickers',
            assignedMemberCount: 1,
            kind: 'custom',
            permissionIds: permissionsIn[W2],
          },
        ]),
        permissions: page([
          { id: 'USERS:WATCH', label: 'View members', kind: 'assignable' },
        ]),
        members: page([
          {
            userId: '00000000-0000-4000-8000-000000000065',
            roleId: ROLE_IN_W2,
            roleKind: 'custom',
            email: 'south@example.test',
          },
        ]),
      },
    };

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/api/v1/auth/session')) {
        return Promise.resolve(
          Response.json({
            user: { id: '00000000-0000-4000-8000-000000000001' },
          }),
        );
      }
      if (url.includes('/api/v1/workspace/context')) {
        return Promise.resolve(
          Response.json({
            workspace: {
              id: '00000000-0000-4000-8000-000000000020',
              name: 'Acme Logistics',
            },
            workspacePermissionIds: [],
            warehouses: membershipsIn(W1, W2),
            effectiveWarehouseId: null,
          }),
        );
      }
      const match =
        /\/api\/v1\/warehouses\/(?<warehouseId>[^/]+)\/access\/(?<read>\w+)$/u.exec(
          url,
        );
      const { warehouseId, read } = match?.groups ?? {};
      const resource =
        warehouseId && read ? perWarehouse[warehouseId]?.[read] : undefined;
      return Promise.resolve(
        resource ? Response.json(resource) : Response.json({}, { status: 404 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  // CR-AC-06 — each address shows that named Warehouse's own Roles, Permission
  // catalogue and members, and gates every control by the Role held in that
  // named Warehouse alone. The Role held in W1 carries ROLES:WATCH and the one
  // held in W2 carries only USERS:WATCH, so the tabs each address offers are
  // themselves proof of which Warehouse's authority was applied.
  it('shows each addressed Warehouse its own access data, gated by the Role held there (CR-AC-06)', async () => {
    stubTwoWarehouses({ [W1]: ['ROLES:WATCH'], [W2]: ['USERS:WATCH'] });

    const { router } = renderRoute(accessAddress(W1));

    expect(await screen.findByText('North Operators')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Roles' })).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Members' }),
    ).not.toBeInTheDocument();

    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE_ACCESS,
        params: { warehouseId: W2 },
      });
    });

    expect(await screen.findByRole('tab', { name: 'Members' })).toBeVisible();
    expect(await screen.findByText('south@example.test')).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Roles' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('North Operators')).not.toBeInTheDocument();
    expect(screen.queryByText('north@example.test')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(accessAddress(W2));
  });

  // CR-AC-21 — entry follows membership, and the access address carries no
  // capability gate of its own. A member of W holding neither ROLES:WATCH nor
  // USERS:WATCH is therefore admitted to W and finds the surface unpopulated —
  // deliberately distinct from CR-AC-07's refusal, and never a redirect.
  it('admits a member holding neither watch Permission and reports the surface unavailable (CR-AC-21)', async () => {
    stubTwoWarehouses({ [W1]: [], [W2]: ['USERS:WATCH'] });

    const { router } = renderRoute(accessAddress(W1));

    expect(
      await screen.findByRole('heading', { name: 'Access unavailable' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(accessAddress(W1));
    expect(
      screen.queryByText("This address isn't available to you"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});

// T1 / CH-02, CH-02a — the access surface's own pending and error contract.
// `accessRoute` is a CHILD of the Warehouse layout route, so the two await
// windows it sits between — the parent's entry verdict and (from T5) its own
// loader — must resolve to ONE pending state rather than two
// ([ADR 0002](../../../../docs/change-requests/global-loader/adr/0002-one-pending-boundary-per-route-branch.md)).
describe("the access route's pending contract (T1, CR-AC-02, CR-RG-04)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ADR 0002's decision outcome, asserted on the shipped route object because
  // it is the declaration itself that carries the behaviour: the
  // `pendingComponent` this route never renders is what registers the
  // router's commit timer (`setupPendingTimeout` gates on its presence), and
  // `wrapInSuspense: false` is what suppresses this route's own Suspense
  // boundary so the loader suspends into `warehouseRoute`'s instead. Deleting
  // either line reads as tidying up a mistake and breaks a different
  // criterion — CR-AC-02 for the first, CR-AC-13 for the second — so the
  // pairing is pinned here as well as behaviourally (`sad.md` §11, risk 2).
  it('declares the branch shared pending boundary rather than one of its own', () => {
    expect(accessRoute.options.pendingComponent).toBe(RoutePendingState);
    expect(accessRoute.options.errorComponent).toBe(RouteErrorState);
    expect(accessRoute.options.pendingMs).toBe(150);
    // TanStack's default is 500 ms, which would hold the fallback on screen
    // after its data had arrived (`sad.md` §5.1).
    expect(accessRoute.options.pendingMinMs).toBe(0);
    expect(accessRoute.options.wrapInSuspense).toBe(false);
  });

  // T5 / CH-04 — the route declares the loader and holds no dispatch of its
  // own, which is the whole of what `frontend-architecture.md` §Route permits
  // it ("loader wiring", never "RTK dispatch, or direct API calls") and what
  // ADR 0001 decides. Asserted by identity so that replacing the wiring with an
  // inline function — the shape the §Route rule forbids — fails here.
  it('wires its await window to the module-owned loader (T5, CH-04)', () => {
    expect(accessRoute.options.loader).toBe(loadAccessSurface);
  });

  // CR-RG-04, a merge blocker, at the CHILD address — where the parent guard
  // RETURNS a refused verdict rather than throwing, so this route's own load
  // still runs. Declaring a pending contract here must not turn that refusal
  // into a wait, a redirect or a disclosure: `WarehouseLayout` renders
  // `WarehouseEntryRefusal` in place, with the same non-disclosing reason, and
  // nothing is asked about the Warehouse the actor was just refused — the
  // baseline CH-16's verdict gate has to preserve when T5 adds the loader.
  it('refuses in place at a refused warehouse access address, never pending and never a redirect', async () => {
    const session = stubWarehouseSession({
      effectiveWarehouseId: warehouseSessionIds.north,
      memberships: [warehouseMemberships.north],
    });
    const refused = warehouseSessionIds.ownWithoutMembership;

    const { router } = renderRoute(accessAddress(refused));

    const refusal = await screen.findByRole('heading', {
      name: NON_DISCLOSING_REFUSAL,
    });
    expect(refusal.closest('main')?.textContent).not.toContain(refused);
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(accessAddress(refused));
    expect(router.history.length).toBe(1);
    expect(session.urlsMatching(/\/access\//u)).toEqual([]);
  });
});
