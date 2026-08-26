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
 * `test/module-boundaries/module-boundaries.spec.ts` fails on the importer
 * named beside it.
 *
 * It lives beside `module-boundaries.spec.ts` because it is data consumed only
 * by that spec, and `docs/system/guides/placing-web-tests.md` §4 files
 * single-consumer test support in the consuming spec's own directory.
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
    // modules/workspace/loaders/workspace-administration.loader.ts
    'modules/access/loaders/workspace-administration-datasets.loader',
    // test/loader-permission-parity/loader-permission-parity.spec.ts
    'modules/access/utils/access-permission-sets',
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
  // T17 — the ordering web shell's three destinations (sad.md §5 Web,
  // §8 Naming): each is a flat sibling module whose only surface entry today
  // is the route `router.ts` composes, per the "future in-Warehouse entities
  // become flat top-level sibling modules" consequence recorded in
  // `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`.
  'customer-order': [
    // router.ts
    'modules/customer-order/route',
  ],
  home: [
    // router.ts
    'modules/home/route',
  ],
  item: [
    // router.ts
    'modules/item/route',
    // modules/customer-order/components/demand-directory/components/RecordCustomerOrderDialog.tsx
    'modules/item/components/ItemPicker',
    // modules/customer-order/components/demand-directory/components/RecordCustomerOrderDialog.tsx
    'modules/item/hooks/queries/useItems',
  ],
  'purchase-draft': [
    // router.ts
    'modules/purchase-draft/route',
  ],
  warehouse: [
    // router.ts
    'modules/warehouse/route',
    // shared/layouts/WarehouseLayout.tsx
    'modules/warehouse/hooks/effects/useRecordWarehouseEntry',
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
  // T12 / global-loader CH-05, CH-13 — the route-scoped projection that turns
  // the Workspace context guaranteed by `workspaceRoute.beforeLoad` into a
  // non-optional value, and its colocated spec. It derives from state already
  // loaded and reads and writes nothing, so `hooks/projections/` is its
  // directory (`placing-web-hooks.md` §2). It enforces a Workspace's own
  // invariant — which context the Workspace destination is administering — and
  // is exercised at the Workspace scope, so the default places it here and the
  // scope-of-exercise tiebreak has nothing to break
  // (`docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`).
  'hooks/projections/useWorkspaceAdministrationContext.spec.tsx',
  'hooks/projections/useWorkspaceAdministrationContext.ts',
  // T4 / global-loader CH-03 — `/workspace`'s route loader and its colocated
  // spec. The function holds the dispatches `route.tsx` may not
  // (`frontend-architecture.md` §Route), and `loaders/` is where a
  // module-owned route loader lives (global-loader ADR 0001). Cited by change
  // row rather than by criterion: this file may name no unqualified
  // `CR-AC-0…` identifier, which the predecessor request owns.
  'loaders/workspace-administration.loader.spec.ts',
  'loaders/workspace-administration.loader.ts',
  'page.tsx',
  // T1 / global-loader CR-AC-02 — the colocated spec for the route's pending
  // and error contract, filed beside its subject (`placing-web-tests.md` §1).
  'route.spec.tsx',
  'route.tsx',
  'schemas/name-workspace-form.schema.ts',
  'schemas/warehouse-name-form.schema.ts',
  'utils/warehouse-name-validation.spec.ts',
  'utils/warehouse-name-validation.ts',
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
  'hooks/effects/useRecordWarehouseEntry.spec.tsx',
  'hooks/effects/useRecordWarehouseEntry.ts',
  'page.tsx',
  'route.tsx',
] as const;

/**
 * The 17 files of the Warehouse administration slice, relative to their module
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
  'schemas/warehouse-name-form.schema.ts',
  'utils/warehouse-name-validation.spec.ts',
  'utils/warehouse-name-validation.ts',
] as const;
