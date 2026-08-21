---
id: T10
title: 'Delete the two skeleton components and the Warehouses-side readiness branches'
layer: 'ui'
deps: ['T7']
acs: ['CR-AC-08', 'CR-RG-08']
source_refs:
  - 'change.md#3-override-map CH-08'
  - 'change.md#3-override-map CH-14'
  - 'sad.md#53-deleted-files'
  - 'sad.md#57-boundary-declarations-to-update'
files_hint:
  - 'apps/web/src/modules/access/components/workspace-administration/WorkspaceListSkeleton.tsx'
  - 'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseListSkeleton.tsx'
  - 'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseList.tsx'
  - 'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseList.spec.tsx'
  - 'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousesTab.tsx'
  - 'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousesTab.spec.tsx'
  - 'apps/web/src/test/module-boundaries/module-surface.ts'
  - 'apps/web/src/test/warehouse-administration-split/warehouse-administration-split.spec.ts'
  - 'apps/web/src/test/warehouses-tab-case-inventory/warehouses-tab-case-inventory.spec.ts'
  - 'apps/web/src/shared/layouts/Sidebar.spec.tsx'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T10 — Delete the two skeleton components and the Warehouses-side readiness branches

## Why

Two of CH-08's four skeleton surfaces are whole files, and both are on
[`sad.md` §5.3](../sad.md#53-deleted-files)'s deletion list. Deleting a file that four boundary
declarations name means amending them in the same commit, or the suite goes red on a missing path.

Derives from [CH-08 and CH-14](../change.md#3-override-map).

## What

- Delete `modules/access/components/workspace-administration/WorkspaceListSkeleton.tsx` and
  `modules/workspace/components/workspace-administration/warehouses/WarehouseListSkeleton.tsx`.
- `WarehouseListProps` declares no `isLoading`; `WarehouseList.tsx:53`'s readiness branch is gone and
  `empty` becomes `items.length === 0`.
- `WarehousesTab`'s derived `isLoading` is gone, together with the `WarehousesTab.tsx:47-51` comment
  declaring the Warehouse-list query first so it is the first network call — the loader's parallel
  dispatch supersedes that ordering intent
  ([`change.md` §9](../change.md#9-open-questions), resolved at `design`).
- Amend the boundary declarations per [`sad.md` §5.7](../sad.md#57-boundary-declarations-to-update):
  `module-surface.ts`, `WORKSPACE_MODULE_MANIFEST`,
  `warehouse-administration-split.spec.ts:40,108,139`,
  `warehouses-tab-case-inventory.spec.ts:137`, and `Sidebar.spec.tsx`.

## Definition of Done

- [ ] Neither skeleton file exists.
- [ ] `WarehouseListProps` declares no `isLoading`, and neither `WarehouseList.tsx:53` nor
      `WarehousesTab` retains a readiness branch or the superseded ordering comment.
- [ ] `module-surface.ts`, `WORKSPACE_MODULE_MANIFEST`, `warehouse-administration-split.spec.ts`,
      `warehouses-tab-case-inventory.spec.ts` and `Sidebar.spec.tsx` name no deleted file and no
      deleted case (CR-AC-08).
- [ ] `warehouses.empty` and `warehouses.noMatches` still render in their own cases (CR-RG-05).
- [ ] `Sidebar.spec.tsx:227,404` still assert the navigation entries are hidden during the loading
      window **without** a skeleton, and still pass (CR-RG-08).
- [ ] `pnpm --filter @warehouser/web lint`, `test` and `build` clean.

## Notes

- `WarehousesTab`'s Warehouse list is the CR-RG-02 row with **no hook skip** — its real gate is the
  tab descriptor's `WAREHOUSES:WATCH`. Removing the readiness branch must not touch that gate.
- Shares a lane with T3, T4 and T12 on `module-surface.ts`.
- `writing-web-components.md` §9 ("delete dead branches") is the guide this task follows rather than
  leaving the branches behind the new route boundary.
