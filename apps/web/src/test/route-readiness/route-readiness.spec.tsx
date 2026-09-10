import { RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import {
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { accessRoute } from 'modules/access/route';
import { Provider } from 'react-redux';
import type { AppRouter } from 'router';
import { createAppRouter } from 'router';
import { warehouseRoute } from 'routes/warehouse.route';
import { api } from 'shared/api/client/api-client';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import { ROUTES } from 'shared/constants/routes';
import type { AppStore } from 'store';
import { makeStore } from 'store';
import {
  accessIds,
  accessMembers,
  accessPath,
  accessPermissions,
  accessRoles,
} from 'test/access-fixtures';
import {
  namedWorkspaceContext,
  stubWorkspaceServer,
  workspaceIds,
} from 'test/workspace-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * What the document looked like at each commit of `WarehouseLayout`.
 *
 * `WarehouseLayout` renders no chrome of its own — it is an `<Outlet>` plus the
 * entry-record effect (ADR 0002) — so CR-AC-13's second clause, "`WarehouseLayout`
 * never commits beside a pending state", has no DOM of its own to be read from.
 * It is read at the commit instead: the probe below wraps the shipped component
 * and records the document from a layout effect, which React runs only for a
 * commit that actually happened. A subtree that suspends is discarded rather than
 * committed, so a record carrying `RoutePendingState`'s copy means the layout and
 * a pending state were on screen together — the "pending, then partial chrome,
 * then a second pending state" sequence the criterion forbids.
 */
const probe = vi.hoisted(() => ({ warehouseLayoutCommits: [] as string[] }));

vi.mock('shared/layouts/WarehouseLayout', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('shared/layouts/WarehouseLayout')>();
  const { createElement, useLayoutEffect } = await import('react');

  return {
    ...actual,
    WarehouseLayout: (): ReturnType<typeof actual.WarehouseLayout> => {
      useLayoutEffect(() => {
        probe.warehouseLayoutCommits.push(document.body.textContent ?? '');
      }, []);

      return createElement(actual.WarehouseLayout);
    },
  };
});

/**
 * The route-readiness gate for the global-loader change request (T7) —
 * CR-AC-02, CR-AC-03, CR-AC-10, CR-AC-13, CR-AC-16, CR-RG-04, CR-RG-06 and
 * CR-RG-08.
 *
 * **Why no single file owns this.** Every row here is a fact about the whole
 * assembled route stack rather than about one route file. CR-AC-02's claim is
 * that *all three* previously unpainted routes now paint their await window,
 * which is one statement about `workspaceRoute`, `warehouseRoute` and
 * `accessRoute` together and is false the moment any one of them stops holding.
 * CR-AC-13 is a claim about a parent and a child at once — how many
 * `RoutePendingState`s the branch mounts, and whether `WarehouseLayout` commits
 * between them — so it belongs to neither `routes/warehouse.route.tsx` nor
 * `modules/access/route.tsx`. CR-AC-10 and CR-RG-06 are claims about what a
 * *mutation* and a *cache invalidation* may not do to a route loader, which
 * spans the RTK Query store, the loader and the router. And CR-RG-08 is a claim
 * about the shell **around** the outlet while a route inside it is pending.
 * `docs/system/guides/placing-web-tests.md` §3 files a spec spanning several
 * owners in its own dedicated directory under `src/test/` rather than one level
 * above any of them, and `test-plan.md` §"Where the rows land" assigns this
 * directory exactly these rows.
 *
 * **Why it is the phase gate.** [`change.md` §6](../../../../../docs/change-requests/global-loader/change.md)
 * permits rollout step 3 — removing component-level readiness — only once the
 * routes demonstrably cover the window. Everything asserted here is the
 * behaviour the twelve deletion tasks that follow must not regress, so a case
 * that cannot fail is worse than no case at all.
 *
 * **Why it runs the real thing.** [ADR 0002](../../../../../docs/change-requests/global-loader/adr/0002-one-pending-boundary-per-route-branch.md)
 * rests on framework behaviour this repository does not own — React keeping a
 * Suspense fallback mounted when the same boundary re-suspends, TanStack
 * Router's `cause === 'stay'`, and `setupPendingTimeout` registering a commit
 * timer only for a route that declares a `pendingComponent` (`sad.md` §11, risk
 * row 1). So every case drives `createAppRouter()` over the shipped route tree
 * against the **installed** versions — React 19.2.7 / `react-dom` 19.2.7,
 * `@tanstack/react-router` 1.170.17 over `@tanstack/router-core` 1.171.14 —
 * rather than being reasoned about from the documentation.
 *
 * **What it deliberately does not own.** The per-route declaration checks
 * (`pendingComponent`, `pendingMs`, `wrapInSuspense`, the loader identity) are
 * colocated with each route in `modules/workspace/route.spec.tsx`,
 * `modules/access/route.spec.tsx` and `routes/warehouse.route.spec.tsx`; the
 * loaders' per-actor request sets are in their colocated loader specs; and the
 * component-level force-mount, inertness and refetch rows are in
 * `WorkspaceAdministration.spec.tsx`, `AccessWorkspace.spec.tsx` and the member
 * list's own spec. This file extends those with what none of them can see.
 */

// `common.json` `shell.landing.pendingLabel` — the copy `RoutePendingState`
// renders, and after CH-12 the application's only waiting copy.
const PENDING_LABEL = 'Preparing your workspace…';

const WORKSPACE_HEADING = 'Acme Logistics';
const WAREHOUSE_CONTENT = 'Design System Preview';
const ACCESS_HEADING = 'Access';
const NON_DISCLOSING_REFUSAL = "This address isn't available to you";
const ARCHIVED_REFUSAL = 'This warehouse is archived';
/**
 * A member of the addressed Warehouse, from `accessMembers`. It is the access
 * destination's own awaited dataset made visible, and — unlike a Role name,
 * which the force-mounted Permissions panel repeats as a Permission label — it
 * appears exactly once in the document (`sad.md` §11, risk row 3).
 */
const MEMBER_EMAIL = 'member@example.test';
/** The name the held rename commits, so the live destination is seen changing. */
const RENAMED_WORKSPACE = 'Acme Logistics International';

const SESSION_URL = '/api/v1/auth/session';
const ACTIVE_WAREHOUSE_URL = '/api/v1/workspace/active-warehouse';
const CONTEXT_PATTERN = /\/api\/v1\/workspace\/context$/u;
const ACCESS_PATTERN = /\/access\//u;
const ACCESS_MEMBERS_PATTERN = /\/access\/members$/u;
const RENAME_PATTERN = /\/api\/v1\/workspace$/u;

/** The Warehouse the actor holds a live membership in, per the fixture context. */
const WAREHOUSE = workspaceIds.warehouse;
/** An address in no membership at all — CR-RG-04's non-disclosing refusal. */
const UNKNOWN_WAREHOUSE = '00000000-0000-4000-8000-0000000009f0';

const ALL_WORKSPACE_PERMISSIONS = Object.values(WorkspacePermissionId);
const ALL_WAREHOUSE_PERMISSIONS = Object.values(PermissionId);

/**
 * How long a primary read is held for. Comfortably past `warehouseRoute`'s and
 * `accessRoute`'s 150 ms `pendingMs`, so the pending window is a fact of the
 * fixture rather than a race against the router's own timer, and short enough
 * that the cases stay well inside Vitest's `testTimeout`.
 */
const HELD_READ_MS = 300;

/** RTK Query's default `keepUnusedDataFor`, in milliseconds. */
const RETENTION_WINDOW_MS = 60_000;

const warehouseAddress = (warehouseId: string): string =>
  `/warehouses/${warehouseId}`;

const accessAddress = (warehouseId: string): string =>
  `${warehouseAddress(warehouseId)}/access`;

const page = (items: readonly unknown[]): Record<string, unknown> => ({
  hasNext: false,
  hasPrev: false,
  items: [...items],
  nextCursor: null,
});

/**
 * One Warehouse's four access reads at their own exact per-Warehouse URLs,
 * built by the production path helper. A request that forgets its Warehouse, or
 * names another one, falls through to a 404 here exactly as it would against
 * the server.
 */
const accessRoutesFor = (
  warehouseId: string,
  permissionIds: readonly PermissionId[],
): [string, unknown][] => [
  [
    accessPath(warehouseId, 'current'),
    {
      archivedAt: null,
      permissionIds: [...permissionIds],
      roleId: accessIds.managerRole,
      roleKind: 'warehouse_manager',
      warehouseId,
    },
  ],
  [accessPath(warehouseId, 'roles'), page(accessRoles)],
  [accessPath(warehouseId, 'permissions'), page(accessPermissions)],
  [accessPath(warehouseId, 'members'), page(accessMembers)],
];

/**
 * The Workspace context this session answers with: one membership in
 * `WAREHOUSE`, live or archived. `archived` is what separates CR-RG-04's two
 * refusal reasons from each other while the address stays identical.
 */
const contextWith = ({ archived }: { archived: boolean }): WorkspaceContext => {
  const context = namedWorkspaceContext(ALL_WORKSPACE_PERMISSIONS);
  return {
    ...context,
    warehouses: context.warehouses.map((membership) => ({
      ...membership,
      archivedAt: archived ? '2026-08-01T09:00:00.000Z' : null,
    })),
  };
};

type SessionRequest = { method: string; url: string };

type SessionStub = {
  /** Every request the session answered, in order, still filling as it runs. */
  readonly requests: readonly SessionRequest[];
  urlsMatching: (pattern: RegExp) => string[];
};

type SessionOptions = {
  /** Whether the actor's sole membership is archived (CR-RG-04). */
  archived?: boolean;
  /** Reads whose answer is held, so an await window is long enough to observe. */
  held?: readonly (readonly [RegExp, number])[];
  permissionIds?: readonly PermissionId[];
  /** The name a committed rename answers with (CR-RG-06). */
  renameTo?: string;
};

/**
 * A whole authenticated session for the three destinations this gate drives:
 * the session restore `requireAuth` needs, the Workspace context every guard
 * and loader resolves from, the Workspace administration reads, the addressed
 * Warehouse's four access reads, and the stored-selection write
 * `useRecordWarehouseEntry` issues on entry.
 *
 * It wraps `stubWorkspaceServer` rather than replacing it, so `/workspace`'s
 * tab datasets stay answered exactly as the rest of the suite answers them, and
 * layers the Warehouse-scoped reads the Workspace fixture does not carry. It
 * lives in this directory rather than in `test/workspace-fixtures.ts` because
 * only this spec reads it — `placing-web-tests.md` §4.
 */
const stubRouteSession = ({
  archived = false,
  held = [],
  permissionIds = ALL_WAREHOUSE_PERMISSIONS,
  renameTo,
}: SessionOptions = {}): SessionStub => {
  stubWorkspaceServer({
    context: contextWith({ archived }),
    onRenameWorkspace: () =>
      renameTo === undefined
        ? undefined
        : {
            body: { id: workspaceIds.workspace, name: renameTo },
            status: 200,
          },
  });
  const answerWorkspaceRead = globalThis.fetch;
  const accessRoutes = new Map(accessRoutesFor(WAREHOUSE, permissionIds));
  const requests: SessionRequest[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method =
        init?.method ?? (input instanceof Request ? input.method : 'GET');
      requests.push({ method, url });

      const answer = (): Promise<Response> => {
        if (url === SESSION_URL) {
          return Promise.resolve(
            Response.json({ user: { id: workspaceIds.actingUser } }),
          );
        }
        if (url === ACTIVE_WAREHOUSE_URL && method === 'PUT') {
          return Promise.resolve(Response.json({ effectiveWarehouseId: null }));
        }
        const accessBody = accessRoutes.get(url);
        if (accessBody !== undefined) {
          return Promise.resolve(Response.json(accessBody));
        }
        return answerWorkspaceRead(input, init);
      };

      const delayMs = held.find(([pattern]) => pattern.test(url))?.[1];
      if (delayMs === undefined) {
        return answer();
      }

      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(answer()), delayMs);
      });
    }),
  );

  return {
    requests,
    urlsMatching: (pattern) =>
      requests
        .filter((request) => pattern.test(request.url))
        .map((request) => request.url),
  };
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

