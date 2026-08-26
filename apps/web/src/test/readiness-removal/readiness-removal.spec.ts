import { existsSync, globSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The readiness-removal repository scan for the global-loader change request
 * (CR-AC-05 – CR-AC-09, CR-AC-11, CR-AC-13's declaration check, CR-AC-15's
 * dashboard row, CR-RG-07's structural row).
 *
 * **Why no single file owns it.** Every criterion it enforces is a statement of
 * *absence* spread across many files at once — "no component branches on a
 * loading flag", "no readiness value is published from a hook", "the
 * application renders one waiting affordance". Absence has no owner: the
 * subject is not the behaviour of `WorkspaceAdministration`, or of
 * `DatasetCard`, or of `access-dataset.ts`, but the fact that *none of the
 * seventeen files below, and no file added beside them,* names a readiness term
 * any more. A spec placed in any one of those directories would read as if that
 * directory owned the claim, and it would silently enlarge whatever file
 * manifest that directory is already subject to
 * (`docs/system/guides/placing-web-tests.md` §2). §3 of that guide files such a
 * spec in its own dedicated `src/test/<subject>/` directory instead, named for
 * what it establishes rather than for the tree it reads — which is what this
 * directory is, and why it carries this comment.
 *
 * `sad.md` §10 "Structural, by test" calls for exactly this scan. Without it,
 * nothing stops an eighth waiting affordance being reintroduced one file at a
 * time: the colocated specs each assert their own file, and none of them fails
 * when a *new* file grows a spinner.
 *
 * **It is a structural gate, not a substitute for behaviour.** The behavioural
 * rows live in `src/test/route-readiness/` (CR-AC-02, CR-AC-13, CR-AC-16),
 * `src/test/loader-permission-parity/` (CR-RG-02) and the colocated specs. Both
 * are required; this one fails one commit earlier, when a declaration stops
 * saying what the design fixed rather than when a render goes wrong.
 *
 * **Scan scope — production files.** `*.spec.ts(x)` are excluded from the
 * repository-wide sweeps below, mirroring the documented scope of
 * `test/module-boundaries/module-boundaries.spec.ts` and
 * `apps/server/src/users/module-boundaries.spec.ts`. The criteria bind
 * production contracts and production markup; a spec that seeds a readiness
 * field cannot reintroduce one into a contract, and two of them deliberately do
 * (`MembersDatasetCard.spec.tsx`, `RolesDatasetCard.spec.tsx` hand the card an
 * object carrying all three removed fields, to prove the card ignores them).
 * The one spec-side site the scope bound names — `router.state.isLoading` in
 * `modules/home/route.spec.tsx` — is asserted positively by name below, so the
 * bound still bites in both directions at all four allowed sites.
 *
 * **Comments are stripped before every scan.** Several of these files explain
 * in prose which field CH-09 removed, and `access-permission-sets.ts` says in
 * so many words that nothing there derives a `canDoThing`. Matching prose would
 * make the gate fail on documentation and — worse — pass on a comment that
 * merely names the thing it forbids. Only code is scanned.
 *
 * **Known, accepted residue — excluded here, not silently passed.** Two dead
 * optional reads survive inside the guarded `/workspace` route, where
 * `requireWorkspaceCapability` has already awaited the context:
 * `WarehousesTab.tsx`'s `workspaceContext?.warehouses ?? []` and
 * `NameWorkspaceAction.tsx`'s `workspaceContext?.workspace.name ?? null`. They
 * are redundant rather than wrong — the value is always present at those two
 * sites — and `tasks.json`'s authoritative Definition of Done for the call-site
 * task (CH-14) does not name them, so they belong to an already-landed task and
 * to a follow-up, not to this gate. This scan therefore forbids readiness terms
 * at those files without forbidding optional reads of the shared contract, and
 * names the two sites here so a reviewer sees them rather than reading a silent
 * pass.
 */

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);

const pathOf = (relativePath: string): string =>
  posix.join(SRC_DIRECTORY, relativePath);

const sourceOf = (relativePath: string): string =>
  readFileSync(pathOf(relativePath), 'utf8');

const isSpecFile = (relativePath: string): boolean =>
  /\.spec\.tsx?$/u.test(relativePath);

/** Every production source file under `apps/web/src`, relative to `src`. */
const productionFiles = (): string[] =>
  globSync('**/*.{ts,tsx}', { cwd: SRC_DIRECTORY })
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => !isSpecFile(entry))
    .sort();

