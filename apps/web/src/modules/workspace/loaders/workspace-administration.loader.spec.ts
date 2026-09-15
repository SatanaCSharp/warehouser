import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WorkspacePermissionId as WorkspacePermissionIdValue } from '@warehouser/shared-types/enums';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { workspaceWarehousesApi } from 'modules/workspace/api/warehouse-api';
import { loadWorkspaceAdministration } from 'modules/workspace/loaders/workspace-administration.loader';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import { workspaceUsersApi } from 'shared/api/workspace/workspace-users-api';
import type { AppStore } from 'store';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
} from 'test/workspace-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T4 / CH-03, CH-15 — `/workspace`'s route loader. It awaits the Workspace
// context as its primary read and fans every dataset the actor's admitted
// surfaces would fetch out through one `Promise.allSettled` round
// (`sad.md` §4.2, §5.5). Colocated with the loader it covers
// (`placing-web-tests.md` §1).

const LOADER_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'workspace-administration.loader.ts',
);

const CONTEXT_URL = '/api/v1/workspace/context';
const MEMBERS_URL = '/api/v1/workspace/members';
const PERMISSIONS_URL = '/api/v1/workspace/permissions';
const ROLES_URL = '/api/v1/workspace/roles';
const USERS_URL = '/api/v1/workspace/users';
const WAREHOUSES_URL = '/api/v1/workspace/warehouses';

/** The five secondary datasets of `sad.md` §5.5's `workspaceRoute` table. */
const SECONDARY_URLS = [
  MEMBERS_URL,
  PERMISSIONS_URL,
  ROLES_URL,
  USERS_URL,
  WAREHOUSES_URL,
];

const loaderInput = (store: AppStore): { context: { store: AppStore } } => ({
  context: { store },
});

/**
 * A Workspace session the loader can run against: the fixture's own reads plus
 * the acting user's store. The context body carries exactly the Workspace
 * Permissions under test, which is what each parity row varies.
 */
const workspaceSession = (
  workspacePermissionIds: readonly WorkspacePermissionIdValue[],
): { requestedUrls: string[]; store: AppStore } => ({
  requestedUrls: stubWorkspaceServer({
    context: namedWorkspaceContext(workspacePermissionIds),
  }),
  store: authenticatedWorkspaceStore(),
});

/** The three Permissions that each admit one of `/workspace`'s tabs (CR-AC-03). */
const everyWatchPermission: WorkspacePermissionIdValue[] = [
  WorkspacePermissionId.WAREHOUSES_WATCH,
  WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
  WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
];

/**
 * CR-RG-02's five `workspaceRoute` secondary rows plus its unconditional
 * primary, enumerated rather than sampled: widening and narrowing are both
 * regressions, so every gate is exercised alone as well as together. The
 * `WAREHOUSES:WATCH` row is the tab-descriptor gate — `WarehousesTab.tsx:51-52`
 * applies no hook `skip`, so nothing but this row holds it.
 */
const parityRows: [
  label: string,
  held: WorkspacePermissionIdValue[],
  requested: string[],
][] = [
  [
    'all three watch Permissions',
    everyWatchPermission,
    [CONTEXT_URL, ...SECONDARY_URLS],
  ],
  [
    'WAREHOUSES:WATCH alone (tab descriptor)',
    [WorkspacePermissionId.WAREHOUSES_WATCH],
    [CONTEXT_URL, WAREHOUSES_URL],
  ],
  [
    'WORKSPACE_MEMBERS:WATCH alone (hook skip)',
    [WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH],
    [CONTEXT_URL, MEMBERS_URL, USERS_URL],
  ],
  [
    'WORKSPACE_ROLES:WATCH alone (hook skip)',
    [WorkspacePermissionId.WORKSPACE_ROLES_WATCH],
    [CONTEXT_URL, PERMISSIONS_URL, ROLES_URL],
  ],
  [
    'WORKSPACE:RENAME alone (CR-AC-03, the rename-only actor)',
    [WorkspacePermissionId.WORKSPACE_RENAME],
    [CONTEXT_URL],
  ],
  [
    'every Permission that admits no tab (the widening direction)',
    Object.values(WorkspacePermissionId).filter(
      (permission) => !everyWatchPermission.includes(permission),
    ),
    [CONTEXT_URL],
  ],
];

/**
 * Holds every secondary response open, so the request log can be read while
 * all five are still in flight. That is the falsifier for a loader that awaits
 * its datasets one at a time: a sequential body would leave four unissued and
 * the wait below would never see five (`spec.md` §6 row 1).
 */
const holdSecondaryResponses = (): {
  held: string[];
  release: () => void;
} => {
  const answer = globalThis.fetch;
  const held: string[] = [];
  let release = (): void => {};
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });

  vi.stubGlobal(
    'fetch',
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input instanceof Request ? input.url : input);
      if (!SECONDARY_URLS.includes(url)) {
        return answer(input, init);
      }

      held.push(url);
      return opened.then(() => answer(input, init));
    },
  );

  return { held, release };
};

/** Fails the Workspace-context read, which is the destination's primary. */
const failContextRead = (): void => {
  const answer = globalThis.fetch;

  vi.stubGlobal(
    'fetch',
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes(CONTEXT_URL)) {
        return answer(input, init);
      }

      return Promise.resolve(
        Response.json(
          { code: 'api.unexpected', message: 'Unavailable' },
          { status: 500 },
        ),
      );
    },
  );
};