type PendingWatch = {
  /** How many distinct `RoutePendingState` elements have been mounted. */
  mounts: () => number;
  stop: () => void;
};

/**
 * Counts `RoutePendingState` **mounts** — distinct elements carrying its copy
 * inserted into the document — rather than reading the settled tree afterwards.
 *
 * The distinction is the whole of CR-AC-13. React keeps a Suspense fallback
 * mounted when the *same* boundary re-suspends, so the branch's one boundary
 * yields one element that is inserted once and never replaced; a second
 * boundary (which is what deleting `accessRoute`'s `wrapInSuspense: false`
 * creates) tears the parent's fallback down and inserts the child's, which is
 * two elements. A snapshot taken after the navigation settles cannot tell those
 * apart, because by then neither is on screen.
 */
const watchPendingMounts = (): PendingWatch => {
  const mounted = new Set<Node>();

  const record = (node: Node): void => {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.textContent?.includes(PENDING_LABEL) === true
    ) {
      mounted.add(node);
    }
  };

  // A pending state already on screen when the watch starts is a mount the
  // observer below can never see, and counting it is what makes `0` mean "the
  // actor never waited" rather than "the wait had already begun".
  const alreadyOnScreen = screen.queryByText(PENDING_LABEL)?.parentElement;
  if (alreadyOnScreen) {
    record(alreadyOnScreen);
  }

  const observer = new MutationObserver((records) => {
    records.forEach((record_) =>
      record_.addedNodes.forEach((node) => record(node)),
    );
  });
  observer.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  });

  return { mounts: () => mounted.size, stop: () => observer.disconnect() };
};