/**
 * A source with its comments removed. Block comments go first (which also
 * empties every `{/* … *\/}` JSX comment), then line comments — skipping `//`
 * that follows a `:`, so a `http://` inside a string is not read as one.
 */
const codeOf = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(?<keep>^|[^:])\/\/[^\n]*/gu, '$<keep>');

const codeAt = (relativePath: string): string => codeOf(sourceOf(relativePath));

// ---------------------------------------------------------------------------
// 1. The named files hold no readiness branch, no `Spinner` and no removed prop
// ---------------------------------------------------------------------------

/**
 * Every readiness term this change request deleted from a component or a hook
 * contract, forbidden in every file the criteria name. `Skeleton` covers both
 * deleted skeleton components and the inline `Skeleton` block CH-08 removed
 * from `WorkspacePermissionsTab`.
 */
const READINESS_TERMS = [
  'isLoading',
  'isFetching',
  'isReady',
  'isRefreshing',
  'Spinner',
  'Skeleton',
] as const;

/**
 * The files CR-AC-05 – CR-AC-09 and CR-AC-11 name, each with the props CH-07 –
 * CH-11 removed from it beyond the shared terms above. The extra terms are
 * named per file so a failure says which prop came back rather than only that
 * something did.
 */
const READINESS_FREE_FILES: {
  criterion: string;
  extraTerms?: readonly string[];
  path: string;
}[] = [
  // CR-AC-05 (CH-05, CH-13) — the destination's composition root.
  {
    criterion: 'CR-AC-05',
    path: 'modules/workspace/components/WorkspaceAdministration.tsx',
  },
  // CR-AC-05's "And" clause, applied at the CH-14 call site.
  {
    criterion: 'CR-AC-05',
    path: 'modules/workspace/components/workspace-administration/warehouses/WarehousesTab.tsx',
  },
  // CR-AC-06 (CH-06) — the access page's denial branch, and nothing above it.
  { criterion: 'CR-AC-06', path: 'modules/access/page.tsx' },
  // CR-AC-07 (CH-07, CH-14) — the shared card and its three callers.
  {
    criterion: 'CR-AC-07',
    extraTerms: ['loading', 'loadingLabel', 'DatasetSkeleton'],
    path: 'shared/components/DatasetCard.tsx',
  },
  {
    criterion: 'CR-AC-07',
    extraTerms: ['loading', 'loadingLabel'],
    path: 'modules/access/components/access-workspace/components/members/MembersDatasetCard.tsx',
  },
  {
    criterion: 'CR-AC-07',
    extraTerms: ['loading', 'loadingLabel'],
    path: 'modules/access/components/access-workspace/components/roles/RolesDatasetCard.tsx',
  },
  {
    criterion: 'CR-AC-07',
    extraTerms: ['loading', 'loadingLabel'],
    path: 'modules/access/components/access-workspace/components/permissions/PermissionsTab.tsx',
  },
  // CR-AC-08 (CH-08, CH-14) — the four skeleton surfaces and the five branches.
  {
    criterion: 'CR-AC-08',
    path: 'modules/access/components/workspace-administration/permissions/WorkspacePermissionsTab.tsx',
  },
  {
    criterion: 'CR-AC-08',
    path: 'modules/access/components/workspace-administration/roles/WorkspaceRolesTab.tsx',
  },
  {
    criterion: 'CR-AC-08',
    path: 'modules/access/components/workspace-administration/members/WorkspaceMembersTab.tsx',
  },
  {
    criterion: 'CR-AC-08',
    path: 'modules/access/components/workspace-administration/members/WorkspaceMemberList.tsx',
  },
  {
    criterion: 'CR-AC-08',
    path: 'modules/workspace/components/workspace-administration/warehouses/WarehouseList.tsx',
  },
  // CR-AC-09 (CH-09) — the five contract files.
  { criterion: 'CR-AC-09', path: 'modules/access/utils/access-dataset.ts' },
  { criterion: 'CR-AC-09', path: 'shared/hooks/queries/usePermissions.ts' },
  {
    criterion: 'CR-AC-09',
    path: 'shared/hooks/queries/useWorkspacePermissions.ts',
  },
  {
    criterion: 'CR-AC-09',
    path: 'modules/access/hooks/queries/useWorkspaceRoles.ts',
  },
  {
    criterion: 'CR-AC-09',
    path: 'modules/access/hooks/queries/useWorkspacePermissionCatalogue.ts',
  },
  // CR-AC-11 (CH-11) — the member list and the directory above it.
  {
    criterion: 'CR-AC-11',
    path: 'modules/access/components/access-workspace/components/members/MemberDirectory.tsx',
  },
  {
    criterion: 'CR-AC-11',
    path: 'modules/access/components/access-workspace/components/members/MemberList.tsx',
  },
];

