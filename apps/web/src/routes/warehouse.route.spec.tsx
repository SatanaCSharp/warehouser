import { RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from 'router';
import { warehouseRoute } from 'routes/warehouse.route';
import { warehousePath } from 'shared/api/warehouse/warehouse-path';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import { ROUTES } from 'shared/constants/routes';
import { makeStore } from 'store';
import {
  stubWarehouseSession,
  warehouseMemberships,
  warehouseSessionIds,
  workspaceIds,
} from 'test/workspace-fixtures';

import type { RenderResult } from '@testing-library/react';
import type { AppRouter } from 'router';
import type { AppStore } from 'store';

// T14 — the cross-cutting route-integration cases none of the per-task suites
// owns. Each drives the REAL assembled route tree through
// `createAppRouter({ appStore, initialEntries })`, because every property under
// test here is a property of the assembled tree — what a second router does to
// the first, what a refused address does NOT request, whether a mid-session
// refetch evicts an actor — and none of them is observable from a component
// harness.
//
// Kept out of `src/router.spec.tsx` (already near `max-lines`) and colocated
// with `routes/warehouse.route.tsx`, the route whose behavior they pin.

const NORTH = warehouseSessionIds.north;
const SOUTH = warehouseSessionIds.south;

const NON_DISCLOSING_REFUSAL = "This address isn't available to you";
const ARCHIVED_REFUSAL = 'This warehouse is archived';
const WAREHOUSE_CONTENT = 'Design System Preview';
const NO_CONTEXT_HEADING = 'Nothing is entered yet';
const ERROR_HEADING = 'Something went wrong';
const RETRY_LABEL = 'Try again';
const ACCESS_HEADING = 'Access';
// `common.json` `shell.landing.pendingLabel` — the copy `RoutePendingState`
// renders, and after CH-12 the application's only waiting copy.
const PENDING_LABEL = 'Preparing your workspace…';

const warehouseAddress = (warehouseId: string): string =>
  `/warehouses/${warehouseId}`;

const accessAddress = (warehouseId: string): string =>
  `/warehouses/${warehouseId}/access`;

type RenderedRoute = RenderResult & { router: AppRouter; store: AppStore };

/**
 * Renders one router. `store` is a parameter rather than always fresh because
 * CR-AC-05's whole point is two routers over ONE store: a per-router store
 * would make the independence it asserts trivially true and prove nothing.
 */
const renderRoute = (
  initialEntry: string,
  store: AppStore = makeStore(),
): RenderedRoute => {
  const router = createAppRouter({
    appStore: store,
    initialEntries: [initialEntry],
  });

  const result = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );

  return { ...result, router, store };
};

/**
 * How long the settle below waits. React schedules the re-render the refetched
 * body causes at a lower priority than the awaited promise, so resolving the
 * request is not enough: without this the assertions would run against the
 * pre-refetch tree and would pass for the wrong reason. Verified by breaking
 * the address-scoped reads and watching the re-render land inside this window.
 */
const REFETCH_SETTLE_MS = 50;

/**
 * A real mid-session **refetch** of the Workspace context — a fresh network
 * read answering whatever `reviseContext` last set — followed by a settle so
 * every consumer that would react to the new body already has. A cache
 * mutation would not do: the refetch is what a live session performs, and it is
 * the path a future invalidation change would turn into an eviction (CR-AC-20).
 */
const refetchWorkspaceContext = async (store: AppStore): Promise<void> => {
  await act(async () => {
    await store
      .dispatch(
        workspaceContextApi.endpoints.getWorkspaceContext.initiate(undefined, {
          forceRefetch: true,
          subscribe: false,
        }),
      )
      .unwrap();
    await new Promise((resolve) => {
      setTimeout(resolve, REFETCH_SETTLE_MS);
    });
  });
};