/**
 * Every waiting affordance on screen — a spinner's `progressbar` or a
 * skeleton's `loading` label — which is the count `spec.md` §6 reduces from
 * seven to one.
 */
const waitingAffordances = (): HTMLElement[] => [
  ...screen.queryAllByLabelText(/loading/iu),
  ...screen.queryAllByRole('progressbar'),
];

/**
 * CR-RG-08's assertion, made while the outlet is pending: the only waiting
 * affordance in the document is `RoutePendingState`'s own spinner. The shell
 * around the outlet — the header, `Sidebar` and `WarehouseSwitcher` — adds
 * none, which is the same boundary `Sidebar.spec.tsx:227,404` asserts from the
 * shell's side.
 */
const expectTheRouteOwnsTheOnlyWaitingAffordance = (): void => {
  const pendingState = screen.getByText(PENDING_LABEL).parentElement;
  const affordances = waitingAffordances();

  expect(affordances).toHaveLength(1);
  expect(pendingState?.contains(affordances[0])).toBe(true);
};

// The three previously unpainted routes, and the branch they form. Every case
// drives the shipped route tree, because what is under test is what the router
// and React actually do with the declarations `routes/warehouse.route.tsx`,
// `modules/workspace/route.tsx` and `modules/access/route.tsx` carry — not the
// declarations themselves, which those three files pin beside themselves.
describe('the routes paint their own await window (T7)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    probe.warehouseLayoutCommits.length = 0;
  });

  // CR-AC-02, as one statement about all three previously unpainted routes.
  // Each route file pins its own declaration; what none of them can assert is
  // that the *set* is complete — that no route of the three is left where the
  // actor waits out a network round trip on the page they came from, which is
  // the defect this change request exists to end (`change.md` §1.1).
  //
  // CR-RG-08 rides along on every row: while `RoutePendingState` is up, the
  // shell around the outlet renders no waiting affordance of its own. One
  // waiting affordance in the application, and it is the route's.
  it.each([
    [
      ROUTES.WORKSPACE,
      (): Promise<HTMLElement> =>
        screen.findByRole('heading', { name: WORKSPACE_HEADING }),
    ],
    [
      warehouseAddress(WAREHOUSE),
      (): Promise<HTMLElement> => screen.findByText(WAREHOUSE_CONTENT),
    ],
    [
      accessAddress(WAREHOUSE),
      (): Promise<HTMLElement> =>
        screen.findByRole('heading', { name: ACCESS_HEADING }),
    ],
  ])(
    'paints the pending state before %s settles and the destination after (CR-AC-02, CR-RG-08)',
    async (address, findDestination) => {
      stubRouteSession({ held: [[CONTEXT_PATTERN, HELD_READ_MS]] });

      const { router } = renderRoute(address);

      expect(await screen.findByText(PENDING_LABEL)).toBeInTheDocument();
      expectTheRouteOwnsTheOnlyWaitingAffordance();

      expect(await findDestination()).toBeInTheDocument();
      expect(waitingAffordances()).toHaveLength(0);
      expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
      expect(router.state.location.pathname).toBe(address);
    },
  );

  // CR-AC-13 — "`RoutePendingState` mounts **exactly once** and is replaced
  // directly by the finished destination. The actor never sees a pending state,
  // then partial chrome, then a second pending state."
  //
  // This is the case ADR 0002 was written for, and `sad.md` §11's first risk row
  // is why it is a test rather than an argument: it rests on React keeping a
  // Suspense fallback mounted when the same boundary re-suspends, which is
  // framework behaviour this repository does not own. Both await windows are
  // held here — the parent's entry verdict and the child's `getCurrentAccess` —
  // so the branch genuinely suspends twice and the count is meaningful.
  //
  // `WarehouseLayout` renders no chrome of its own (an `<Outlet>` plus the
  // entry-record effect), so "never commits beside a pending state" is not
  // observable in the DOM. It is observed at the commit itself: the layout's
  // module is wrapped by a probe whose layout effect records the document as it
  // stood when the layout committed. If `accessRoute` grew a boundary of its
  // own, the parent match would resolve, commit `WarehouseLayout`, and paint the
  // child's fallback beside it — and that record would carry the pending copy.
  it('mounts one pending state across the branch two await windows and never commits the layout beside it (CR-AC-13)', async () => {
    stubRouteSession({
      held: [
        [CONTEXT_PATTERN, HELD_READ_MS],
        [ACCESS_PATTERN, HELD_READ_MS],
      ],
    });
    const watch = watchPendingMounts();

    renderRoute(accessAddress(WAREHOUSE));

    expect(await screen.findByText(PENDING_LABEL)).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: ACCESS_HEADING }),
    ).toBeInTheDocument();
    watch.stop();

    expect(watch.mounts()).toBe(1);
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
    // The layout committed once, and no pending state was on screen when it
    // did — no partial chrome between the two windows.
    expect(probe.warehouseLayoutCommits).toHaveLength(1);
    probe.warehouseLayoutCommits.forEach((document_) =>
      expect(document_).not.toContain(PENDING_LABEL),
    );
    // The destination is the finished one, not partial chrome: the child's own
    // awaited dataset is on screen in the same commit that removed the fallback.
    expect(screen.getAllByText(MEMBER_EMAIL).length).toBeGreaterThan(0);
  });

  // CR-AC-16, in `sad.md` §11's amended form — on a `cause === 'stay'`
  // navigation with a warm access cache, `RoutePendingState` does not paint.
  // `warehouse.route.tsx`'s `beforeLoad` is `async` unconditionally and awaits
  // `requireAuth` before its `lastVerdictByStore` lookup, and `accessRoute`'s
  // loader awaits `getCurrentAccess` even from cache, so *both* matches resolve
  // through a microtask on every navigation that stays inside the Warehouse.
  // `pendingMs: 150` on both is what keeps those microtasks from replacing the
  // live destination.
  //
  // The counter is the same instrument CR-AC-13 uses, so a fallback inserted and
  // removed inside one settled navigation is still counted — "it was never
  // painted" is exactly what this criterion claims, and a post-hoc snapshot
  // cannot say it.
  //
  // The threshold is asserted beside the behaviour, for **both** routes of the
  // branch, and deliberately so. A warm stay navigation settles inside a
  // microtask, which no in-process observation can separate from a
  // `setTimeout(0)` — so the no-paint assertion alone would stay green after
  // `pendingMs` was set to `0`, which is the one edit CR-AC-16 exists to forbid
  // (ADR 0002's table). The branch needs the guard at both levels: the parent's
  // `beforeLoad` and the child's loader each resolve through a microtask of
  // their own, and either one left at `0` would paint over the live
  // destination.
  it('paints nothing on a cause=stay navigation with a warm access cache (CR-AC-16)', async () => {
    stubRouteSession();

    const { router } = renderRoute(warehouseAddress(WAREHOUSE));
    expect(await screen.findByText(WAREHOUSE_CONTENT)).toBeInTheDocument();

    // Warm both surfaces first, so the navigation under test is the warm return
    // rather than a first visit with a module chunk and two network rounds still
    // ahead of it.
    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE_ACCESS,
        params: { warehouseId: WAREHOUSE },
      });
    });
    expect(
      await screen.findByRole('heading', { name: ACCESS_HEADING }),
    ).toBeInTheDocument();
    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE,
        params: { warehouseId: WAREHOUSE },
      });
    });
    expect(await screen.findByText(WAREHOUSE_CONTENT)).toBeInTheDocument();

    const watch = watchPendingMounts();
    await act(async () => {
      await router.navigate({
        to: ROUTES.WAREHOUSE_ACCESS,
        params: { warehouseId: WAREHOUSE },
      });
    });
    expect(
      await screen.findByRole('heading', { name: ACCESS_HEADING }),
    ).toBeInTheDocument();
    watch.stop();

    expect(watch.mounts()).toBe(0);
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
    expect(warehouseRoute.options.pendingMs).toBe(150);
    expect(accessRoute.options.pendingMs).toBe(150);
    // TanStack's own default is 500 ms, which would hold the fallback on screen
    // after its data had arrived (`sad.md` §5.1).
    expect(warehouseRoute.options.pendingMinMs).toBe(0);
    expect(accessRoute.options.pendingMinMs).toBe(0);
    // The live destination was replaced by the finished one, not by a wait.
    expect(screen.getAllByText(MEMBER_EMAIL).length).toBeGreaterThan(0);
  });

  // CR-RG-04, a **merge blocker** (`change.md` §6's abort threshold), across
  // both addresses and both reasons at once — the matrix neither route file
  // owns. `warehouseRoute.beforeLoad` *returns* a refusal verdict rather than
  // throwing, so declaring a pending contract beside it, and a child loader
  // under it, must leave the refusal exactly where it was: rendered in place at
  // the requested address, with the same non-disclosing reason, never presented
  // as pending and never turned into a redirect.
  //
  // The context read is held on every row, so each refusal is reached *through*
  // the new pending window rather than instead of one.
  it.each([
    ['warehouse', warehouseAddress],
    ['access', accessAddress],
  ] as const)(
    'refuses a %s address in place on a not-a-member verdict, never pending and never a redirect (CR-RG-04)',
    async (_surface, address) => {
      const session = stubRouteSession({
        held: [[CONTEXT_PATTERN, HELD_READ_MS]],
      });
      const requested = address(UNKNOWN_WAREHOUSE);

      const { router } = renderRoute(requested);

      // Reached through the pending window, which is the point of holding the
      // read: the refusal is what the window resolves *to*.
      expect(await screen.findByText(PENDING_LABEL)).toBeInTheDocument();

      const heading = await screen.findByRole('heading', {
        name: NON_DISCLOSING_REFUSAL,
      });
      // Non-disclosing: the refusal names nothing about the address it refused.
      expect(heading.closest('main')?.textContent).not.toContain(
        UNKNOWN_WAREHOUSE,
      );
      // Resolved, so the pending state is gone rather than left standing.
      expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
      // In place: the actor is at the address they asked for, and nothing
      // navigated on their behalf.
      expect(router.state.location.pathname).toBe(requested);
      expect(router.history.length).toBe(1);
      // CR-AC-14 — and the child loader's verdict gate keeps the refusal at
      // zero requests into the Warehouse it named.
      expect(session.urlsMatching(ACCESS_PATTERN)).toEqual([]);
    },
  );

  // AC-23 — an archived membership is no longer a refusal. The Warehouse is
  // entered read-only in place: it resolves through the same pending window,
  // paints its own destination, and still navigates nobody anywhere. This
  // replaces the row that expected the archived refusal at this address, which
  // is what made Demand, Purchase Drafts and Items unreachable rather than
  // read-only.
  it('enters an archived Warehouse read-only in place, never pending and never a redirect (AC-23)', async () => {
    stubRouteSession({
      archived: true,
      held: [[CONTEXT_PATTERN, HELD_READ_MS]],
    });
    const requested = warehouseAddress(WAREHOUSE);

    const { router } = renderRoute(requested);

    expect(await screen.findByText(PENDING_LABEL)).toBeInTheDocument();
    expect(await screen.findByText(WAREHOUSE_CONTENT)).toBeInTheDocument();
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText(ARCHIVED_REFUSAL)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(requested);
    expect(router.history.length).toBe(1);
  });

  // CR-AC-17 — AC-23 reopens the watch destinations and nothing else, so the
  // Access address alone keeps the explicit archived refusal. Its own datasets
  // stay unrequested; the projection the shell reads to build the nav list is a
  // property of having entered, not of this destination.
  it('still refuses the Access address of an archived Warehouse, requesting none of its datasets (CR-AC-17)', async () => {
    const session = stubRouteSession({
      archived: true,
      held: [[CONTEXT_PATTERN, HELD_READ_MS]],
    });
    const requested = accessAddress(WAREHOUSE);

    const { router } = renderRoute(requested);

    expect(await screen.findByText(PENDING_LABEL)).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: ARCHIVED_REFUSAL }),
    ).toBeInTheDocument();
    expect(screen.queryByText(ACCESS_HEADING)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(requested);
    expect(router.history.length).toBe(1);
    expect(session.urlsMatching(ACCESS_MEMBERS_PATTERN)).toEqual([]);
  });
});