/** The readiness terms one named file still contains, in code, sorted. */
const readinessTermsIn = (file: {
  extraTerms?: readonly string[];
  path: string;
}): string[] => {
  const code = codeAt(file.path);

  return [...READINESS_TERMS, ...(file.extraTerms ?? [])]
    .filter((term) => new RegExp(`\\b${term}\\b`, 'u').test(code))
    .sort();
};

describe('readiness removal — the files CR-AC-05 – CR-AC-09 and CR-AC-11 name', () => {
  it.each(READINESS_FREE_FILES)(
    '$path holds no readiness branch, no Spinner and no removed prop ($criterion)',
    (file) => {
      expect({ [file.path]: readinessTermsIn(file) }).toStrictEqual({
        [file.path]: [],
      });
    },
  );

  // The other half of the bound. Deleting the readiness arms must leave the
  // permission and error arms these criteria explicitly preserve, so each is
  // asserted present rather than merely not-forbidden.
  it('keeps WorkspaceAdministration returning ReactElement, with no context guard (CR-AC-05)', () => {
    const code = codeAt(
      'modules/workspace/components/WorkspaceAdministration.tsx',
    );

    expect(code).toContain('export const WorkspaceAdministration = ()');
    expect(code).toContain('useWorkspaceAdministrationContext()');
    expect(code).not.toMatch(/ReactElement\s*\|\s*null/u);
    expect(code).not.toMatch(/if\s*\(!workspaceContext\)/u);
  });

  it("keeps the access page's denial branch unchanged (CR-AC-06)", () => {
    expect(codeAt('modules/access/page.tsx')).toContain(
      'if (!access || permissionIds.length === 0)',
    );
  });

  it('keeps DatasetCard declaring error and errorLabel (CR-AC-07, CR-AC-15)', () => {
    const code = codeAt('shared/components/DatasetCard.tsx');

    expect(code).toContain('error: boolean;');
    expect(code).toContain('errorLabel: string;');
  });

  it('computes empty as items.length === 0 at all three DatasetCard callers (CR-AC-07)', () => {
    const callers = [
      'modules/access/components/access-workspace/components/members/MembersDatasetCard.tsx',
      'modules/access/components/access-workspace/components/roles/RolesDatasetCard.tsx',
      'modules/access/components/access-workspace/components/permissions/PermissionsTab.tsx',
    ];

    expect(
      Object.fromEntries(
        callers.map((caller) => [
          caller,
          /empty=\{[A-Za-z.]+\.items\.length === 0\}/u.test(codeAt(caller)),
        ]),
      ),
    ).toStrictEqual(
      Object.fromEntries(callers.map((caller) => [caller, true])),
    );
  });

  it('narrows MemberListStatus to exactly three states (CR-AC-08)', () => {
    expect(
      codeAt(
        'modules/access/components/access-workspace/components/members/MemberList.tsx',
      ),
    ).toContain("type MemberListStatus = 'empty' | 'ready' | 'searchEmpty';");
  });

  /**
   * The lead's adjudication, pinned so it cannot be "fixed" into a defect.
   * `useWorkspaceMembers` / `useWorkspaceUsers` are not among CH-09's five
   * contract files and still answer `T[] | undefined`. After the loader lands,
   * `undefined` is reachable only for an actor lacking
   * `WORKSPACE_MEMBERS:WATCH`, whose query is skipped — so this is the
   * *permission* arm CR-AC-08 preserves, not a readiness arm, and it renders
   * no skeleton, no spinner and no waiting copy. `?? []` here would be the
   * actual defect: it would tell an actor who merely may not read the members
   * that the Workspace has none (CR-RG-05).
   */
  it('resolves the WorkspaceMembersTab panes by nullish arm, never by ?? [] (CR-AC-08, CR-RG-05)', () => {
    const code = codeAt(
      'modules/access/components/workspace-administration/members/WorkspaceMembersTab.tsx',
    );

    expect(code).toContain('!members ? null :');
    expect(code).toContain('!users ? null :');
    expect(code).not.toContain('?? []');
  });

  it('carries the unresolved actor by type rather than by a default (CR-AC-11, CR-RG-01)', () => {
    const list = codeAt(
      'modules/access/components/access-workspace/components/members/MemberList.tsx',
    );
    const directory = codeAt(
      'modules/access/components/access-workspace/components/members/MemberDirectory.tsx',
    );

    expect(list).toContain('actorUserId: string | undefined;');
    expect(directory).toContain('actorUserId={actor?.id}');
    expect(directory).not.toMatch(/actorUserId=\{[^}]*\?\?/u);
  });
});