describe('warehouse addresses are independent (T14, CR-AC-05)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // CR-AC-05 — "they enter W1, copy the address, open it in a second browser
  // tab of the same session, and then move the first tab to W2 → the second
  // tab shows W1's Warehouse view and the first shows W2's".
  //
  // The two tabs are two routers over ONE store, which is the strongest form
  // of the claim available in-process: they share the RTK Query cache, the
  // auth slice and the entry-verdict cache keyed on that store, so anything
  // shared that decided which Warehouse a tab shows would re-point the other
  // tab here. Each tab's Warehouse is read off ITS OWN sidebar's Dashboard
  // link, which the shell addresses with the id the tab's own layout match
  // holds — not off the pathname, which would only restate the input.
  it('keeps each router at the Warehouse its own address names when the other moves', async () => {
    stubWarehouseSession({
      effectiveWarehouseId: NORTH,
      memberships: [warehouseMemberships.north, warehouseMemberships.south],
    });
    const store = makeStore();

    const firstTab = renderRoute(warehouseAddress(NORTH), store);
    expect(
      await within(firstTab.container).findByText(WAREHOUSE_CONTENT),
    ).toBeInTheDocument();

    // The address is copied into a second tab of the same session, which
    // resolves its own entry from scratch.
    const secondTab = renderRoute(warehouseAddress(NORTH), store);

    await waitFor(() =>
      expect(
        within(secondTab.container).getByRole('link', { name: 'Dashboard' }),
      ).toHaveAttribute('href', warehouseAddress(NORTH)),
    );

    await act(async () => {
      await firstTab.router.navigate({
        to: ROUTES.WAREHOUSE,
        params: { warehouseId: SOUTH },
      });
    });

    await waitFor(() =>
      expect(
        within(firstTab.container).getByRole('link', { name: 'Dashboard' }),
      ).toHaveAttribute('href', warehouseAddress(SOUTH)),
    );
    expect(firstTab.router.state.location.pathname).toBe(
      warehouseAddress(SOUTH),
    );

    // Neither re-points the other: the second tab still names W1.
    expect(secondTab.router.state.location.pathname).toBe(
      warehouseAddress(NORTH),
    );
    expect(
      within(secondTab.container).getByRole('link', { name: 'Dashboard' }),
    ).toHaveAttribute('href', warehouseAddress(NORTH));
  });

  // CR-AC-05 / CR-AC-07 — the two tabs are independent all the way down to the
  // verdict: one tab refused a Warehouse must not carry that refusal into a
  // tab already inside one it holds a membership in, and vice versa. The
  // entry-verdict cache in `routes/warehouse.route.tsx` is keyed on the store
  // both tabs share, so this is exactly where a cache keyed too loosely would
  // show.
  it('holds an entered and a refused address at once without either verdict crossing over', async () => {
    stubWarehouseSession({ memberships: [warehouseMemberships.north] });
    const store = makeStore();

    const enteredTab = renderRoute(warehouseAddress(NORTH), store);
    expect(
      await within(enteredTab.container).findByText(WAREHOUSE_CONTENT),
    ).toBeInTheDocument();

    // Opened only once the first tab is settled inside W1, so its verdict is
    // already recorded when this tab resolves its own.
    const refusedTab = renderRoute(
      warehouseAddress(warehouseSessionIds.ownWithoutMembership),
      store,
    );
    expect(
      await within(refusedTab.container).findByText(NON_DISCLOSING_REFUSAL),
    ).toBeInTheDocument();

    expect(
      within(enteredTab.container).queryByText(NON_DISCLOSING_REFUSAL),
    ).not.toBeInTheDocument();
    expect(
      within(refusedTab.container).queryByText(WAREHOUSE_CONTENT),
    ).not.toBeInTheDocument();
  });

  // CR-AC-06 last clause — "changing which Warehouse is recorded as the
  // actor's stored selection changes nothing about what an already-open
  // address shows". The stored selection is moved to W2 underneath an open W1
  // address; W1 must keep showing W1.
  //
  // The stored-selection write is stubbed to fail, which is CR-AC-09's
  // fire-and-forget rejection: without it the open address would simply write
  // its own Warehouse back and the disagreement this case is about could never
  // be held long enough to observe.
  it('shows the addressed Warehouse after the stored selection is moved to another one (CR-AC-06)', async () => {
    const session = stubWarehouseSession({
      activeWarehouseWriteStatus: 500,
      effectiveWarehouseId: NORTH,
      memberships: [warehouseMemberships.north, warehouseMemberships.south],
      permissionIdsIn: { [NORTH]: [PermissionId.ROLES_WATCH] },
    });
    const { router, store } = renderRoute(accessAddress(NORTH));

    expect(await screen.findByText('North Hub Operators')).toBeInTheDocument();

    session.reviseContext({ effectiveWarehouseId: SOUTH });
    await refetchWorkspaceContext(store);

    expect(router.state.location.pathname).toBe(accessAddress(NORTH));
    expect(screen.getByText('North Hub Operators')).toBeInTheDocument();
    // The projection the surface is gated by is still asked about W1 alone: a
    // surface that re-keyed on the stored selection would ask about W2 here.
    expect(session.urlsMatching(/\/access\/current$/u)).toEqual([
      warehousePath(NORTH, 'access/current'),
    ]);
    expect(session.urlsMatching(/\/access\/roles$/u)).toEqual([
      warehousePath(NORTH, 'access/roles'),
    ]);
  });
});

