import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PermissionId } from '@warehouser/shared-types/enums';
import { accessApi } from 'modules/access/api/access-api';
import type { AccessSurfaceContext } from 'modules/access/loaders/access-surface.loader';
import { loadAccessSurface } from 'modules/access/loaders/access-surface.loader';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import type { AppStore } from 'store';
import {
  accessIds,
  accessMembers,
  accessPath,
  accessPermissions,
  accessRoles,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

const LOADER_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'access-surface.loader.ts',
);

const CURRENT_URL = accessPath(accessIds.warehouse, 'current');
const MEMBERS_URL = accessPath(accessIds.warehouse, 'members');
const PERMISSIONS_URL = accessPath(accessIds.warehouse, 'permissions');
const ROLES_URL = accessPath(accessIds.warehouse, 'roles');

/**
 * The verdict `warehouseRoute.beforeLoad` publishes into the match context for
 * a Warehouse the actor may enter. `useEnteredWarehouse()` reads exactly this
 * object and yields its `warehouseId`, which is the argument
 * `useCurrentPermissions` hands `useGetCurrentAccessQuery` (CR-AC-04).
 */
const enteredContext = (store: AppStore): AccessSurfaceContext => ({
  status: 'entered',
  store,
  warehouseId: accessIds.warehouse,
});

const refusedContext = (
  store: AppStore,
  reason: 'archived' | 'not-a-member',
): AccessSurfaceContext => ({
  reason,
  status: 'refused',
  store,
  warehouseId: accessIds.warehouse,
});

/**
 * Drains the microtask and macrotask queues, so a **negative** assertion —
 * "nothing beyond the primary read has been requested yet" — is deterministic
 * rather than a race with the request that would falsify it.
 */
const flush = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

const asPage = <TItem>(items: readonly TItem[]): Record<string, unknown> => ({
  hasNext: false,
  hasPrev: false,
  items,
  nextCursor: null,
});

type DeferredAccessServer = {
  /** Settle one in-flight request as a server failure. */
  fail: (url: string) => Promise<void>;
  requestedUrls: string[];
  /** Settle one in-flight request with its fixture body. */
  respond: (url: string) => Promise<void>;
  /** Settle everything still in flight, in one round. */
  respondAll: () => Promise<void>;
};

/**
 * An access server whose every response is held open until the case releases
 * it. Holding a response is what makes the loader's **rounds** observable: the
 * request log read while the projection is still in flight is the set of
 * requests round 1 issued, and no assertion about ordering can be satisfied by
 * accident.
 *
 * Its actor holds every Permission, so the cases below observe ordering and
 * failure semantics against the widest admitted set. Which datasets each
 * Permission admits is the separate concern `parityRows` enumerates.
 */
const deferredAccessServer = (): DeferredAccessServer => {
  const requestedUrls: string[] = [];
  const inFlight = new Map<string, (response: Response) => void>();

  const bodies: Record<string, unknown> = {
    [CURRENT_URL]: {
      archivedAt: null,
      permissionIds: Object.values(PermissionId),
      roleId: accessIds.managerRole,
      roleKind: 'warehouse_manager',
      warehouseId: accessIds.warehouse,
    },
    [MEMBERS_URL]: asPage(accessMembers),
    [PERMISSIONS_URL]: asPage(accessPermissions),
    [ROLES_URL]: asPage(accessRoles),
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      requestedUrls.push(url);
      return new Promise<Response>((resolve) => {
        inFlight.set(url, resolve);
      });
    }),
  );

  const settle = async (url: string, response: Response): Promise<void> => {
    inFlight.get(url)?.(response);
    inFlight.delete(url);
    await flush();
  };

  return {
    fail: (url) =>
      settle(url, Response.json({ code: 'api.unexpected' }, { status: 500 })),
    requestedUrls,
    respond: (url) => settle(url, Response.json(bodies[url] ?? {})),
    respondAll: async () => {
      const open = [...inFlight.keys()];
      open.forEach((url) => {
        inFlight.get(url)?.(Response.json(bodies[url] ?? {}));
        inFlight.delete(url);
      });
      await flush();
    },
  };
};

/**
 * CR-RG-02's four `accessRoute` rows, in both directions and per Permission.
 *
 * Every member of `PermissionId` appears exactly once as a sole-held
 * Permission, so each row states both what the actor holding it receives and —
 * by the datasets absent from its expectation — what it withholds. Widening and
 * narrowing are both regressions, so the sets are enumerated rather than
 * sampled, and the expectations are written as literals rather than derived
 * from `access-permission-sets.ts`: deriving them from the same constants the
 * loader reads would make the check pass for any pair of values that happened
 * to agree.
 */