// -------------------------------------------------------------------------
// 2. The two skeleton files do not exist
// -------------------------------------------------------------------------

describe('readiness removal — the deleted skeleton surfaces (CR-AC-08)', () => {
  /** `sad.md` §5.3's deleted-file list, verbatim. */
  const DELETED_SKELETON_FILES = [
    'modules/access/components/workspace-administration/WorkspaceListSkeleton.tsx',
    'modules/workspace/components/workspace-administration/warehouses/WarehouseListSkeleton.tsx',
  ] as const;

  it('deletes both skeleton components', () => {
    expect(
      DELETED_SKELETON_FILES.filter((file) => existsSync(pathOf(file))),
    ).toStrictEqual([]);
  });

  it('leaves no production file naming either of them', () => {
    const naming = productionFiles().filter((file) =>
      /\b(?:WorkspaceListSkeleton|WarehouseListSkeleton)\b/u.test(codeAt(file)),
    );

    expect(naming).toStrictEqual([]);
  });

  /**
   * CR-AC-08's boundary clause. `warehouse-administration-split.spec.ts` and
   * `WorkspaceRolesTab.spec.tsx` deliberately still *name*
   * `WarehouseListSkeleton` / `WorkspaceListSkeleton` — as the file they pin
   * as deleted — so they are excluded here; the three declarations below are
   * the ones that must no longer list a file that is gone.
   */
  it('leaves the boundary declarations naming no deleted file', () => {
    const declarations = [
      'test/module-boundaries/module-surface.ts',
      'test/warehouses-tab-case-inventory/warehouses-tab-case-inventory.spec.ts',
      'shared/layouts/Sidebar.spec.tsx',
    ];

    expect(
      declarations.filter((file) => /Skeleton/u.test(sourceOf(file))),
    ).toStrictEqual([]);
  });
});

// -------------------------------------------------------------------------
// 3. The four routes carry the `sad.md` §5.1 declarations
// -------------------------------------------------------------------------