describe('a refused warehouse address does nothing else (T14, CR-AC-07)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // CR-AC-07 — the refusal's negative half, which no existing case owns: a
  // refused address writes NO stored selection, issues NO access projection
  // and renders NO sidebar. Each of the three is a distinct way the refusal
  // could leak that the address exists, or act on the actor's behalf at an
  // address they were just refused.
  it('writes no stored selection, requests no access projection and renders no sidebar', async () => {
    const session = stubWarehouseSession({
      effectiveWarehouseId: NORTH,
      memberships: [warehouseMemberships.north],
    });

    const { router } = renderRoute(
      warehouseAddress(warehouseSessionIds.foreignWorkspace),
    );

    expect(await screen.findByText(NON_DISCLOSING_REFUSAL)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      warehouseAddress(warehouseSessionIds.foreignWorkspace),
    );

    // No stored-selection write: the actor's selection still names whatever it
    // named before they opened an address they may not enter (CR-AC-09).
    expect(
      session.requests.filter(
        ({ method, url }) =>
          method === 'PUT' && url.endsWith('/workspace/active-warehouse'),
      ),
    ).toEqual([]);
    // No access projection: `useCurrentPermissions` holds no authority around
    // a refusal, so nothing is asked about the refused Warehouse at all.
    expect(session.urlsMatching(/\/access\//u)).toEqual([]);
    // No sidebar: its entries would be addressed inside the Warehouse the
    // actor was just refused (CR-AC-18's shell).
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Dashboard' }),
    ).not.toBeInTheDocument();
  });

  // CR-AC-07 — "all four cases produce the same refusal, which discloses
  // nothing about whether X exists or what it contains", and the identifier is
  // "not validated for shape" before the membership check. Asserted through the
  // assembled tree rather than only against the verdict: a route param
  // validator, a not-found boundary or a redirect added later would separate
  // the malformed case from the well-formed ones without changing the verdict
  // function at all.
  it.each([
    ['a non-existent warehouse', warehouseSessionIds.nonExistent],
    ['a warehouse of another workspace', warehouseSessionIds.foreignWorkspace],
    [
      'a warehouse of their own workspace they hold no membership in',
      warehouseSessionIds.ownWithoutMembership,
    ],
    ['a malformed identifier', warehouseSessionIds.malformed],
  ])('refuses %s at the requested address, identically', async (_case, id) => {
    stubWarehouseSession({ memberships: [warehouseMemberships.north] });

    const { router } = renderRoute(warehouseAddress(id));

    const refusal = await screen.findByRole('heading', {
      name: NON_DISCLOSING_REFUSAL,
    });
    // The refusal names nothing about the address that produced it — not the
    // identifier, not a Workspace, not an archived state.
    expect(refusal.closest('main')?.textContent).not.toContain(id);
    expect(screen.queryByText(ARCHIVED_REFUSAL)).not.toBeInTheDocument();
    // No redirect: the landing resolver never runs and cannot enter another
    // context on their behalf.
    expect(router.state.location.pathname).toBe(warehouseAddress(id));
    expect(screen.queryByText(NO_CONTEXT_HEADING)).not.toBeInTheDocument();
    expect(router.history.length).toBe(1);
  });
});