// `sad.md` §4.7 — "a mutation cannot reach a route loader". The route loader
// runs for a navigation and for nothing else, so neither a write nor the cache
// invalidation it causes may replace the live destination with a pending state.
describe('nothing but a navigation reaches a route loader (T7)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    probe.warehouseLayoutCommits.length = 0;
  });

  // CR-AC-10's route-level clause, and `sad.md` §4.7's — "a mutation cannot
  // reach a route loader". A cache invalidation refetches the *subscribed* query
  // and nothing else: the route loader does not re-run, so `RoutePendingState`
  // never replaces the live destination and the destination the actor is
  // reading stays on screen across the refresh.
  //
  // The only `router.invalidate()` in the application is `RouteErrorState`'s
  // retry, which is deliberate and unrelated; this case pins the absence of any
  // *other* coupling between the RTK Query store and the router.
  //
  // The component-level half of CR-AC-10 — that no skeleton or spinner replaces
  // the painted rows while the refetch is in flight — is CH-10, removed with
  // `MemberList`'s readiness branch and pinned by that file's own spec
  // (`tasks/member-list-actor.md` DoD). It is deliberately not asserted here:
  // this directory owns what the *route* does, and asserting a component branch
  // that rollout step 3 has not reached yet would be a red gate rather than a
  // gate.
  it('re-runs no loader and paints no pending state when the members tag is invalidated (CR-AC-10)', async () => {
    const session = stubRouteSession();
    const user = userEvent.setup();

    const { router, store } = renderRoute(accessAddress(WAREHOUSE));
    expect(
      await screen.findByRole('heading', { name: ACCESS_HEADING }),
    ).toBeInTheDocument();

    // The criterion is written about "a member list already painted with rows",
    // so the Members tab is the one open. Queries are scoped to the selected
    // panel because the force-mounted siblings put several panels' text in the
    // DOM at once (`sad.md` §11, risk row 3).
    await user.click(screen.getByRole('tab', { name: 'Members' }));
    expect(
      within(screen.getByRole('tabpanel')).getByText(MEMBER_EMAIL),
    ).toBeInTheDocument();

    const loadsBefore = session.urlsMatching(ACCESS_PATTERN).length;
    const memberReadsBefore = session.urlsMatching(
      ACCESS_MEMBERS_PATTERN,
    ).length;
    const watch = watchPendingMounts();

    act(() => {
      store.dispatch(
        api.util.invalidateTags([{ type: 'AccessMembers', id: WAREHOUSE }]),
      );
    });
    // The force-mounted Members panel is the subscriber RTK Query refetches in
    // place, so the invalidation genuinely reaches the network — without that,
    // this case would prove only that nothing happened at all.
    await waitFor(() =>
      expect(session.urlsMatching(ACCESS_MEMBERS_PATTERN)).toHaveLength(
        memberReadsBefore + 1,
      ),
    );
    watch.stop();

    expect(watch.mounts()).toBe(0);
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
    // Only the invalidated dataset was re-read. A loader re-run would have
    // re-issued `access/current` and every admitted tab dataset beside it.
    expect(session.urlsMatching(ACCESS_PATTERN)).toHaveLength(loadsBefore + 1);
    // The destination the actor is reading is still the one on screen.
    expect(
      screen.getByRole('heading', { name: ACCESS_HEADING }),
    ).toBeInTheDocument();
    expect(
      await within(screen.getByRole('tabpanel')).findByText(MEMBER_EMAIL),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(accessAddress(WAREHOUSE));
  });

  // CR-RG-06 — "action feedback is not destination readiness". A mutation in
  // flight is reported by the control that ran it and by
  // `mutationFeedbackMiddleware`'s promise toast; neither is a route concern, so
  // no route pending state appears for a mutation and no loader re-runs for one.
  // The eight components' own `isPending` submit states are pinned beside them
  // (`test-plan.md` §"Where the rows land", colocated row).
  //
  // The write is held, so the destination is observed *while* the mutation is
  // genuinely outstanding rather than after it has settled — the window in which
  // a pending state could appear is the window under test.
  it('paints no pending state and re-runs no loader while a mutation is in flight (CR-RG-06)', async () => {
    const session = stubRouteSession({
      held: [[RENAME_PATTERN, HELD_READ_MS]],
      renameTo: RENAMED_WORKSPACE,
    });

    const { store } = renderRoute(ROUTES.WORKSPACE);
    expect(
      await screen.findByRole('heading', { name: WORKSPACE_HEADING }),
    ).toBeInTheDocument();

    const readsBefore = session.requests.length;
    const watch = watchPendingMounts();
    const rename = store.dispatch(
      workspaceContextApi.endpoints.renameWorkspace.initiate({
        name: RENAMED_WORKSPACE,
      }),
    );

    // In flight: the mutation is outstanding, and the destination is untouched.
    await waitFor(() =>
      expect(
        session.requests.some((request) => request.method === 'PATCH'),
      ).toBe(true),
    );
    expect(watch.mounts()).toBe(0);
    expect(
      screen.getByRole('heading', { name: WORKSPACE_HEADING }),
    ).toBeInTheDocument();

    await act(async () => {
      await rename;
    });
    watch.stop();

    expect(watch.mounts()).toBe(0);
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
    // The mutation was the only request: no loader re-ran behind it.
    expect(session.requests).toHaveLength(readsBefore + 1);
    expect(
      await screen.findByRole('heading', { name: RENAMED_WORKSPACE }),
    ).toBeInTheDocument();
  });
});