describe('readiness removal — the route declarations (CR-AC-13, CR-AC-02, CR-AC-16)', () => {
  type RouteDeclaration = {
    errorComponent: string | null;
    loader: string | null;
    pendingComponent: string | null;
    pendingMinMs: string | null;
    pendingMs: string | null;
    wrapInSuspense: string | null;
  };

  const valueOf = (code: string, option: string): string | null =>
    new RegExp(`\\b${option}:\\s*([A-Za-z0-9_]+)`, 'u').exec(code)?.[1] ?? null;

  const declarationOf = (relativePath: string): RouteDeclaration => {
    const code = codeAt(relativePath);

    return {
      errorComponent: valueOf(code, 'errorComponent'),
      loader: valueOf(code, 'loader'),
      pendingComponent: valueOf(code, 'pendingComponent'),
      pendingMinMs: valueOf(code, 'pendingMinMs'),
      pendingMs: valueOf(code, 'pendingMs'),
      wrapInSuspense: valueOf(code, 'wrapInSuspense'),
    };
  };

  /**
   * `sad.md` §5.1's table, transcribed. `null` is "the option is not
   * declared", which is what the table's "none" and "default" columns mean.
   *
   * `accessRoute`'s `wrapInSuspense: false` sits beside a `pendingComponent`
   * the route never renders: the declaration registers the router's commit
   * timer, and suppressing the route's own Suspense boundary is what makes
   * one `RoutePendingState` span both windows (ADR 0002). Deleting either
   * line breaks a different criterion, so both are pinned here as well as
   * behaviourally in `test/route-readiness/` (CR-AC-13).
   */
  const ROUTE_DECLARATIONS: Record<string, RouteDeclaration> = {
    'modules/home/route.tsx': {
      errorComponent: 'RouteErrorState',
      loader: null,
      pendingComponent: 'RoutePendingState',
      pendingMinMs: '0',
      pendingMs: '0',
      wrapInSuspense: null,
    },
    'modules/workspace/route.tsx': {
      errorComponent: 'RouteErrorState',
      loader: 'loadWorkspaceAdministration',
      pendingComponent: 'RoutePendingState',
      pendingMinMs: '0',
      pendingMs: '0',
      wrapInSuspense: null,
    },
    'routes/warehouse.route.tsx': {
      errorComponent: 'RouteErrorState',
      loader: null,
      pendingComponent: 'RoutePendingState',
      pendingMinMs: '0',
      pendingMs: '150',
      wrapInSuspense: null,
    },
    'modules/access/route.tsx': {
      errorComponent: 'RouteErrorState',
      loader: 'loadAccessSurface',
      pendingComponent: 'RoutePendingState',
      pendingMinMs: '0',
      pendingMs: '150',
      wrapInSuspense: 'false',
    },
  };

  it('realizes the sad.md §5.1 declarations on all four routes', () => {
    expect(
      Object.fromEntries(
        Object.keys(ROUTE_DECLARATIONS).map((route) => [
          route,
          declarationOf(route),
        ]),
      ),
    ).toStrictEqual(ROUTE_DECLARATIONS);
  });

  // -----------------------------------------------------------------------
  // 6. `warehouseDashboardRoute` gained no loader
  // -----------------------------------------------------------------------

  /**
   * CR-AC-15's dashboard row. `WarehousePage` renders `DesignSystemExample`
   * and reads no dataset, so the parent's `pendingComponent` is the whole of
   * its readiness — §5.1 gives this route "none" in every column.
   */
  it('leaves warehouseDashboardRoute with no loader and no readiness contract of its own (CR-AC-15)', () => {
    expect(declarationOf('modules/warehouse/route.tsx')).toStrictEqual({
      errorComponent: null,
      loader: null,
      pendingComponent: null,
      pendingMinMs: null,
      pendingMs: null,
      wrapInSuspense: null,
    });
  });
});

// -------------------------------------------------------------------------
// 4 + 5. `isError` survives; the identifiers stay legal at four sites only
// -------------------------------------------------------------------------