describe('a failed context read at a warehouse address (T29, CR-AC-07/08)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // CR-AC-08's final paragraph, applied at a Warehouse address rather than at
  // the root: a failed Workspace-context read means the actor's access is
  // UNKNOWN, not that they hold none. `resolveWarehouseEntry` unwraps the read,
  // so the rejection leaves `beforeLoad` and the route's `errorComponent`
  // renders — with a way to try again.
  //
  // The distinction is the whole point of the case. A refusal here would be a
  // lie about the actor's access, would hide an outage behind CR-AC-07's
  // deliberately non-disclosing copy, and would silently enlarge the
  // enumeration surface that criterion governs: a Warehouse the actor may
  // genuinely enter would read exactly like one they may not.
  it('renders the retryable error state, not a refusal', async () => {
    stubWarehouseSession({
      contextStatus: 500,
      effectiveWarehouseId: NORTH,
      memberships: [warehouseMemberships.north],
    });

    const { router } = renderRoute(warehouseAddress(NORTH));

    expect(
      await screen.findByRole('heading', { name: ERROR_HEADING }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: RETRY_LABEL })).toBeEnabled();

    // Not a refusal — neither CR-AC-07's non-disclosing one nor CR-AC-17's
    // archived one — and not the no-context state either.
    expect(screen.queryByText(NON_DISCLOSING_REFUSAL)).not.toBeInTheDocument();
    expect(screen.queryByText(ARCHIVED_REFUSAL)).not.toBeInTheDocument();
    expect(screen.queryByText(NO_CONTEXT_HEADING)).not.toBeInTheDocument();
    // And not the Warehouse view: an unknown verdict admits nobody.
    expect(screen.queryByText(WAREHOUSE_CONTENT)).not.toBeInTheDocument();
    // The actor is left at the address they asked for, unmoved (CR-AC-07).
    expect(router.state.location.pathname).toBe(warehouseAddress(NORTH));
    expect(router.history.length).toBe(1);
  });

  // CR-AC-08 — the retry has to genuinely re-run the failed read, otherwise the
  // error state is a dead end the actor can only escape by reloading. The read
  // is answered on the second attempt and the actor lands inside the Warehouse
  // their membership admits them to.
  it('enters the warehouse when the retry re-runs a read that then succeeds', async () => {
    const session = stubWarehouseSession({
      contextStatus: 500,
      effectiveWarehouseId: NORTH,
      memberships: [warehouseMemberships.north],
    });
    const user = userEvent.setup();

    renderRoute(warehouseAddress(NORTH));
    await screen.findByRole('heading', { name: ERROR_HEADING });

    session.reviseContext({ contextStatus: 200 });
    await user.click(screen.getByRole('button', { name: RETRY_LABEL }));

    expect(await screen.findByText(WAREHOUSE_CONTENT)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: ERROR_HEADING })).toBeNull();
    // The retry really re-read the context rather than re-rendering a cached
    // failure: the read was issued more than once.
    expect(
      session.urlsMatching(/\/workspace\/context$/u).length,
    ).toBeGreaterThan(1);
  });
});

describe('nothing evicts an actor from a warehouse (T14, CR-AC-20)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // CR-AC-20 — "nothing moves them out of W's view on its own". Both of the
  // criterion's triggers are exercised through a real REFETCH of the Workspace
  // context (a fresh network read answering a changed body), not a cache
  // mutation: the refetch is what a live session actually performs, and it is
  // the path a future `invalidatesTags` or router-invalidation change would
  // turn into an eviction.
  it.each([
    [
      'the warehouse is archived',
      {
        memberships: [
          {
            ...warehouseMemberships.north,
            archivedAt: '2026-08-13T00:00:00.000Z',
          },
        ],
      },
    ],
    ['the membership is withdrawn', { memberships: [] }],
  ])(
    'leaves the actor inside the warehouse when %s',
    async (_case, revision) => {
      const session = stubWarehouseSession({
        effectiveWarehouseId: NORTH,
        memberships: [warehouseMemberships.north],
      });
      const { router, store } = renderRoute(warehouseAddress(NORTH));

      expect(await screen.findByText(WAREHOUSE_CONTENT)).toBeInTheDocument();
      const writesBefore = session.requests.filter(
        ({ method }) => method === 'PUT',
      ).length;

      session.reviseContext(revision);
      await refetchWorkspaceContext(store);

      // The address they hold keeps naming W, and W's view is still what renders.
      expect(router.state.location.pathname).toBe(warehouseAddress(NORTH));
      expect(screen.getByText(WAREHOUSE_CONTENT)).toBeInTheDocument();
      expect(
        screen.queryByText(NON_DISCLOSING_REFUSAL),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(ARCHIVED_REFUSAL)).not.toBeInTheDocument();
      expect(screen.queryByText(NO_CONTEXT_HEADING)).not.toBeInTheDocument();
      // Their stored selection is not rewritten by the change either.
      expect(
        session.requests.filter(({ method }) => method === 'PUT'),
      ).toHaveLength(writesBefore);
    },
  );

  // CR-AC-20 — the actor stays not only at the address but INSIDE the context:
  // a navigation made after the withdrawal is still served by W's view, because
  // the verdict lives in the layout match and no refetch invalidates the
  // router. A recomputed verdict would refuse them at the address mid-session.
  //
  // What the act itself yields is decided when it is authorized, separately:
  // the withdrawn actor's reads of W's Roles and Permission catalogue are
  // refused and disclose none of W's contents — but that refusal happens
  // INSIDE W's own surface, at W's own address, and is not the entry refusal
  // that would have thrown them out of the context altogether.
  it('serves a navigation made after the membership is withdrawn from inside the warehouse', async () => {
    const session = stubWarehouseSession({
      effectiveWarehouseId: NORTH,
      memberships: [warehouseMemberships.north],
      permissionIdsIn: { [NORTH]: [PermissionId.ROLES_WATCH] },
    });
    const { router, store } = renderRoute(warehouseAddress(NORTH));
    expect(await screen.findByText(WAREHOUSE_CONTENT)).toBeInTheDocument();

    session.reviseContext({ memberships: [] });
    await refetchWorkspaceContext(store);
    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE_ACCESS,
        params: { warehouseId: NORTH },
      });
    });

    // Inside W's own access surface, at W's own address — not the entry
    // refusal, and not moved anywhere.
    expect(router.state.location.pathname).toBe(accessAddress(NORTH));
    expect(
      await screen.findByRole('heading', { name: 'Access' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NON_DISCLOSING_REFUSAL)).not.toBeInTheDocument();
    expect(screen.queryByText(ARCHIVED_REFUSAL)).not.toBeInTheDocument();
    // The refused reads still named W — the act was refused, not redirected,
    // and W's Roles were never disclosed.
    //
    // Asserted as the SET of addresses those reads named rather than as a
    // single request. Since T5 the read is issued twice for a withdrawn
    // membership: `accessRoute`'s loader issues it, the server refuses it, and
    // RTK Query re-issues it for the mounted hook because a rejected entry
    // carries no `fulfilledTimeStamp` to serve the first subscriber from. Both
    // attempts name W and both are refused, which is the whole of what this
    // case claims; the request count is not — `global-loader/spec.md` §6
    // records it as deliberately no longer at baseline.
    expect(new Set(session.urlsMatching(/\/access\/roles$/u))).toStrictEqual(
      new Set([warehousePath(NORTH, 'access/roles')]),
    );
    expect(screen.queryByText('North Hub Operators')).not.toBeInTheDocument();
  });
});