describe('loadWorkspaceAdministration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(parityRows)(
    'requests exactly the datasets admitted by %s (CR-RG-02)',
    async (_label, workspacePermissionIds, requested) => {
      const { requestedUrls, store } = workspaceSession(workspacePermissionIds);

      await loadWorkspaceAdministration(loaderInput(store));

      expect([...requestedUrls].sort()).toStrictEqual(requested);
    },
  );

  it('issues all five secondary datasets in one round (spec.md §6 row 1)', async () => {
    // `allSettled` bounds the wait by the slowest admitted dataset rather than
    // their sum, which only holds if all five are in flight together. Reading
    // the log while every secondary response is held open is what distinguishes
    // one round from five sequential ones.
    const { store } = workspaceSession(everyWatchPermission);
    const { held, release } = holdSecondaryResponses();

    const settled = loadWorkspaceAdministration(loaderInput(store));
    await vi.waitFor(() =>
      expect([...held].sort()).toStrictEqual(SECONDARY_URLS),
    );

    release();
    await settled;
  });

  it('resolves its primary read from the entry beforeLoad already filled (sad.md §4.3)', async () => {
    // `requireWorkspaceCapability` awaits and unwraps `getWorkspaceContext` in
    // `beforeLoad`, so the loader's own `initiate` must resolve from that cache
    // entry rather than opening a second request for the same body.
    const { requestedUrls, store } = workspaceSession(everyWatchPermission);
    await store
      .dispatch(
        workspaceContextApi.endpoints.getWorkspaceContext.initiate(undefined, {
          subscribe: false,
        }),
      )
      .unwrap();
    requestedUrls.length = 0;

    await loadWorkspaceAdministration(loaderInput(store));

    expect(requestedUrls).not.toContain(CONTEXT_URL);
    expect([...requestedUrls].sort()).toStrictEqual(SECONDARY_URLS);
  });

  it('dispatches its own datasets with subscribe: false (sad.md §4.4)', async () => {
    // A loader-filled entry holds no subscriber of its own; the force-mounted
    // panel's own hook is what retains it. Asserting the option rather than a
    // retention window keeps the falsifier exact.
    const { store } = workspaceSession(everyWatchPermission);
    const initiates = [
      vi.spyOn(
        workspaceWarehousesApi.endpoints.listWorkspaceWarehouses,
        'initiate',
      ),
      vi.spyOn(workspaceUsersApi.endpoints.listWorkspaceUsers, 'initiate'),
    ];

    await loadWorkspaceAdministration(loaderInput(store));

    initiates.forEach((initiate) => {
      expect(initiate).toHaveBeenCalledTimes(1);
      expect(initiate).toHaveBeenCalledWith(undefined, { subscribe: false });
    });
  });

  it('propagates a rejected primary read out of the loader (CR-AC-15)', async () => {
    // The rejection is what reaches `RouteErrorState`; swallowing it here would
    // paint a destination assembled from a context that never arrived.
    const { store } = workspaceSession(everyWatchPermission);
    failContextRead();

    await expect(
      loadWorkspaceAdministration(loaderInput(store)),
    ).rejects.toMatchObject({ code: 'api.unexpected' });
  });

  it('absorbs a rejected secondary dispatch and still resolves (CR-AC-15)', async () => {
    // The falsifier for the settle semantics itself. A dispatched RTK Query
    // request reports a failed read by resolving with an error result rather
    // than by rejecting, so a failing *server* cannot distinguish
    // `Promise.allSettled` from `Promise.all` — only a dispatch that really
    // rejects can, and this is the case that makes swapping them fail.
    const { store } = workspaceSession(everyWatchPermission);
    vi.spyOn(
      workspaceUsersApi.endpoints.listWorkspaceUsers,
      'initiate',
    ).mockReturnValue((() =>
      Promise.reject(
        new Error('the workspace users read rejected'),
      )) as unknown as ReturnType<
      typeof workspaceUsersApi.endpoints.listWorkspaceUsers.initiate
    >);

    await expect(
      loadWorkspaceAdministration(loaderInput(store)),
    ).resolves.toBeUndefined();
  });

  it('leaves a failed secondary read in the cache for its own tab to render (CR-AC-15)', async () => {
    // `Promise.allSettled` is the whole of the settle semantics: the failed
    // entry is in the cache with `isError: true` and the tab renders its own
    // error message, while the destination still paints.
    const requestedUrls = stubWorkspaceServer({
      context: namedWorkspaceContext(everyWatchPermission),
      warehouses: 'unavailable',
    });
    const store = authenticatedWorkspaceStore();

    await expect(
      loadWorkspaceAdministration(loaderInput(store)),
    ).resolves.toBeUndefined();

    expect([...requestedUrls].sort()).toStrictEqual([
      CONTEXT_URL,
      ...SECONDARY_URLS,
    ]);
    expect(
      workspaceWarehousesApi.endpoints.listWorkspaceWarehouses.select()(
        store.getState(),
      ).isError,
    ).toBe(true);
  });

  it('imports no page module (ADR 0001 §Decision outcome)', () => {
    // The loader is reachable from the router chunk, so importing a page would
    // defeat the lazy `import('./page')` boundary. Comments are stripped first:
    // the loader's own documentation names that boundary, and a scan that read
    // prose as an import would report the sentence explaining the rule.
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
