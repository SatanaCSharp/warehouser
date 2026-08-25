---
id: T11
title: 'Expose the customer-orders and demand REST surface: contracts subpath, controllers, DTOs and module wiring'
layer: 'ports'
deps: ['T10', 'T9', 'T4']
acs: ['AC-01', 'AC-03', 'AC-04', 'AC-05', 'AC-19', 'AC-19a', 'AC-23']
files_hint:
  [
    'packages/contracts/customer-orders/',
    'apps/server/src/customer-orders/rest/',
    'apps/server/src/customer-orders/customer-orders.module.ts',
    'tests/refactor/route-table.baseline.json',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T11 — Expose the customer-orders and demand REST surface: contracts subpath, controllers, DTOs and module wiring

> **Blocked by:** [T10](./consolidated-demand-read.md), [T9](./demand-allocation-service.md), [T4](./write-rate-limit-guard.md) · **Layer:** `ports` · **Owner:** Backend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-01](../spec.md), [AC-03](../spec.md), [AC-04](../spec.md), [AC-05](../spec.md), [AC-19](../spec.md), [AC-19a](../spec.md), [AC-23](../spec.md)

## Why

The Demand destination needs the HTTP surface for the consolidated read and the Customer Order lifecycle. Derives from [contracts/openapi.yaml](../contracts/openapi.yaml) `/demand` and `/customer-orders*`, and [sad §7](../sad.md).

## What

- Add the `packages/contracts/customer-orders` subpath, including the consolidated demand projection. No endpoint accepts a Demand Line or a Coverage figure as input — both are derived and read-only.
- Add `customer-orders/rest/`: controllers for `GET /demand`, `GET|POST /customer-orders`, `PATCH /customer-orders/{id}` and `POST /customer-orders/{id}/cancellation`, each declaring exactly one `@RequiredPermission(...)`, `@ArchivedTolerantRead()` on reads only, `@WriteRateLimited()` on mutations.
- Wire `CustomerOrdersModule` into `app.module.ts` and regenerate `tests/refactor/route-table.baseline.json`.

## Definition of Done

- [ ] Every endpoint validates its shared schema and maps its stable `customer_orders.*` error codes
- [ ] A contract test proves the demand read is denied without `CUSTOMER_ORDERS:WATCH` and that the denial shows no customer name, quantity or Item and does not reveal whether any demand exists (AC-05)
- [ ] A test proves each mutating endpoint is denied without its own Permission and permitted with it
- [ ] A test proves every read succeeds on an archived Warehouse and every mutation is denied on one (AC-23)
- [ ] `tests/refactor/route-table.spec.mjs` passes against a deliberately regenerated baseline
- [ ] lint + vet clean

## Notes

- Cancellation is addressed as its own sub-resource so it can declare `CUSTOMER_ORDERS:CANCEL` separately from `:UPDATE`.
- Shares `route-table.baseline.json` with T7 and T16 — one serialized `ports` lane.