// CR-AC-03 — the destination paints complete. `/workspace` is where the
// criterion is written, because it is the destination whose admitted tabs are
// decided by the actor's Workspace Permissions and whose datasets the route
// loader awaits in one round.
describe('every admitted tab is ready on the destination first paint (T7)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    probe.warehouseLayoutCommits.length = 0;
  });

  // CR-AC-03's paint and tab-switch rows, driven through the route rather than
  // through the component. `WorkspaceAdministration.spec.tsx` owns the
  // force-mount mechanics; what only the assembled stack can show is that the
  // *route* is what made "already arrived" true — that the destination's first
  // paint already carries every admitted tab's content, and that opening a tab
  // afterwards costs nothing and shows nothing.
  it('paints every admitted tab and issues no request when the actor switches between them (CR-AC-03)', async () => {
    const session = stubRouteSession();
    const user = userEvent.setup();

    renderRoute(ROUTES.WORKSPACE);

    // First paint: not merely the selected tab's content, but every admitted
    // tab's. A panel that is not committed runs no hook, so this is the
    // observable form of "each admitted tab renders its content on first paint".
    const selected = await screen.findByRole('tabpanel');
    expect(
      within(selected).getByRole('list', { name: 'Warehouses' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Workspace roles' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Workspace members' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Workspace permissions' }),
    ).toBeInTheDocument();

    const requestsAfterPaint = session.requests.length;

    await user.click(screen.getByRole('tab', { name: /workspace roles/iu }));
    // Scoped to the selected panel: force-mounted siblings put several panels'
    // text in the DOM at once (`sad.md` §11, risk row 3).
    expect(
      within(screen.getByRole('tabpanel')).getByRole('region', {
        name: 'Workspace roles',
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Members' }));
    expect(
      within(screen.getByRole('tabpanel')).getByRole('region', {
        name: 'Workspace members',
      }),
    ).toBeInTheDocument();

    // No request, and no waiting affordance of any kind — neither the route's
    // nor a component's.
    expect(session.requests).toHaveLength(requestsAfterPaint);
    expect(screen.queryByText(PENDING_LABEL)).not.toBeInTheDocument();
    expect(waitingAffordances()).toHaveLength(0);
  });

  // CR-AC-03's dwell-past-retention row — the criterion's own falsifier, at the
  // route level. The loaders dispatch with `subscribe: false`, so a
  // loader-filled entry holds no subscriber of its own and RTK Query starts its
  // 60-second `keepUnusedDataFor` timer the moment the read settles. Force-
  // mounting every admitted panel is what gives each admitted tab's own query
  // hook a mount on first paint, and with it the subscription that retains the
  // entry for the destination's lifetime. Without it, an unopened admitted tab's
  // entry is evicted after a minute's dwell and — with no readiness term left
  // after CH-09 — that tab paints its *empty* message for a dataset merely in
  // flight.
  //
  // The clock is faked before the navigation, because the removal timeout is
  // scheduled the moment a subscriber-less read settles: a clock installed
  // afterwards would never see it. `shouldAdvanceTime` is required because
  // `@testing-library/dom@10.4.1` recognizes only a `jest` global as fake
  // timers, so `findBy*` would otherwise take the real-timer path against a
  // frozen clock.
  it('keeps every admitted tab past keepUnusedDataFor, so opening one issues no request and shows no empty message (CR-AC-03)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const session = stubRouteSession();

    renderRoute(ROUTES.WORKSPACE);

    const selected = await screen.findByRole('tabpanel');
    expect(
      within(selected).getByRole('list', { name: 'Warehouses' }),
    ).toBeInTheDocument();

    const requestsAfterPaint = session.requests.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETENTION_WINDOW_MS * 2);
    });

    await user.click(screen.getByRole('tab', { name: /workspace roles/iu }));

    expect(
      within(screen.getByRole('tabpanel')).getByRole('region', {
        name: 'Workspace roles',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('This workspace has no custom workspace role yet.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('This workspace has no workspace member yet.'),
    ).not.toBeInTheDocument();
    expect(session.requests).toHaveLength(requestsAfterPaint);
  });
});
