---
id: T7
title: 'Expose the items REST surface: contracts subpath, controllers, DTOs and module wiring'
layer: 'ports'
deps: ['T5', 'T6', 'T4']
acs: ['AC-06', 'AC-06a', 'AC-06d', 'AC-08', 'AC-23']
files_hint:
  [
    'packages/contracts/items/',
    'apps/server/src/items/rest/',
    'apps/server/src/items/items.module.ts',
    'tests/refactor/route-table.baseline.json',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T7 — Expose the items REST surface: contracts subpath, controllers, DTOs and module wiring

> **Blocked by:** [T5](./item-catalogue-domain.md), [T6](./on-hand-adjustment.md), [T4](./write-rate-limit-guard.md) · **Layer:** `ports` · **Owner:** Backend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-06](../spec.md), [AC-06a](../spec.md), [AC-06d](../spec.md), [AC-08](../spec.md), [AC-23](../spec.md)

## Why

The Items destination and both pickers need the HTTP surface. Derives from [contracts/openapi.yaml](../contracts/openapi.yaml) `/items*`, [sad §7 HTTP and shared contracts](../sad.md) and [spec §6.1](../spec.md) for the Permission each route declares.

## What

- Add the `packages/contracts/items` subpath: strict request/response schemas for every `/items*` operation in the contract.
- Add `items/rest/`: thin controllers under `api/v1/warehouses/:warehouseId/items`, guarded by `SessionAuthGuard, WarehouseAccessGuard`, each declaring exactly one `@RequiredPermission(...)`, `@ArchivedTolerantRead()` on reads only, and `@WriteRateLimited()` on mutations.
- DTOs are `createZodDto` adapters over the contract subpath and redefine nothing.
- Wire `ItemsModule` into `app.module.ts` and regenerate `tests/refactor/route-table.baseline.json`.

## Definition of Done

- [ ] Every `/items*` endpoint validates its shared schema and maps its stable `items.*` error codes
- [ ] Contract tests prove each endpoint is denied without its Permission and permitted with it, and that no denial discloses whether the target exists
- [ ] A test proves every read succeeds on an archived Warehouse and every mutation is denied on one (AC-23)
- [ ] A guard unit test proves each handler declares exactly one `PermissionId`, a `warehouseId` route parameter, and read tolerance on reads only
- [ ] `tests/refactor/route-table.spec.mjs` passes against a deliberately regenerated baseline, reviewed as part of this change
- [ ] lint + vet clean

## Notes

- The route-table baseline is regenerated, never silenced (`sad.md` §10). This task shares `route-table.baseline.json` with T11 and T16, so `implement` serializes the three `ports` tasks into one lane.
- Controllers call use cases only. `items/domain/` imports no framework.
