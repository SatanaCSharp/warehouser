import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WorkspacePermissionId as WorkspacePermissionIdValue } from '@warehouser/shared-types/enums';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { workspaceMembersApi } from 'modules/access/api/workspace-members-api';
import { workspaceRolesApi } from 'modules/access/api/workspace-roles-api';
import { loadWorkspaceAdministrationAccessDatasets } from 'modules/access/loaders/workspace-administration-datasets.loader';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import {
  authenticatedWorkspaceStore,
  namedWorkspaceContext,
  stubWorkspaceServer,
} from 'test/workspace-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

const LOADER_SOURCE = posix.join(
  posix.dirname(fileURLToPath(import.meta.url)),
  'workspace-administration-datasets.loader.ts',
);

const MEMBERS_URL = '/api/v1/workspace/members';
const PERMISSIONS_URL = '/api/v1/workspace/permissions';
const ROLES_URL = '/api/v1/workspace/roles';

const settle = async (
  dispatched: readonly Promise<unknown>[],
): Promise<void> => {
  await Promise.allSettled(dispatched);
};

/**
 * The three datasets `modules/access` contributes to `/workspace`, each with
 * the Workspace Permission that gates it — CR-RG-02's three access rows of the
 * `workspaceRoute` table, reproduced here as the parity the loader must hold
 * against `useWorkspaceMembers`, `useWorkspaceRoles` and
 * `useWorkspacePermissionCatalogue`. Widening and narrowing are both
 * regressions, so every subset below is enumerated rather than sampled.
 */
const admittedDatasets: [
  label: string,
  held: WorkspacePermissionIdValue[],
  requested: string[],
][] = [
  [
    'both watch Permissions',
    [
      WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
      WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
    ],
    [MEMBERS_URL, PERMISSIONS_URL, ROLES_URL],
  ],
  [
    'WORKSPACE_MEMBERS:WATCH alone',
    [WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH],
    [MEMBERS_URL],
  ],
  [
    'WORKSPACE_ROLES:WATCH alone',
    [WorkspacePermissionId.WORKSPACE_ROLES_WATCH],
    [PERMISSIONS_URL, ROLES_URL],
  ],
  [
    'neither watch Permission (CR-AC-03, the rename-only actor)',
    [
      WorkspacePermissionId.WORKSPACE_RENAME,
      WorkspacePermissionId.WAREHOUSES_WATCH,
      WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
      WorkspacePermissionId.WORKSPACE_MEMBERS_ADD,
    ],
    [],
  ],
];

describe('loadWorkspaceAdministrationAccessDatasets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(admittedDatasets)(
    'requests exactly the datasets admitted by %s (CR-RG-02)',
    async (_label, workspacePermissionIds, requested) => {
      const requestedUrls = stubWorkspaceServer();
      const store = authenticatedWorkspaceStore();

      const dispatched = loadWorkspaceAdministrationAccessDatasets({
        store,
        workspacePermissionIds,
      });
      await settle(dispatched);

      expect([...requestedUrls].sort()).toStrictEqual(requested);
      expect(dispatched).toHaveLength(requested.length);
    },
  );

  it('issues every admitted dataset in one round, before the caller settles them', async () => {
    // `spec.md` §6 row 1: the wait is bounded by the slowest admitted dataset
    // rather than their sum, which only holds if the loader dispatches without
    // awaiting. Reading the request log *before* anything is awaited is what
    // distinguishes one round from three sequential ones.
    const requestedUrls = stubWorkspaceServer();
    const store = authenticatedWorkspaceStore();

    const dispatched = loadWorkspaceAdministrationAccessDatasets({
      store,
      workspacePermissionIds: [
        WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ],
    });

    expect([...requestedUrls].sort()).toStrictEqual([
      MEMBERS_URL,
      PERMISSIONS_URL,
      ROLES_URL,
    ]);

    await settle(dispatched);
  });

  it('dispatches every dataset with subscribe: false (sad.md §4.4)', async () => {
    // A loader-filled entry holds no subscriber of its own; the force-mounted
    // panel's own hook is what retains it. Asserting the option rather than a
    // retention window keeps the falsifier exact: flipping any one of the three
    // to a subscribing dispatch fails here.
    stubWorkspaceServer();
    const store = authenticatedWorkspaceStore();
    const initiates = [
      vi.spyOn(workspaceMembersApi.endpoints.listWorkspaceMembers, 'initiate'),
      vi.spyOn(workspaceRolesApi.endpoints.listWorkspaceRoles, 'initiate'),
      vi.spyOn(
        workspaceRolesApi.endpoints.listWorkspacePermissions,
        'initiate',
      ),
    ];

    const dispatched = loadWorkspaceAdministrationAccessDatasets({
      store,
      workspacePermissionIds: [
        WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ],
    });
    await settle(dispatched);

    initiates.forEach((initiate) => {
      expect(initiate).toHaveBeenCalledTimes(1);
      expect(initiate).toHaveBeenCalledWith(undefined, { subscribe: false });
    });
  });

  it('gates on the workspacePermissionIds it is passed, never on a Permission it reads itself', async () => {
    // sad.md §5.4: `modules/workspace` passes the resolved ids across the
    // boundary and `modules/access` applies its own gates to them. The
    // falsifier is a cached Workspace context that disagrees with the argument:
    // a loader reading the cache would request all three datasets here.
    const requestedUrls = stubWorkspaceServer({
      context: namedWorkspaceContext(Object.values(WorkspacePermissionId)),
    });
    const store = authenticatedWorkspaceStore();
    await store
      .dispatch(
        workspaceContextApi.endpoints.getWorkspaceContext.initiate(undefined, {
          subscribe: false,
        }),
      )
      .unwrap();
    requestedUrls.length = 0;

    const dispatched = loadWorkspaceAdministrationAccessDatasets({
      store,
      workspacePermissionIds: [],
    });
    await settle(dispatched);

    expect(requestedUrls).toStrictEqual([]);
    expect(dispatched).toStrictEqual([]);
  });

  it('imports no page module (ADR 0001 §Decision outcome)', () => {
    // The loader is reachable from the router chunk, so importing a page would
    // defeat the lazy `import('./page')` boundary. This is a fact about this
    // one file, so it is asserted beside it rather than in a structural gate
    // (`placing-web-tests.md` §1).
    // Comments are stripped first: the loader's own documentation names the
    // `import('./page')` boundary it must not cross, and a scan that read prose
    // as an import would report the sentence explaining the rule.
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