describe('every warehouse-scoped request names its warehouse (T14, CR-RG-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /** The endpoints that are deliberately not scoped to one Warehouse. */
  const WAREHOUSE_AGNOSTIC = [
    '/api/v1/auth/session',
    '/api/v1/workspace/active-warehouse',
    '/api/v1/workspace/context',
  ];

  // CR-RG-01's client half — "a request that does not unambiguously name
  // exactly one Warehouse is still refused rather than resolved to any
  // default", so the client must never send one. Every request a whole
  // Warehouse session issues is either one of the three Warehouse-agnostic
  // endpoints above or is prefixed by `warehousePath(addressed, …)`. A new
  // endpoint added without its Warehouse — the pre-CH-03 flat `/api/v1/access/…`
  // shape — fails here rather than silently borrowing whichever Warehouse the
  // server would have defaulted to.
  it('sends only warehouse-agnostic requests and requests under the addressed warehouse', async () => {
    const session = stubWarehouseSession({
      effectiveWarehouseId: NORTH,
      memberships: [warehouseMemberships.north, warehouseMemberships.south],
      permissionIdsIn: {
        [NORTH]: [PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH],
      },
    });

    renderRoute(accessAddress(NORTH));
    expect(await screen.findByText('North Hub Operators')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Members' })).toBeInTheDocument(),
    );

    const unscoped = session.requests
      .map(({ url }) => url)
      .filter(
        (url) =>
          !WAREHOUSE_AGNOSTIC.includes(url) &&
          !url.startsWith(warehousePath(NORTH, '')),
      );
    expect(unscoped).toEqual([]);
    // And the session really did exercise the Warehouse-scoped surface, so the
    // assertion above is not vacuously true.
    expect(session.urlsMatching(/\/access\//u).length).toBeGreaterThan(0);
    // Nothing named the OTHER Warehouse the actor is a member of.
    expect(session.urlsMatching(new RegExp(SOUTH, 'u'))).toEqual([]);
  });

  // CR-RG-01 — client-side visibility is advisory only. A Warehouse-scoped
  // read is still addressed to its own Warehouse when the actor's Role there
  // carries nothing: the client hides the surface's contents, it does not
  // rewrite where the request goes or drop the Warehouse from it.
  it('still names the addressed warehouse when the role there carries no capability', async () => {
    const session = stubWarehouseSession({
      effectiveWarehouseId: SOUTH,
      memberships: [warehouseMemberships.north, warehouseMemberships.south],
      permissionIdsIn: { [NORTH]: [] },
    });

    renderRoute(accessAddress(NORTH));

    expect(
      await screen.findByRole('heading', { name: 'Access unavailable' }),
    ).toBeInTheDocument();
    expect(session.urlsMatching(/\/access\/current$/u)).toEqual([
      warehousePath(NORTH, 'access/current'),
    ]);
  });
});

// T28 / CR-AC-14 — entering from the Workspace's warehouses tab, exercised
// through the PRODUCTION route tree (`test-plan.md:83`). The three clauses only
// compose here: the layout's own entry verdict, `useRecordWarehouseEntry`'s
// stored-selection write and the shell's switcher all run on this path and on
// none of the locally built probe routes a component harness can offer, so such
// a harness can assert that Enter navigates but never that the actor genuinely
// arrives in that Warehouse, is marked there, and is recorded there.
//
// Colocated here rather than in `src/router.spec.tsx` for the reason recorded
// at the top of this file: that suite is at its `max-lines` budget.
describe('entering from the warehouses tab (T28, CR-AC-14)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  type StubbedRequest = { body: unknown; method: string; url: string };

  const ACTIVE_WAREHOUSE_URL = '/api/v1/workspace/active-warehouse';

  /**
   * A Workspace Member holding `WAREHOUSES:WATCH` — enough to reach the
   * warehouses tab — whose sole membership is North Hub. The Workspace's own
   * record list additionally carries South Cross-dock, which they hold no
   * membership in, so the Enter action activated below is the one CR-AC-13 put
   * on their own membership row. The context body is rebuilt per request, so
   * the write the entry issues is reflected by the refetch that follows it,
   * exactly as the server would answer.
   */
  const stubWarehousesTabSession = (): StubbedRequest[] => {
    const requests: StubbedRequest[] = [];
    const state = { effectiveWarehouseId: null as string | null };

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method =
          init?.method ?? (input instanceof Request ? input.method : 'GET');
        const body =
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        requests.push({ body, method, url });

        if (url.endsWith('/api/v1/auth/session')) {
          return Promise.resolve(
            Response.json({ user: { id: warehouseSessionIds.actor } }),
          );
        }
        if (url === ACTIVE_WAREHOUSE_URL && method === 'PUT') {
          state.effectiveWarehouseId =
            (body as { warehouseId?: string } | undefined)?.warehouseId ?? null;
          return Promise.resolve(
            Response.json({ effectiveWarehouseId: state.effectiveWarehouseId }),
          );
        }
        if (url.includes('/api/v1/workspace/context')) {
          return Promise.resolve(
            Response.json({
              workspace: { id: workspaceIds.workspace, name: 'Acme Logistics' },
              workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
              warehouses: [
                {
                  ...warehouseMemberships.north,
                  roleId: warehouseSessionIds.role,
                  roleKind: 'warehouse_manager',
                },
              ],
              effectiveWarehouseId: state.effectiveWarehouseId,
            }),
          );
        }
        if (url.endsWith('/api/v1/workspace/warehouses')) {
          return Promise.resolve(
            Response.json([
              {
                id: NORTH,
                name: warehouseMemberships.north.name,
                archivedAt: null,
              },
              {
                id: SOUTH,
                name: warehouseMemberships.south.name,
                archivedAt: null,
              },
            ]),
          );
        }
        if (url === warehousePath(NORTH, 'access/current')) {
          return Promise.resolve(
            Response.json({
              warehouseId: NORTH,
              roleId: warehouseSessionIds.role,
              roleKind: 'warehouse_manager',
              permissionIds: [],
              archivedAt: null,
            }),
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    return requests;
  };

  it('arrives in that warehouse, marks it current in the switcher, and records it as the stored selection', async () => {
    const requests = stubWarehousesTabSession();
    const user = userEvent.setup();
    const { router } = renderRoute(ROUTES.WORKSPACE);

    await user.click(
      await screen.findByRole('link', {
        name: `Enter ${warehouseMemberships.north.name}`,
      }),
    );

    // (a) The actor arrives in North Hub's Warehouse view — the production
    // layout's own `entered` verdict, not a probe route standing in for it.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(warehouseAddress(NORTH)),
    );
    expect(await screen.findByText(WAREHOUSE_CONTENT)).toBeInTheDocument();

    // (b) That row is marked current in the switcher. `RootLayout` renders the
    // switcher once per viewport and jsdom applies no media query, so both
    // triggers are present; either opens the same control.
    await user.click(
      (await screen.findAllByRole('button', { name: /context switcher/iu }))[0],
    );
    const listbox = await screen.findByRole('listbox');
    const enteredRow = within(listbox).getByRole('option', {
      name: new RegExp(warehouseMemberships.north.name, 'iu'),
    });
    expect(enteredRow).toHaveAttribute('aria-selected', 'true');
    // The check indicator is the marker CR-AC-01 asks for; `data-visible` is
    // the state HeroUI sets from `isSelected` and the one thing that separates
    // the marked row from the rest, which all render an indicator too.
    expect(
      enteredRow.querySelector('[data-slot="list-box-item-indicator"]'),
    ).toHaveAttribute('data-visible', 'true');

    // (c) The entry is written as the stored selection (CR-AC-09), once.
    await waitFor(() =>
      expect(
        requests.filter(
          (request) =>
            request.method === 'PUT' && request.url === ACTIVE_WAREHOUSE_URL,
        ),
      ).toEqual([
        {
          body: { warehouseId: NORTH },
          method: 'PUT',
          url: ACTIVE_WAREHOUSE_URL,
        },
      ]),
    );
  });
});

/**
 * How long the delayed Workspace-context read below is held for. Comfortably
 * past `warehouseRoute`'s 150 ms `pendingMs`, so the pending window is a fact
 * of the fixture rather than a race against the router's timer, and short
 * enough that the case stays well inside Vitest's `testTimeout`.
 */
const DELAYED_CONTEXT_MS = 400;

/**
 * Holds the Workspace-context read the entry verdict awaits, so the window
 * `pendingComponent` covers is long enough to observe. It wraps whatever stub
 * is already installed rather than replacing it, so the session keeps
 * answering the session restore, the access reads and the writes unchanged.
 */
const delayContextRead = (delayMs: number): void => {
  const answer = globalThis.fetch;

  vi.stubGlobal(
    'fetch',
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input instanceof Request ? input.url : input);
      const answered = answer(input, init);

      if (!url.includes('/api/v1/workspace/context')) {
        return answered;
      }

      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(answered), delayMs);
      });
    },
  );
};

