---
id: T6
title: 'Move the access surface under the Warehouse layout and read the Warehouse from the address'
layer: 'app'
deps: ['T4']
acs: ['CR-AC-06', 'CR-AC-11', 'CR-AC-21']
source_refs:
  [
    'change.md#CH-03',
    'change.md#CH-04',
    'docs/features/workspaces/spec.md#ac-03-us-02--happy',
  ]
files_hint:
  [
    'apps/web/src/modules/access/route.tsx',
    'apps/web/src/shared/constants/routes.ts',
    'apps/web/src/shared/hooks/usePermissions.ts',
    'apps/web/src/shared/hooks/usePermissions.spec.tsx',
    'apps/web/src/shared/layouts/Sidebar.tsx',
    'apps/web/src/shared/layouts/Sidebar.spec.tsx',
    'apps/web/src/router.ts',
    'apps/web/src/router.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T6 — Move the access surface under the Warehouse layout and read the Warehouse from the address

## Why

This is the change the whole request exists for: the Warehouse a screen operates on stops being
ambient state and becomes the address. [`change.md` §6](../change.md#6-rollout) step 5 requires the
route relocation and the `useCurrentPermissions` change to land **together**, "since neither is
coherent alone". Derives from [spec §CR-AC-06](../spec.md#5-acceptance-criteria),
[§CR-AC-21](../spec.md#5-acceptance-criteria), [sad §4.4](../sad.md#4-solution-strategy) and
[sad §5 Modified](../sad.md#modified).

## What

- `modules/access/route.tsx` — becomes a child of `warehouseRoute` at `ROUTE_SEGMENTS.ACCESS`, with
  **no `beforeLoad`**: the parent already authenticates and resolves entry, and the address
  deliberately carries no capability gate (CR-AC-21;
  [adding a web module](../../../system/guides/adding-a-web-module.md) §3 "do not add a no-op guard").
- `shared/constants/routes.ts` — delete `ACCESS`.
- `shared/hooks/usePermissions.ts` — `useCurrentPermissions` reads `useEnteredWarehouse()` instead of
  `context.effectiveWarehouseId`. Outside a Warehouse view it yields `permissionIds: []` and skips the
  projection query, exactly as it does today for a null selection. `hasPermission` and
  `useHasPermission` are untouched.
- `shared/layouts/Sidebar.tsx` + its spec — re-address the Access link to `ROUTES.WAREHOUSE_ACCESS`
  with the entered `warehouseId`, so the file compiles without `ROUTES.ACCESS`. Context selection
  itself is T10.
- `router.ts` / `router.spec.tsx` — drop the flat `accessRoute` root child, attach it under the
  layout, and update the existing suites' `initialEntries` paths.

## Definition of Done

- [ ] Hook unit test: the projection is requested for the **addressed** Warehouse inside a Warehouse
      view
- [ ] Hook unit test: outside a Warehouse view `permissionIds` is `[]` and **no** projection request
      is issued
- [ ] Hook unit test: changing the stored selection changes nothing about what an already-open
      address shows (CR-AC-06)
- [ ] Route-integration test: `/warehouses/W1/access` and `/warehouses/W2/access` each show that named
      Warehouse's own Roles, Permission catalogue and members, and gate every control by the Role held
      in that named Warehouse alone
- [ ] Route-integration test: a member of W whose Role carries neither `ROLES:WATCH` nor
      `USERS:WATCH` is admitted to W's access address — not refused, not redirected — and the access
      surface reports the information is unavailable with today's copy (CR-AC-21)
- [ ] `ROUTES.ACCESS` no longer exists and no source or test references `/access` as a live route
- [ ] `pnpm --filter @warehouser/web build` and `… test` are green
- [ ] lint + vet clean

## Notes

- **Compile-coupled lane with T4** on `shared/constants/routes.ts` and `router.ts`: removing
  `ROUTES.ACCESS` breaks `Sidebar.tsx`, `modules/access/route.tsx` and the existing specs at compile
  time, so all of them change in this one task.
- **Shared file with T10** — `Sidebar.tsx`. This task does the minimum to keep it compiling and
  correctly addressed; T10 makes the list context-selected. `implement` serializes the two on the
  overlapping `files_hint`.
- Nothing inside `modules/access/**` other than `route.tsx` changes: the surface moves address, not
  shape (sad §5 Retained, design-handoff § Implementation constraints).
- `useAccessCapabilities`, the access dataset hooks, `PermissionGate` and the access page keep their
  current signatures — they already read `warehouseId` from the projection (ADR 0001 § Decision
  outcome). If a consumer needs a new argument, the design has been misread.