describe('readiness removal — the surviving error term and the scope bound (CR-AC-09, CR-AC-15)', () => {
  it('keeps AccessDataset declaring isError', () => {
    // Read the `AccessDataset` declaration specifically. The private
    // `QueryResult` helper in the same file also declares `isError`, so a
    // whole-file `toContain` would keep passing after the exported contract
    // had lost the field — which is the deletion this case exists to catch.
    const declaration = /export type AccessDataset<TItem> = \{(?<body>[^}]*)\}/u
      .exec(codeAt('modules/access/utils/access-dataset.ts'))
      ?.groups?.body?.trim();

    expect(declaration).toBe('items: TItem[];\n  isError: boolean;');
  });

  it('keeps both collapsed tab guards reading their dataset error arm', () => {
    const roles = codeAt(
      'modules/access/components/access-workspace/components/roles/RolesTab.tsx',
    );
    const members = codeAt(
      'modules/access/components/access-workspace/components/members/MembersTab.tsx',
    );

    expect(roles).toContain('if (!canAdministerRoles || roles.isError)');
    expect(members).toContain('if (!canReadMembers || members.isError)');
  });

  /**
   * CR-AC-09's scope bound, as a bound. The criterion does not forbid
   * `isLoading` / `isFetching` / `isReady` outright — `sad.md` §5.6 leaves
   * them legal at four sites, and this map is that list resolved to the files
   * that realize it. A hit anywhere else fails; a pinned site that stops
   * naming its identifier fails too, because the map is compared whole.
   *
   * 1. **RTK Query's own query results** and 4. **the CR-RG-06 components**
   *    coincide in production at one file: `SignOutButton` destructures
   *    `isLoading` from `useSignOutMutation()` to drive its own submit state.
   *    The other seven CR-RG-06 components express the same state as
   *    `isPending`, asserted separately below.
   * 3. **`mutation-feedback.middleware.ts`** reads the flag off the mutation
   *    lifecycle it subscribes to.
   *
   * 2. **`router.state.isLoading`** is TanStack Router's own field and is
   *    named only from `modules/home/route.spec.tsx`, outside this scan's
   *    production scope — so it is asserted by name in the next case rather
   *    than through this map.
   */
  const ALLOWED_READINESS_SITES: Record<string, string[]> = {
    'modules/auth/sign-out/components/SignOutButton.tsx': ['isLoading'],
    'store/middleware/mutation-feedback.middleware.ts': ['isLoading'],
  };

  it('leaves isLoading/isFetching/isReady in production at the allowed sites only', () => {
    const scanned = ['isLoading', 'isFetching', 'isReady'] as const;
    const found = productionFiles()
      .map((file) => {
        const code = codeAt(file);

        return [
          file,
          scanned.filter((term) => new RegExp(`\\b${term}\\b`, 'u').test(code)),
        ] as const;
      })
      .filter(([, terms]) => terms.length > 0);

    expect(Object.fromEntries(found)).toStrictEqual(ALLOWED_READINESS_SITES);
  });

  it("keeps TanStack Router's own router.state.isLoading site (CR-AC-09 site 2)", () => {
    expect(codeAt('modules/home/route.spec.tsx')).toContain(
      'router.state.isLoading',
    );
  });

  /**
   * Site 4's remaining seven. CR-RG-06 keeps action feedback out of this
   * change entirely, so each still shows a submit state — under the name
   * `isPending`, which is why they do not appear in the map above.
   */
  it('keeps every CR-RG-06 component showing its own submit state (site 4)', () => {
    const components = [
      'modules/access/components/access-workspace/components/roles/RoleEditor.tsx',
      'modules/access/components/workspace-administration/roles/WorkspaceRoleEditor.tsx',
      'modules/auth/login/components/LoginForm.tsx',
      'modules/auth/sign-out/components/SignOutButton.tsx',
      'modules/auth/sign-up/components/SignUpForm.tsx',
      'modules/workspace/components/workspace-administration/warehouses/WarehouseNameForm.tsx',
      'shared/components/ConfirmAlertDialog.tsx',
      'shared/components/FormModalDialog.tsx',
    ];

    expect(
      components.filter((file) => !/isPending=\{/u.test(codeAt(file))),
    ).toStrictEqual([]);
  });
});

// -------------------------------------------------------------------------
// 7. No capability boolean was introduced
// -------------------------------------------------------------------------

