---
id: T7
title: 'Move the 22-file administration slice into `modules/workspace`, content-free'
layer: 'ui'
deps: ['T6']
acs: ['CR-AC-01', 'CR-AC-02', 'CR-RG-01']
files_hint:
  [
    'apps/web/src/modules/warehouse',
    'apps/web/src/modules/workspace',
    'apps/web/src/test/module-surface.ts',
  ]
source_refs:
  [
    'apps/web/src/modules/warehouse/components/workspace-administration/warehouses',
    'apps/web/src/modules/warehouse/api/warehouse-api.ts',
    'apps/web/src/modules/warehouse/hooks/useAssignWarehouseMembership.ts',
    'apps/web/src/modules/warehouse/hooks/useCreateWarehouse.ts',
    'apps/web/src/modules/warehouse/hooks/useRenameWarehouse.ts',
    'apps/web/src/modules/warehouse/hooks/useRevokeWarehouseMembership.ts',
    'apps/web/src/modules/warehouse/hooks/useSetWarehouseArchival.ts',
    'apps/web/src/modules/warehouse/hooks/warehouse-name-validation.ts',
    'apps/web/src/modules/warehouse/hooks/warehouse-name-validation.spec.ts',
    'apps/web/src/modules/warehouse/schemas/warehouse-name-form.schema.ts',
    'apps/web/src/test/module-surface.ts',
  ]
owner: 'YuriiH'
estimate: 'L'
status: 'done'
---

# T7 — Move the 22-file administration slice into `modules/workspace`, content-free

## Why

CH-W1 + CH-W2 + CH-W3 + CH-W4 as one commit, per `change.md` §6 step 2 and [`sad.md` §4.3](../sad.md#43-the-move-commit-is-content-free-so-cr-rg-01-is-checkable-by-diff). Keeping content edits out of this commit is the whole mechanism by which CR-RG-01 becomes checkable by diff rather than asserted.

## What

Move the 13 CH-W1 component files and the 9 CH-W2 hook/api/schema files to the layout [`sad.md` §5.1](../sad.md#51-modulesworkspace-after-the-move--the-cr-ac-01-manifest) fixes — the components into `modules/workspace/components/workspace-administration/warehouses/`, the hooks/api/schema alongside `modules/workspace`'s existing `hooks/`, `api/` and `schemas/`.

Re-point `WorkspaceAdministration.tsx:10` intra-module, rewrite every specifier naming a moved file, and update the boundary machinery in the same commit so the tree never goes red:

- `MODULE_SURFACE.warehouse`: delete the `…/warehouses/WarehousesTab` entry. `route` and `hooks/useRecordWarehouseEntry` stay. Add **nothing** anywhere — 15 declared entries become 14.
- `WORKSPACE_MODULE_MANIFEST`: from 8 entries to the **30** files this task leaves in place — 8 retained + 13 CH-W1 + 9 CH-W2. The 5 new components and 3 new specs arrive in T9–T12 and are added there, reaching `sad.md` §5.1's 38 (T9 +4 → 34, T10 +1 → 35, T11 +2 → 37, T12 +1 → 38).

Add the CR-AC-01 guards: `modules/warehouse` resolves to exactly the six files of `sad.md` §5.2, and none of the 22 moved files is reachable at a `modules/warehouse/` path.

## Definition of Done

- [ ] `git diff -M --find-copies-harder 42f1205` over the moved set shows import-specifier hunks only — no JSX, no logic, no assertion changed
- [ ] the boundary spec passes with an **empty exception list**; the negative fixtures under `modules/fixtures/` still fail as intended
- [ ] `modules/warehouse` listing returns exactly the six files of `sad.md` §5.2, both colocated specs retained
- [ ] `grep -r 'modules/warehouse/components/workspace-administration' apps/web/src` returns zero hits
- [ ] `pnpm --filter @warehouser/web lint && test && build` all clean

## Notes

**Abort threshold (`change.md` §6).** If any import must be _permitted despite_ the surface rule, stop the request — CH-D2's rule is wrong. Do not add an exception.

`WarehousesTab` is **not** declared in `MODULE_SURFACE.workspace`: its only importer is now intra-module (`sad.md` §5.6).

This task is deliberately one atomic commit rather than a CH-W1/CH-W2 split — the components import the hooks, so any split leaves an intermediate commit where the boundary spec fails. The size is renames plus ~30 specifier lines, not new code.

The stale comments and predecessor identifiers in the boundary machinery are **T8's**, not this task's — keeping them out preserves §4.3's "every hunk is an import specifier" property.
