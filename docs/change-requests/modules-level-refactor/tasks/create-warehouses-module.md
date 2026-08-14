---
id: T6
title: 'Create the warehouses module and move the Warehouse record use cases into it'
layer: 'app'
deps: ['T2', 'T5']
acs: ['CR-AC-05', 'CR-AC-08', 'CR-RG-01']
files_hint:
  - 'apps/server/src/warehouses/usecases/'
  - 'apps/server/src/warehouses/domain/errors/warehouse.errors.ts'
  - 'apps/server/src/warehouses/index.ts'
  - 'apps/server/src/workspaces/usecases/'
source_refs: ['CH-S1']
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T6 — Create the `warehouses` module and move the Warehouse record use cases into it

## Why

There is no `warehouses` module at all: the Warehouse entity is written exclusively by commands owned by
`workspaces` ([CH-S1](../change.md#3-override-map)). Warehouse is about to own Locations, crates, pallets
and picking, and those entities need a module that exists to attach to
([spec §2](../spec.md#2-goals)). `warehouses` is created under the rules
[server-architecture.md](../../../system/server-architecture.md) already states — this applies its
"a module is named for the business entity it owns" sentence rather than inventing a rule.

## What

- Create `apps/server/src/warehouses/` with `usecases/usecase.module.ts`, `rest/rest.module.ts` and
  `index.ts` exporting `WarehousesUsecaseModule` and `WarehousesRestModule`. **No empty directory is
  created for symmetry** ([CR-AC-05](../spec.md#cr-ac-05-cr-us-01-ch-s1-ch-s6--structure)).
- Move the four lifecycle commands and their seven specs — `create`, `rename`, `archive`,
  `restore-warehouse.command.ts` — into `warehouses/usecases/commands/`.
- Move `list-workspace-warehouses.query.ts` and its integration spec into `warehouses/usecases/queries/`.
- Create `warehouses/domain/errors/warehouse.errors.ts` carrying **exactly three** factories under
  unchanged codes: `workspaceLastUnarchivedWarehouseError`,
  `workspaceWarehouseCreationUnavailableError`, `workspaceArchivalUnavailableError`. Split their cases
  out of `workspace.errors.spec.ts`.
- `WarehousesUsecaseModule` imports `AccessUsecaseModule` — `CreateWarehouseCommand` needs
  `ProvisionInitialAccessCommand` — and `shared/*`. Nothing else.
- Leave `WarehouseController` in place for now; T7 moves it, because moving a controller means splitting
  it and that has to happen in one commit to keep the route table intact.

## Definition of Done

- [ ] The four commands and the list query run from `apps/server/src/warehouses/` with their specs, and
      `pnpm --filter @warehouser/server test` passes with no assertion changed but file locations and
      import specifiers.
- [ ] `warehouse.errors.ts` holds exactly the three factories, each emitting its original code string —
      **three, not four**: `workspaceWarehouseArchivedError` went to `shared/errors/` in T5 under
      CR-AC-06's second clause, because its only caller stays in `workspaces`.
- [ ] `WarehousesUsecaseModule` exports the four commands and the query; the module graph edge
      `warehouses.usecases → access.usecases` resolves with no `forwardRef()`.
- [ ] `pnpm --filter @warehouser/server lint && test && build` green.
- [ ] `DATABASE_NAME=warehouser_test RUN_INTEGRATION=1 pnpm --filter @warehouser/server exec jest --runInBand`
      green — the moved integration specs must actually run, not be silently skipped.
- [ ] `node --test 'tests/**/*.spec.mjs'` green; the route-table diff is still empty because no handler
      has moved yet.

## Notes

The three-factory count is the resolution of [sad §11 O1](../sad.md#open-questions), applied to
`spec.md` at the `tasks` stage. A card claiming four factories here would encode the contradiction the
design flagged. `AccessUsecaseModule` must stay the **leaf** of the feature graph
([CR-AC-09](../spec.md#cr-ac-09-cr-us-01-ch-s5--boundary)) — this task adds an edge _into_ it, never out
of it.