/**
 * Counts how many times the pending state appears while `navigate` is in
 * flight. Taken from the DOM mutations themselves rather than from the settled
 * tree, because a fallback that is inserted and removed inside one commit
 * would be invisible to any assertion made afterwards — and "it was never
 * painted" is precisely what CR-AC-16 claims.
 */
const pendingPaintsDuring = async (
  navigate: () => Promise<void>,
): Promise<number> => {
  let paints = document.body.textContent?.includes(PENDING_LABEL) ? 1 : 0;
  const observer = new MutationObserver((records) => {
    const inserted = records.some((record) =>
      [...record.addedNodes].some((node) =>
        node.textContent?.includes(PENDING_LABEL),
      ),
    );
    if (inserted || document.body.textContent?.includes(PENDING_LABEL)) {
      paints += 1;
    }
  });

  observer.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  });
  await navigate();
  observer.disconnect();

  return paints;
};

// T1 / CH-02 — the Warehouse layout route's pending contract. `beforeLoad`
// resolves the entry verdict over the network, and until this change nothing
// painted for that window: the actor sat on the page they came from
// (`change.md` §3, CH-02). The three cases below are the pair `sad.md` §5.1
// makes of `pendingComponent` and `pendingMs: 150` — the window is painted
// when it is real, and is not painted for the microtask an in-Warehouse
// navigation costs — plus CR-RG-04's merge blocker, which the first two must
// not disturb.
describe('the warehouse route paints its await window (T1, CR-AC-02)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // CR-AC-02 — "`RoutePendingState` is on screen while `beforeLoad`/`loader`
  // is outstanding, and is replaced by the destination when the route
  // settles". Asserted through the production route tree, so the shipped
  // `pendingComponent` is the one under test: a re-declared probe route would
  // stay green after the declaration was deleted.
  it('paints the pending state while the entry verdict is outstanding and replaces it with the destination', async () => {
    stubWarehouseSession({
      effectiveWarehouseId: NORTH,
      memberships: [warehouseMemberships.north],
    });
    delayContextRead(DELAYED_CONTEXT_MS);

    renderRoute(warehouseAddress(NORTH));

    expect(await screen.findByText(PENDING_LABEL)).toBeInTheDocument();
    // CR-RG-08 — the shell around the outlet paints nothing of its own while
    // the pending state is up: one waiting affordance, and it is this one.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    expect(await screen.findByText(WAREHOUSE_CONTENT)).toBeInTheDocument();
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
  });

  // CR-AC-16, in `sad.md` §11's amended form — a `cause === 'stay'`
  // navigation between two of a Warehouse's surfaces does not paint for a
  // wait shorter than 150 ms. `beforeLoad` is `async` unconditionally and
  // awaits `requireAuth` before its `lastVerdictByStore` lookup, so even the
  // cached-verdict path resolves through a microtask on every internal
  // navigation; `pendingMs: 150` is what keeps that microtask from replacing
  // the live destination.
  //
  // The threshold is asserted beside the behaviour deliberately. A warm stay
  // navigation settles inside a microtask, which no in-process observation can
  // separate from a `setTimeout(0)` — so the no-paint assertion alone would
  // stay green after `pendingMs` was set to `0`, which is the one edit
  // CR-AC-16 exists to forbid (`spec.md` CR-AC-16, ADR 0002's table).
  it('does not paint the pending state on a cause=stay navigation shorter than 150 ms', async () => {
    stubWarehouseSession({
      effectiveWarehouseId: NORTH,
      memberships: [warehouseMemberships.north],
      permissionIdsIn: { [NORTH]: [PermissionId.ROLES_WATCH] },
    });
    const { router } = renderRoute(warehouseAddress(NORTH));
    expect(await screen.findByText(WAREHOUSE_CONTENT)).toBeInTheDocument();

    // Warm both surfaces first, so the navigation under test is the warm
    // return `sad.md` §6.3 describes rather than a first visit that has a
    // module chunk and two network rounds still ahead of it.
    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE_ACCESS,
        params: { warehouseId: NORTH },
      });
    });
    expect(
      await screen.findByRole('heading', { name: ACCESS_HEADING }),
    ).toBeInTheDocument();
    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE,
        params: { warehouseId: NORTH },
      });
    });
    expect(await screen.findByText(WAREHOUSE_CONTENT)).toBeInTheDocument();

    const paints = await pendingPaintsDuring(async () => {
      await act(async () => {
        await router.navigate({
          to: ROUTES.WAREHOUSE_ACCESS,
          params: { warehouseId: NORTH },
        });
      });
    });

    expect(paints).toBe(0);
    expect(warehouseRoute.options.pendingMs).toBe(150);
    // TanStack's own default is 500 ms, which would hold the fallback on
    // screen after its data had arrived (`sad.md` §5.1).
    expect(warehouseRoute.options.pendingMinMs).toBe(0);
    // The live destination was replaced by the finished one, not by a wait.
    expect(
      screen.getByRole('heading', { name: ACCESS_HEADING }),
    ).toBeInTheDocument();
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
  });

  // CR-RG-04, a merge blocker — `warehouseRoute.beforeLoad` RETURNS a refused
  // verdict rather than throwing, so declaring a `pendingComponent` beside it
  // must leave the refusal exactly where it was: rendered in place at the
  // requested address, with the same non-disclosing reason. A refusal is a
  // resolved outcome, so once the verdict settles it is never a pending state
  // and never a redirect. The context read is held so the refusal is reached
  // THROUGH the new pending window rather than instead of one.
  it('still refuses in place after the pending window, never as a pending state and never as a redirect', async () => {
    const session = stubWarehouseSession({
      effectiveWarehouseId: NORTH,
      memberships: [warehouseMemberships.north],
    });
    delayContextRead(DELAYED_CONTEXT_MS);
    const refused = warehouseSessionIds.ownWithoutMembership;

    const { router } = renderRoute(warehouseAddress(refused));

    const refusal = await screen.findByRole('heading', {
      name: NON_DISCLOSING_REFUSAL,
    });
    expect(refusal.closest('main')?.textContent).not.toContain(refused);
    expect(screen.queryByText(ARCHIVED_REFUSAL)).not.toBeInTheDocument();
    // Resolved, so the pending state is gone rather than left standing.
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
    // In place: the actor is at the address they asked for, and nothing
    // navigated on their behalf.
    expect(router.state.location.pathname).toBe(warehouseAddress(refused));
    expect(router.history.length).toBe(1);
    expect(screen.queryByText(NO_CONTEXT_HEADING)).not.toBeInTheDocument();
    // And the refusal costs no request into the Warehouse it named.
    expect(session.urlsMatching(/\/access\//u)).toEqual([]);
  });
});
