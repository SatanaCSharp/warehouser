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
 * (Superseded; that rule is preserved verbatim and narrowed by
 * `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`) and
 * `docs/system/guides/adding-a-web-module.md` §2.
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
    // and the three selectCurrentUser call sites in modules/access and modules/workspace
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
    // shared/layouts/WarehouseLayout.tsx
    'modules/warehouse/hooks/useRecordWarehouseEntry',
  ],
  workspace: [
    // router.ts
    'modules/workspace/route',
  ],
} as const satisfies Record<string, readonly string[]>;

/**
 * The exact file manifest of `modules/workspace`, per the criterion that
 * introduced it (modules-level-refactor CR-AC-03).
 *
 * The mechanical checks — the surface declaration, the import graph and this
 * manifest — cannot decide *whose invariants does this file enforce?*; that
 * stays a human review test. The manifest exists to force the answer to be
 * given rather than skipped: any file added to `modules/workspace` fails until
 * someone deliberately amends this list, which is the point.
 */
export const WORKSPACE_MODULE_MANIFEST = [
  'api/warehouse-api.ts',
  'components/WorkspaceAdministration.spec.tsx',
  'components/WorkspaceAdministration.tsx',
  'components/workspace-administration/NameWorkspaceAction.tsx',
  'components/workspace-administration/NameWorkspaceDialog.tsx',
  'components/workspace-administration/warehouses/AddWarehouseAction.tsx',
  'components/workspace-administration/warehouses/AddWarehouseDialog.tsx',
  'components/workspace-administration/warehouses/ArchiveWarehouseDialog.tsx',
  'components/workspace-administration/warehouses/GiveWarehouseAccessAction.tsx',
  'components/workspace-administration/warehouses/GiveWarehouseAccessDialog.tsx',
  'components/workspace-administration/warehouses/WarehouseDetailPane.tsx',
  'components/workspace-administration/warehouses/WarehouseEnterLink.tsx',
  'components/workspace-administration/warehouses/WarehouseLifecycleActions.tsx',
  'components/workspace-administration/warehouses/WarehouseList.spec.tsx',
  'components/workspace-administration/warehouses/WarehouseList.tsx',
  'components/workspace-administration/warehouses/WarehouseListSkeleton.tsx',
  'components/workspace-administration/warehouses/WarehouseNameForm.tsx',
  'components/workspace-administration/warehouses/WarehousePeopleList.spec.tsx',
  'components/workspace-administration/warehouses/WarehousePeopleList.tsx',
  'components/workspace-administration/warehouses/WarehousePersonRow.tsx',
  'components/workspace-administration/warehouses/WarehouseRow.spec.tsx',
  'components/workspace-administration/warehouses/WarehouseRow.tsx',
  'components/workspace-administration/warehouses/WarehouseSearchField.tsx',
  'components/workspace-administration/warehouses/WarehousesTab.spec.tsx',
  'components/workspace-administration/warehouses/WarehousesTab.tsx',
  'components/workspace-administration/warehouses/WithdrawWarehouseAccessDialog.tsx',
  'hooks/useAssignWarehouseMembership.ts',
  'hooks/useCreateWarehouse.ts',
  'hooks/useRenameWarehouse.ts',
  'hooks/useRenameWorkspace.ts',
  'hooks/useRevokeWarehouseMembership.ts',
  'hooks/useSetWarehouseArchival.ts',
  'hooks/warehouse-name-validation.spec.ts',
  'hooks/warehouse-name-validation.ts',
  'page.tsx',
  'route.tsx',
  'schemas/name-workspace-form.schema.ts',
  'schemas/warehouse-name-form.schema.ts',
] as const;

/**
 * The exact file manifest of `modules/warehouse`, per CR-AC-01.
 *
 * The module keeps the in-Warehouse destination and nothing else. Both
 * colocated specs are retained — neither deleted nor relocated — so a reader
 * can tell "the administration slice left" from "the module was dissolved".
 */
export const WAREHOUSE_MODULE_MANIFEST = [
  'components/DesignSystemExample.spec.tsx',
  'components/DesignSystemExample.tsx',
  'hooks/useRecordWarehouseEntry.spec.tsx',
  'hooks/useRecordWarehouseEntry.ts',
  'page.tsx',
  'route.tsx',
] as const;

/**
 * The 22 files of the Warehouse administration slice, relative to their module
 * root.
 *
 * The move preserves each file's module-relative path, so one list decides both
 * halves of CR-AC-01: every entry resolves under `modules/workspace/` and none
 * resolves under `modules/warehouse/`.
 */
export const ADMINISTRATION_SLICE_FILES = [
  'api/warehouse-api.ts',
  'components/workspace-administration/warehouses/AddWarehouseAction.tsx',
  'components/workspace-administration/warehouses/AddWarehouseDialog.tsx',
  'components/workspace-administration/warehouses/ArchiveWarehouseDialog.tsx',
  'components/workspace-administration/warehouses/GiveWarehouseAccessAction.tsx',
  'components/workspace-administration/warehouses/GiveWarehouseAccessDialog.tsx',
  'components/workspace-administration/warehouses/WarehouseDetailPane.tsx',
  'components/workspace-administration/warehouses/WarehouseLifecycleActions.tsx',
  'components/workspace-administration/warehouses/WarehouseList.tsx',
  'components/workspace-administration/warehouses/WarehouseNameForm.tsx',
  'components/workspace-administration/warehouses/WarehousePeopleList.tsx',
  'components/workspace-administration/warehouses/WarehousesTab.spec.tsx',
  'components/workspace-administration/warehouses/WarehousesTab.tsx',
  'components/workspace-administration/warehouses/WithdrawWarehouseAccessDialog.tsx',
  'hooks/useAssignWarehouseMembership.ts',
  'hooks/useCreateWarehouse.ts',
  'hooks/useRenameWarehouse.ts',
  'hooks/useRevokeWarehouseMembership.ts',
  'hooks/useSetWarehouseArchival.ts',
  'hooks/warehouse-name-validation.spec.ts',
  'hooks/warehouse-name-validation.ts',
  'schemas/warehouse-name-form.schema.ts',
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
