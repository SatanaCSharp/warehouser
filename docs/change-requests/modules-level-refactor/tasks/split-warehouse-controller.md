---
id: T7
title: 'Split warehouse.controller.ts across warehouses and access without changing a route'
layer: 'ports'
deps: ['T6']
acs: ['CR-AC-05', 'CR-AC-06', 'CR-AC-11', 'CR-RG-01', 'CR-RG-02']
files_hint:
  - 'apps/server/src/warehouses/rest/'
  - 'apps/server/src/access/rest/controllers/warehouse-access.controller.ts'
  - 'apps/server/src/access/usecases/'
  - 'apps/server/src/test/harnesses/warehouse-http-contract.harness.ts'
  - 'apps/server/src/app.module.ts'
  - 'apps/server/src/workspaces/rest/'
  - 'tests/access/authorization-coverage.spec.mjs'
source_refs: ['CH-S1', 'CH-S3', 'CH-S5', 'CH-S6']
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T7 — Split `warehouse.controller.ts` across `warehouses` and `access` without changing a route

## Why

`warehouse.controller.ts` carries seven handlers whose owners diverge: four write the Warehouse record
(→ `warehouses`, [CH-S1](../change.md#3-override-map)) and three grant or revoke a Warehouse **Role**,
which is Access, not Warehouse ([CH-S3](../change.md#3-override-map)). Both halves must land in one
commit: split the class and leave either half homeless, and three routes disappear — the route-table gate
would fail and the application would silently lose endpoints.

## What

- Move `WarehouseController` to `warehouses/rest/controllers/` keeping **only** its four record handlers
  (`GET`, `POST`, `PATCH :warehouseId`, `PUT :warehouseId/archival`) and its
  `@Controller('api/v1/workspace/warehouses')` prefix **byte-identical**.
- Move `warehouse-mutation.dto.ts` into `warehouses/rest/dtos/`.
- Move `assign-warehouse-membership.command.ts`, `revoke-warehouse-membership.command.ts` and
  `list-assignable-warehouse-roles.query.ts` (+ their three integration specs) into `access/usecases/`,
  exported from `AccessUsecaseModule`. They move to **`access`, not `warehouses`** — the Warehouse in
  their name is their subject, not their owner, and getting this wrong reintroduces exactly the
  cross-module table write this request removes.
- Create `access/rest/controllers/warehouse-access.controller.ts` declaring the **same**
  `@Controller('api/v1/workspace/warehouses')` prefix, carrying the three membership handlers
  (`GET :warehouseId/assignable-roles`, `POST :warehouseId/memberships`,
  `DELETE :warehouseId/memberships/:userId`) and `WarehouseMembershipAssignmentDto`.
- Split `warehouse.controller.spec.ts` along the same line; move
  `warehouse-record-http-contract.integration.spec.ts` to `warehouses` and
  `warehouse-membership-http-contract.integration.spec.ts` to `access`.
- Promote `warehouse-http-contract.harness.ts` from `workspaces/rest/controllers/` to
  `apps/server/src/test/harnesses/` — both modules consume it and neither may import the other.
- Register `WarehousesRestModule` in `app.module.ts`. Register **both** `WarehouseAccessGuard` and
  `WorkspaceAccessGuard` on `AccessRestModule`: `WarehouseAccessController` is guarded by the latter and
  Nest must be able to construct it. Registering a guard is not owning it — the classes stay in
  `shared/guards/`.
- Update `workspaces/module-wiring.spec.ts`'s controller inventory and re-path
  `tests/access/authorization-coverage.spec.mjs`'s path-valued keys in this same commit.

## Definition of Done

- [ ] The route-table gate diff is **empty**: all seven handlers keep their exact method, full path,
      guard set, permission metadata and DTO class, and `api/v1/workspace/warehouses` is served by two
      controllers with no path shadowed and none unreachable.
- [ ] Both HTTP-contract integration suites pass at their new locations with **every payload assertion
      untouched**; only suite grouping and file location differ.
- [ ] `tests/access/authorization-coverage.spec.mjs` passes with every classification rule and coverage
      assertion unchanged — only path-valued literals differ, and **no handler moved between covered and
      exempt**.
- [ ] `pnpm --filter @warehouser/server lint && test && build` green, plus the integration tier serially.
- [ ] `node --test 'tests/**/*.spec.mjs'` green.

## Notes

Shares the `authorization-coverage.spec.mjs` lane with T11 and T13 — its exemption keys are path-valued,
so they must be re-pathed in the same commit that moves the handler, never afterwards. This task is the
first place [sad §4.5](../sad.md#45-source-layout-and-url-layout-are-deliberately-decoupled)'s decoupling
becomes visible: a module owns behavior, a URL prefix expresses a resource hierarchy, and the two are
allowed to disagree. [sad §11 R3](../sad.md#risks) is the live risk — NestJS resolves by registration
order, so a handler could become unreachable without any behavioral test noticing. The route-table gate
is the only thing that catches it.
