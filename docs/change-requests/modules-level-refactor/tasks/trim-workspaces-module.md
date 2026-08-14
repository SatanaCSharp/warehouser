---
id: T12
title: 'Trim workspaces to its enumerated remainder and prove the module graph acyclic'
layer: 'wiring'
deps: ['T11']
acs: ['CR-AC-07', 'CR-AC-08', 'CR-AC-09', 'CR-RG-01']
files_hint:
  - 'apps/server/src/workspaces/'
  - 'apps/server/src/warehouses/usecases/usecase.module.di.spec.ts'
  - 'apps/server/src/warehouses/warehouses-load-smoke.integration.spec.ts'
  - 'apps/server/src/app.module.ts'
source_refs: ['CH-S4', 'CH-S5']
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T12 — Trim `workspaces` to its enumerated remainder and prove the module graph acyclic

## Why

`src/workspaces/` was 78 files spanning three subjects. After T6–T11 it should hold only the Workspace
record and the member's position within it, and
[CR-AC-07](../spec.md#cr-ac-07-cr-us-01-ch-s3-ch-s4-ch-s6--structure) enumerates exactly what that is —
an enumeration, not a count. [CR-AC-09](../spec.md#cr-ac-09-cr-us-01-ch-s5--boundary) then requires the
resulting NestJS graph resolve with no `forwardRef()`, which is the binding constraint on the whole
re-layout.

## What

- Verify `apps/server/src/workspaces/` contains exactly: `rename-workspace.command.ts`,
  `read-workspace-context.query.ts`, `set-active-warehouse.command.ts`, `WorkspaceController` trimmed to
  `GET context` / `PUT active-warehouse` / `PATCH`, the workspace half of `workspace-mutation.dto.ts`,
  `workspace-provisioning.service.ts`, `active-warehouse-selection-boundaries.spec.ts`,
  `domain/module-boundaries.spec.ts`, `module-wiring.spec.ts`,
  `workspaces-load-smoke.integration.spec.ts`, the two module files and `index.ts` — with their colocated
  specs. Anything else is an unmoved file, not a retained one.
- Trim `WorkspacesUsecaseModule`'s provider list and confirm the target graph is the **three edges**
  [sad §5.1](../sad.md#51-server-modules-after-the-move) settles:
  `auth.usecases → workspaces.usecases → access.usecases` and `warehouses.usecases → access.usecases`.
  The `workspaces → warehouses` edge change.md predicted **does not exist** — no retained `workspaces`
  use case invokes a `warehouses` one.
- Confirm `WorkspaceProvisioningService` still provisions Workspace → owner role → first Warehouse →
  initial access in that order, calling siblings through their **exported use-case modules**.
- Add the `warehouses` counterparts of the two existing wiring specs:
  `warehouses/usecases/usecase.module.di.spec.ts` and
  `warehouses/warehouses-load-smoke.integration.spec.ts`. Update
  `workspaces/usecases/usecase.module.di.spec.ts`'s provider inventory and re-path
  `active-warehouse-selection-boundaries.spec.ts`.
- **No DI or smoke spec is added for `access`** — none exists today, CH-S5 does not authorize one, and
  adding test surface beyond the moved code is outside this request.

## Definition of Done

- [ ] The `workspaces` file listing matches CR-AC-07's enumeration exactly, and
      `workspaces/domain/errors/` is absent with no re-export shim.
- [ ] A repository-wide scan for `forwardRef(` returns **zero** hits. If the graph needs one, stop and
      record a finding — it is an ownership problem, not a licence.
- [ ] Both DI specs and both smoke integration specs pass; `register-access.integration.spec.ts` passes
      with import-specifier changes only, proving the provisioning order is intact.
- [ ] `workspaces/module-wiring.spec.ts`'s controller inventory is `[WorkspaceController]` and its rule is
      unchanged.
- [ ] `pnpm --filter @warehouser/server lint && test && build` green, plus the integration tier serially.
- [ ] The route-table diff is still empty — the three retained handlers never moved.

## Notes

`set-active-warehouse.command.ts` **stays** here on purpose: it writes `users.active_warehouse_id`, is
served by `GET /workspace/context`, and names a Warehouse only as a value. It is the member's position
within a Workspace, not the Warehouse record ([CH-S4](../change.md#3-override-map)) — which is also why
`workspaceWarehouseArchivedError`, its only error, went to `shared/errors/` in T5 rather than to
`warehouses`. If a fourth module edge turns up here, record it as a finding
([sad §5.1](../sad.md#51-server-modules-after-the-move)); do not add `forwardRef` to absorb it.