const parityRows: [
  label: string,
  held: PermissionId[],
  requestedSecondary: string[],
][] = [
  ['ROLES:WATCH', [PermissionId.ROLES_WATCH], [PERMISSIONS_URL, ROLES_URL]],
  ['ROLES:CREATE', [PermissionId.ROLES_CREATE], [PERMISSIONS_URL, ROLES_URL]],
  ['ROLES:UPDATE', [PermissionId.ROLES_UPDATE], [PERMISSIONS_URL, ROLES_URL]],
  ['ROLES:DELETE', [PermissionId.ROLES_DELETE], [PERMISSIONS_URL, ROLES_URL]],
  [
    'ROLES:ASSIGN',
    [PermissionId.ROLES_ASSIGN],
    [MEMBERS_URL, PERMISSIONS_URL, ROLES_URL],
  ],
  [
    'WAREHOUSE_MANAGER_ROLE:REASSIGN',
    [PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN],
    [MEMBERS_URL, PERMISSIONS_URL, ROLES_URL],
  ],
  ['USERS:WATCH', [PermissionId.USERS_WATCH], [MEMBERS_URL, ROLES_URL]],
  ['USERS:CREATE', [PermissionId.USERS_CREATE], [MEMBERS_URL, ROLES_URL]],
  ['USERS:DELETE', [PermissionId.USERS_DELETE], [MEMBERS_URL]],
  ['USERS:EMAIL_UPDATE', [PermissionId.USERS_EMAIL_UPDATE], [MEMBERS_URL]],
  [
    'USERS:PASSWORD_CHANGE',
    [PermissionId.USERS_PASSWORD_CHANGE],
    [MEMBERS_URL],
  ],
  ['USERS:UPDATE — in none of the three sets', [PermissionId.USERS_UPDATE], []],
  ['no Permission at all', [], []],
  [
    'every Permission',
    Object.values(PermissionId),
    [MEMBERS_URL, PERMISSIONS_URL, ROLES_URL],
  ],
];

