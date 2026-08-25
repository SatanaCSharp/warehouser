---
id: T15
title: 'Move the Warehouse domain into modules/warehouse'
layer: 'ui'
deps: ['T14']
acs: ['CR-AC-01', 'CR-AC-03', 'CR-RG-01']
files_hint:
  - 'apps/web/src/modules/warehouse/components/'
  - 'apps/web/src/modules/warehouse/api/warehouse-api.ts'
  - 'apps/web/src/modules/warehouse/hooks/'
  - 'apps/web/src/modules/warehouse/schemas/warehouse-name-form.schema.ts'
  - 'apps/web/src/modules/workspace/'
source_refs: ['CH-W1']
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T15 — Move the Warehouse domain into `modules/warehouse`

## Why

`modules/warehouse/` is a six-file stub — a dashboard route, a page rendering `DesignSystemExample`, and
`useRecordWarehouseEntry` — while the actual Warehouse domain lives under `modules/workspace/`
([CH-W1](../change.md#3-override-map)). [CR-AC-01](../spec.md#cr-ac-01-cr-us-01-ch-w1-ch-w4--structure)
makes `modules/warehouse` the owner so the entities Warehouse is about to own have a module to attach to.

## What

Move into `apps/web/src/modules/warehouse/`, each file keeping its content apart from import specifiers:

- The twelve administration components + `WarehousesTab.spec.tsx` (1122 lines) from
  `modules/workspace/components/workspace-administration/warehouses/` →
  `modules/warehouse/components/workspace-administration/warehouses/`: `AddWarehouseAction`,
  `AddWarehouseDialog`, `ArchiveWarehouseDialog`, `GiveWarehouseAccessAction`,
  `GiveWarehouseAccessDialog`, `WarehouseDetailPane`, `WarehouseLifecycleActions`, `WarehouseList`,
  `WarehouseNameForm`, `WarehousePeopleList`, `WarehousesTab`, `WithdrawWarehouseAccessDialog`.
- `api/workspace-warehouses-api.ts` → `modules/warehouse/api/warehouse-api.ts`.
- `hooks/useCreateWarehouse.ts`, `useRenameWarehouse.ts`, `useSetWarehouseArchival.ts`,
  `useAssignWarehouseMembership.ts`, `useRevokeWarehouseMembership.ts`, `warehouse-name-validation.ts`.
- `schemas/warehouse-name-form.schema.ts`.
- Split `modules/workspace/hooks/name-validation.spec.ts`: the warehouse-name cases colocate here, the
  workspace-role cases go to `modules/access` in T16. The union of cases must equal the set before.

The three `selectCurrentUser` call sites among these files keep reading `modules/auth/store/auth.selectors` —
declared surface, no change needed.

## Definition of Done

- [ ] Every file above resolves from `modules/warehouse/`, and **no file left under
      `modules/workspace/` enforces a Warehouse rule**.
- [ ] `pnpm --filter @warehouser/web lint && test && build` green, with **no assertion changed** but file
      locations and import specifiers — `WarehousesTab.spec.tsx` in particular moves untouched.
- [ ] `WorkspaceAdministration.tsx` still renders and its spec still passes; it now imports `WarehousesTab`
      across a module boundary, which T4's `placing-web-components.md` narrowing has already legalized.
- [ ] The warehouse half of `name-validation.spec.ts` runs beside `warehouse-name-validation.ts`, and T2's
      split-case gate confirms no case was lost.
- [ ] No new eager chunk: the `/workspace` route already loaded all four tab components, so only file
      paths change and the chunk graph stays equivalent to `baseline_revision`.

## Notes

`workspace-users-api.ts` is **not** moved here and **not** into `access` — T14 already put it in
`shared/api/`, because it is read by workspace-member add _and_ by three warehouse-domain consumers
(`workspace-warehouses-api.ts:8`, `GiveWarehouseAccessDialog.tsx:5`, `WarehousesTab.tsx:7`). Placing it in
`access` would make three `modules/warehouse` files import an `access` API slice, which CR-AC-04 forbids
([CR-AC-03](../spec.md#cr-ac-03-cr-us-01-ch-w3--structure)). i18n stays untouched here: these components
keep reading the `workspace` namespace until T18 moves the keys and the namespace argument together, in
one commit. Serialized with T14, T16 and T17 by the shared `modules/workspace/` directory.
