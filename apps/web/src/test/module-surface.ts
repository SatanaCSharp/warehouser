/**
 * The declared public surface of every `apps/web` module.
 *
 * A file may reach into `modules/<x>/` only through the entries listed here —
 * sibling modules and the composition layer (`router.ts`, `store/index.ts`,
 * `guards/`, `shared/`, `routes/`, `test/`) alike. The composition layer
 * differs in **reach**, being permitted to address any module's surface rather
 * than only a sibling's, not in **exemption**: it may not reach past a surface
 * into a module's internals. See
 * `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` §"Public surface"
 * and `docs/system/guides/adding-a-web-module.md` §2.
 *
 * This is an **enumerated declaration read as data**, not a set of per-module
 * `index.ts` barrels: a barrel is a real module with real imports, so
 * `router.ts` importing every module's barrel would pull each module's `page`
 * into the router chunk and defeat the lazy `import('./page')` boundary. See
 * `docs/change-requests/modules-level-refactor/adr/0001-enumerated-web-module-surface-declaration.md`.
 *
 * Every entry below is the rule's **input**, not an exception: an exception
 * would be an import permitted *despite* violating the rule, and there are
 * none. Each entry is required by a real importer today — delete any one and
 * `modules/module-boundaries.spec.ts` fails on the importer named beside it.
 *
 * It lives under `src/test/` because it is data consumed only by a spec, and
 * `docs/system/frontend-architecture.md` §"Testing" reserves that directory for
 * cross-cutting test support.
 *
 * Specifiers are written the way the importers write them — `baseUrl: ./src`
 * bare specifiers, without a file extension. The spec normalizes relative
 * imports to the same form before matching.
 */
export const MODULE_SURFACE = {
  access: [
    // router.ts
    'modules/access/route',
    // modules/workspace/components/WorkspaceAdministration.tsx
    'modules/access/components/workspace-administration/members/WorkspaceMembersTab',
    // modules/workspace/components/WorkspaceAdministration.tsx
    'modules/access/components/workspace-administration/permissions/WorkspacePermissionsTab',
    // modules/workspace/components/WorkspaceAdministration.tsx
    'modules/access/components/workspace-administration/roles/WorkspaceRolesTab',
  ],
  auth: [
    // router.ts
    'modules/auth/login/route',
    // router.ts
    'modules/auth/sign-up/route',
    // guards/auth.guard.ts, guards/anonymous-user.guard.ts
    'modules/auth/session/session',
    // shared/layouts/RootLayout.tsx
    'modules/auth/sign-out/components/SignOutButton',
    // guards/auth.guard.ts, guards/anonymous-user.guard.ts, shared/layouts/RootLayout.tsx,
    // and the three selectCurrentUser call sites in modules/access and modules/warehouse
    'modules/auth/store/auth.selectors',
    // store/index.ts, test/access-fixtures.ts, test/workspace-fixtures.ts
    'modules/auth/store/auth.slice',
  ],
  home: [
    // router.ts
    'modules/home/route',
  ],
  warehouse: [
    // router.ts
    'modules/warehouse/route',
    // modules/workspace/components/WorkspaceAdministration.tsx
    'modules/warehouse/components/workspace-administration/warehouses/WarehousesTab',
    // shared/layouts/WarehouseLayout.tsx
    'modules/warehouse/hooks/useRecordWarehouseEntry',
  ],
  workspace: [
    // router.ts
    'modules/workspace/route',
  ],
} as const satisfies Record<string, readonly string[]>;

/**
 * The exact file manifest of `modules/workspace`, per CR-AC-03.
 *
 * The mechanical checks — the surface declaration, the import graph and this
 * manifest — cannot decide *whose invariants does this file enforce?*; that
 * stays a human review test. The manifest exists to force the answer to be
 * given rather than skipped: any file added to `modules/workspace` fails until
 * someone deliberately amends this list, which is the point.
 */
export const WORKSPACE_MODULE_MANIFEST = [
  'components/WorkspaceAdministration.spec.tsx',
  'components/WorkspaceAdministration.tsx',
  'components/workspace-administration/NameWorkspaceAction.tsx',
  'components/workspace-administration/NameWorkspaceDialog.tsx',
  'hooks/useRenameWorkspace.ts',
  'page.tsx',
  'route.tsx',
  'schemas/name-workspace-form.schema.ts',
] as const;

/**
 * Test scaffolding that lives under `modules/` without being a module.
 *
 * `modules/fixtures/` holds the negative fixtures the boundary spec asserts
 * against, following the `tests/access/fixtures/` precedent. It is excluded
 * from the scanned tree and from the module list, and the spec pins that it
 * contains nothing but `*.fixture.ts` files so production code cannot hide
 * there.
 */
export const MODULES_FIXTURES_DIRECTORY = 'fixtures';