describe('loadAccessSurface', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // CR-AC-14 / CH-16. `warehouseRoute.beforeLoad` RETURNS a refusal verdict
  // rather than throwing, so this loader runs on a refused address. Moving the
  // fetch to the route without this gate would issue `getCurrentAccess` for the
  // Warehouse the actor was just refused; the count around a refusal must equal
  // `baseline_revision`, which is zero. Both reasons are enumerated because the
  // gate is on the status, and a gate written against one reason would leak the
  // other.
  it.each([['not-a-member'], ['archived']] as const)(
    'issues no request at all when the verdict is refused for %s (CR-AC-14)',
    async (reason) => {
      const requestedUrls = stubAccessServer();
      const store = authenticatedStore();

      await loadAccessSurface({
        context: refusedContext(store, reason),
      });
      await flush();

      expect(requestedUrls).toStrictEqual([]);
      expect(store.getState().api.queries).toStrictEqual({});
    },
  );

  // CR-AC-04 and `spec.md` §6 row 2. Every access skip set is derived from the
  // projection's `permissionIds`, so the projection must resolve before the tab
  // datasets can be selected — and the accepted cost is exactly TWO rounds. The
  // request log is read while each round is still in flight, which is what
  // distinguishes "two rounds" from three sequential reads that happen to end
  // in the same request set.
  it('awaits the projection, then issues every admitted dataset in one further round — and no third (CR-AC-04)', async () => {
    const server = deferredAccessServer();
    const store = authenticatedStore();
    const outcome = loadAccessSurface({ context: enteredContext(store) }).then(
      () => 'settled' as const,
    );

    await flush();
    expect(server.requestedUrls).toStrictEqual([CURRENT_URL]);

    await server.respond(CURRENT_URL);
    expect([...server.requestedUrls].sort()).toStrictEqual(
      [CURRENT_URL, MEMBERS_URL, PERMISSIONS_URL, ROLES_URL].sort(),
    );

    await server.respondAll();

    expect(await outcome).toBe('settled');
    expect(server.requestedUrls).toHaveLength(4);
  });

  // CR-AC-04's second clause. `useEnteredWarehouse()` yields the verdict's
  // `warehouseId` and `useCurrentPermissions` passes it straight through, so
  // the loader must key its entry on the same value — an id taken from anywhere
  // else, or the `''` the hook falls back to outside a Warehouse, would open a
  // SECOND cache entry and `AccessPage` would issue the read again.
  it('fills the one cache entry the page will read, keyed by the entered Warehouse (CR-AC-04)', async () => {
    const requestedUrls = stubAccessServer();
    const store = authenticatedStore();

    await loadAccessSurface({ context: enteredContext(store) });

    expect(
      Object.keys(store.getState().api.queries).filter((key) =>
        key.startsWith('getCurrentAccess('),
      ),
    ).toStrictEqual([`getCurrentAccess("${accessIds.warehouse}")`]);

    // The read `useCurrentPermissions` performs on mount, issued verbatim: it
    // must be served by the entry the loader filled rather than open its own.
    await store
      .dispatch(
        accessPermissionsApi.endpoints.getCurrentAccess.initiate(
          accessIds.warehouse,
          { subscribe: false },
        ),
      )
      .unwrap();

    expect(requestedUrls.filter((url) => url === CURRENT_URL)).toHaveLength(1);
  });

  // sad.md §4.4 — a loader-filled entry holds no subscriber of its own; the
  // force-mounted panel's own hook is what retains it. Asserting the option
  // rather than a retention window keeps the falsifier exact: flipping any one
  // of the four to a subscribing dispatch fails here.
  it('dispatches every read with subscribe: false (sad.md §4.4)', async () => {
    stubAccessServer();
    const store = authenticatedStore();
    const initiates = [
      vi.spyOn(accessPermissionsApi.endpoints.getCurrentAccess, 'initiate'),
      vi.spyOn(accessApi.endpoints.listAccessRoles, 'initiate'),
      vi.spyOn(accessApi.endpoints.listAccessMembers, 'initiate'),
      vi.spyOn(accessApi.endpoints.listAccessPermissions, 'initiate'),
    ];

    await loadAccessSurface({ context: enteredContext(store) });

    initiates.forEach((initiate) => {
      expect(initiate).toHaveBeenCalledTimes(1);
      expect(initiate).toHaveBeenCalledWith(accessIds.warehouse, {
        subscribe: false,
      });
    });
  });

  it.each(parityRows)(
    'requests exactly the datasets admitted by %s (CR-RG-02)',
    async (_label, permissionIds, requestedSecondary) => {
      const requestedUrls = stubAccessServer({ permissionIds });
      const store = authenticatedStore();

      await loadAccessSurface({ context: enteredContext(store) });
      await flush();

      expect([...requestedUrls].sort()).toStrictEqual(
        [CURRENT_URL, ...requestedSecondary].sort(),
      );
    },
  );

  // CR-AC-15. The primary read is the destination's: a rejection propagates out
  // of the loader and `RouteErrorState` replaces the destination. It must also
  // stop the second round — the skip sets it would have been selected from
  // never resolved.
  it('propagates a rejected primary read and issues no second round (CR-AC-15)', async () => {
    const server = deferredAccessServer();
    const store = authenticatedStore();
    const outcome = loadAccessSurface({ context: enteredContext(store) }).then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    );

    await flush();
    await server.fail(CURRENT_URL);

    expect(await outcome).toBe('rejected');
    expect(server.requestedUrls).toStrictEqual([CURRENT_URL]);
  });

  // CR-AC-15's other half: a secondary rejection is absorbed by
  // `Promise.allSettled`, the destination paints, and the failed entry stays in
  // the cache as an error for that tab's own error arm to render — which is why
  // `AccessDataset.isError` survives CH-09.
  it('absorbs a rejected secondary read and still settles (CR-AC-15)', async () => {
    const server = deferredAccessServer();
    const store = authenticatedStore();
    const outcome = loadAccessSurface({ context: enteredContext(store) }).then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    );

    await flush();
    await server.respond(CURRENT_URL);
    await server.fail(ROLES_URL);
    await server.respondAll();

    expect(await outcome).toBe('resolved');
    expect(
      store.getState().api.queries[`listAccessRoles("${accessIds.warehouse}")`]
        ?.status,
    ).toBe('rejected');
    expect(
      store.getState().api.queries[
        `listAccessMembers("${accessIds.warehouse}")`
      ]?.status,
    ).toBe('fulfilled');
  });

  it('imports no page module (sad.md §8, ADR 0001 §Decision outcome)', () => {
    // The loader is reachable from the router chunk, so importing a page would
    // defeat the lazy `import('./page')` boundary. This is a fact about this
    // one file, so it is asserted beside it rather than in a structural gate
    // (`placing-web-tests.md` §1). Comments are stripped first: the loader's
    // own documentation names the `import('./page')` boundary it must not
    // cross, and a scan that read prose as an import would report the sentence
    // explaining the rule.
    const source = readFileSync(LOADER_SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    const specifiers = [
      ...source.matchAll(
        /(?:from|import)\s*\(?\s*['"](?<specifier>[^'"]+)['"]/gu,
      ),
    ].map((match) => match.groups?.specifier ?? '');

    expect(specifiers.length).toBeGreaterThan(0);
    expect(
      specifiers.filter((specifier) => /(?:^|\/)page$/u.test(specifier)),
    ).toStrictEqual([]);
  });
});