describe('readiness removal — declarative permission gating is unchanged (CR-RG-07)', () => {
  /**
   * ADR `19-08-2026-declarative-permission-gates.md` § Decision 3: "`canX` as
   * a **prop** is what this decision removes; `canX` as a local read whose
   * consumer is in the same file is what it keeps." So the two mechanical
   * questions are whether any capability crosses a component boundary, and
   * whether a new one was derived at all.
   */
  it('declares no capability prop and passes none through JSX', () => {
    const offenders = productionFiles().filter((file) => {
      const code = codeAt(file);

      return (
        /\bcan[A-Z]\w*\s*\??:\s*(?:boolean|Readonly<boolean>)/u.test(code) ||
        /\bcan[A-Z]\w*=\{/u.test(code)
      );
    });

    expect(offenders).toStrictEqual([]);
  });

  /**
   * Every `can…` local that exists, with the ADR § Decision 3 category that
   * makes it legitimate. Deriving one anywhere else — the `canDoThing` the
   * ADR forbids — fails this case, and so does removing one, which is what
   * makes it a bound rather than a ban.
   *
   * - query `skip`: `useWorkspaceMembers`, `useWorkspacePermissionCatalogue`,
   *   `useWorkspaceRoles`, `useWorkspaceUsers`, `WarehousesTab`
   * - `isDisabled` / `disabledKeys`: `RoleEditor`, `WorkspaceRoleEditor`,
   *   `WarehouseSwitcher`
   * - the choice between two whole surfaces: `RolesTab`, `MembersTab`
   * - not a Permission at all, so outside the ADR: `WarehouseRow`'s
   *   `canEnter` is membership plus record state (§ Consequences, last row)
   */
  const CAPABILITY_LOCALS: Record<string, string[]> = {
    'modules/access/components/access-workspace/components/members/MembersTab.tsx':
      ['canReadMembers'],
    'modules/access/components/access-workspace/components/roles/RoleEditor.tsx':
      ['canUpdate'],
    'modules/access/components/access-workspace/components/roles/RolesTab.tsx':
      ['canAdministerRoles'],
    'modules/access/components/workspace-administration/roles/WorkspaceRoleEditor.tsx':
      ['canUpdate'],
    'modules/access/hooks/queries/useWorkspaceMembers.ts': [
      'canWatchWorkspaceMembers',
    ],
    'modules/access/hooks/queries/useWorkspacePermissionCatalogue.ts': [
      'canWatchWorkspaceRoles',
    ],
    'modules/access/hooks/queries/useWorkspaceRoles.ts': [
      'canWatchWorkspaceRoles',
    ],
    'modules/access/hooks/queries/useWorkspaceUsers.ts': [
      'canWatchWorkspaceMembers',
    ],
    'modules/workspace/components/workspace-administration/warehouses/WarehouseRow.tsx':
      ['canEnter'],
    'modules/workspace/components/workspace-administration/warehouses/WarehousesTab.tsx':
      ['canReadPeople'],
    'shared/layouts/WarehouseSwitcher.tsx': ['canEnterWorkspace'],
  };

  it('derives no capability boolean beyond the ones ADR §3 already licenses', () => {
    const declared = productionFiles()
      .map(
        (file) =>
          [
            file,
            [...codeAt(file).matchAll(/\bconst (?<local>can[A-Z]\w*)\b/gu)]
              .map((match) => match.groups?.local ?? '')
              .sort(),
          ] as const,
      )
      .filter(([, locals]) => locals.length > 0);

    expect(Object.fromEntries(declared)).toStrictEqual(CAPABILITY_LOCALS);
  });

  /**
   * CR-RG-05 names `PermissionsTab` specifically: it reads no Permission at
   * all today and must not gain one, because adding a capability boolean to a
   * file that has none is exactly what CR-RG-07 and `spec.md` §3 forbid.
   */
  it('leaves PermissionsTab reading no Permission at all (CR-RG-05)', () => {
    const code = codeAt(
      'modules/access/components/access-workspace/components/permissions/PermissionsTab.tsx',
    );

    expect(code).not.toMatch(/useHasPermission|PermissionId|\bcan[A-Z]/u);
  });

  /**
   * `sad.md` §5.8 retains every gate and descriptor call site unchanged. The
   * count per file is pinned rather than the whole expression, so the gate
   * fails when a control loses its gate or grows a second one, and does not
   * fail when a label is retranslated.
   */
  const GATE_CALL_SITES: Record<string, number> = {
    'modules/access/components/access-workspace/AccessWorkspace.tsx': 3,
    'modules/access/components/access-workspace/components/members/CreateMemberAction.tsx': 4,
    'modules/access/components/access-workspace/components/members/MemberRow.tsx': 3,
    'modules/access/components/access-workspace/components/roles/CreateRoleAction.tsx': 4,
    'modules/access/components/access-workspace/components/roles/MemberAssignmentList.tsx': 4,
    'modules/access/components/access-workspace/components/roles/RoleEditor.tsx': 4,
    'modules/access/components/access-workspace/components/roles/TransferManagerAction.tsx': 4,
    'modules/access/components/workspace-administration/members/AddWorkspaceMemberAction.tsx': 4,
    'modules/access/components/workspace-administration/members/WorkspaceMemberRow.tsx': 4,
    'modules/access/components/workspace-administration/roles/CreateWorkspaceRoleAction.tsx': 4,
    'modules/access/components/workspace-administration/roles/DeleteWorkspaceRoleAction.tsx': 4,
    'modules/customer-order/components/demand-directory/components/RecordDemandAction.tsx': 4,
    'modules/customer-order/hooks/projections/useCustomerOrderActions.ts': 3,
    'modules/item/components/item-directory/components/CreateItemAction.tsx': 4,
    'modules/item/hooks/projections/useItemActions.ts': 3,
    'modules/workspace/components/WorkspaceAdministration.tsx': 3,
    'modules/workspace/components/workspace-administration/NameWorkspaceAction.tsx': 4,
    'modules/workspace/components/workspace-administration/warehouses/AddWarehouseAction.tsx': 4,
    'modules/workspace/components/workspace-administration/warehouses/GiveWarehouseAccessAction.tsx': 4,
    'modules/workspace/components/workspace-administration/warehouses/WarehouseLifecycleActions.tsx': 4,
    'modules/workspace/components/workspace-administration/warehouses/WarehouseNameForm.tsx': 4,
    'modules/workspace/components/workspace-administration/warehouses/WarehousePersonRow.tsx': 4,
    'shared/components/WarehousePermissionGate.tsx': 1,
    'shared/components/WorkspacePermissionGate.tsx': 1,
    'shared/hooks/projections/usePermittedItems.ts': 1,
    'shared/hooks/projections/useWorkspacePermittedItems.ts': 1,
    'shared/layouts/Sidebar.tsx': 14,
  };

  it('keeps every gate and descriptor call site', () => {
    const sites = productionFiles()
      .map(
        (file) =>
          [
            file,
            (
              codeAt(file).match(
                /\b(?:WarehousePermissionGate|WorkspacePermissionGate|usePermittedItems|useWorkspacePermittedItems)\b/gu,
              ) ?? []
            ).length,
          ] as const,
      )
      .filter(([, count]) => count > 0);

    expect(Object.fromEntries(sites)).toStrictEqual(GATE_CALL_SITES);
  });

  /**
   * "The tab sets on `/workspace` and the access surface keep their order,
   * count and admission rules." Each descriptor's `id` and `permission` are
   * read in source order, so reordering, dropping or re-gating a tab fails.
   */
  const descriptorsOf = (relativePath: string): [string, string][] =>
    [
      ...codeAt(relativePath).matchAll(
        /id:\s*'(?<id>[^']+)'[\s\S]*?permission:\s*(?<permission>\[[^\]]*\]|[A-Za-z0-9_.]+)/gu,
      ),
    ].map((match) => [
      match.groups?.id ?? '',
      (match.groups?.permission ?? '').replace(/\s+/gu, ' '),
    ]);

  it('keeps the /workspace tab set in order, count and admission rule', () => {
    expect(
      descriptorsOf('modules/workspace/components/WorkspaceAdministration.tsx'),
    ).toStrictEqual([
      ['warehouses', 'WorkspacePermissionId.WAREHOUSES_WATCH'],
      ['workspaceRoles', 'WorkspacePermissionId.WORKSPACE_ROLES_WATCH'],
      ['members', 'WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH'],
      ['permissions', 'WorkspacePermissionId.WORKSPACE_ROLES_WATCH'],
    ]);
  });

  it('keeps the access tab set in order, count and admission rule', () => {
    expect(
      descriptorsOf(
        'modules/access/components/access-workspace/AccessWorkspace.tsx',
      ),
    ).toStrictEqual([
      ['roles', 'rolesTabPermissions'],
      ['members', '[PermissionId.USERS_WATCH]'],
      ['permissions', '[PermissionId.ROLES_WATCH]'],
    ]);
  });
});

// -------------------------------------------------------------------------
// 8. The header comment states why no single file owns it
// -------------------------------------------------------------------------

describe('readiness removal — the gate documents its own placement', () => {
  /**
   * `placing-web-tests.md` §3: "Say in the file's header comment why no owner
   * exists. A reader who finds a spec away from its subject should not have
   * to reconstruct the reason." Asserted rather than assumed, because a
   * dedicated `src/test/` directory with no such comment is the failure mode
   * that guide exists to prevent.
   */
  it('opens with a comment saying why no single file owns it', () => {
    const header = sourceOf(
      'test/readiness-removal/readiness-removal.spec.ts',
    ).split('\nconst SRC_DIRECTORY')[0];

    expect(header).toContain('Why no single file owns it');
    expect(header).toContain('placing-web-tests.md');
  });
});
