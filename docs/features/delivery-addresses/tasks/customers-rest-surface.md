---
id: T10
title: 'Serve the customers REST surface with its queries and the new @warehouser/contracts/customers subpath'
layer: 'ports'
deps: [T5, T8, T9]
acs:
  [
    'AC-01',
    'AC-02',
    'AC-03',
    'AC-04',
    'AC-06',
    'AC-06a',
    'AC-07',
    'AC-08',
    'AC-09',
    'AC-12',
    'AC-23',
  ]
files_hint:
  - 'apps/server/src/customers/rest/'
  - 'packages/contracts/src/customers/'
  - 'tests/refactor/route-table.baseline.json'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T10 — Serve the customers REST surface with its queries and the new @warehouser/contracts/customers subpath

## Why

The Customers destination is the one surface where identity is the _subject_ rather than a field, so AC-09 demands the denial reveal nothing at all — no name, no address, no quantity, no Item, and no count. Derives from [openapi.yaml](../contracts/openapi.yaml), [spec.md §5 AC-08, AC-09](../spec.md) and [sad.md §7 HTTP](../sad.md).

## What

Add the three queries (list the Warehouse's Customers with their active-address counts and state; read one Customer with its addresses and the Unfulfilled orders it awaits; list the active Customers and addresses a picker offers) and serve them plus the T8/T9 commands across the eight endpoints under `api/v1/warehouses/{warehouseId}/customers`. Create the new `packages/contracts/src/customers/` subpath with strict request and response schemas. DTOs are `createZodDto` adapters that redefine nothing.

## Definition of Done

- [ ] Every endpoint validates its shared schema and maps its stable `customers.*` failure code.
- [ ] Every endpoint is denied without its Permission and permitted with it; no denial discloses existence.
- [ ] A Customer of another Warehouse produces the same non-enumerating failure as a missing one.
- [ ] Every mutation is denied on an archived Warehouse and every read succeeds on one.
- [ ] **No count, badge or total** is present in any response reachable without `CUSTOMERS:WATCH`.
- [ ] Reads declare `@ArchivedTolerantRead()`, writes declare `@WriteRateLimited()`, each controller declares exactly one `@RequiredPermission`.
- [ ] The route-table baseline is regenerated deliberately and `tests/refactor/route-table.spec.mjs` passes.
- [ ] lint + vet clean.

## Reading inherited from T9 — confirm before the DTO layer

`CorrectCustomerDeliveryAddressCommand` **permits correcting an Inactive address**. That is read
from the contract, not assumed: `correctCustomerDeliveryAddress` (PATCH) declares
`400/401/403/404/409 WarehouseArchived/429/500` and **no** `CustomerDeliveryAddressConflict`, while
`setMainCustomerDeliveryAddress` does declare it. Verified 2026-09-03 — the contrast is in
`contracts/openapi.yaml` and reads as deliberate: fixing a typo on an address a Customer Order still
names is worth doing whether or not that address is still active.

So the command resolves the row from the customer-scoped list itself and refuses only "unavailable";
it does not call `resolveDeliveryAddress`, which would refuse an Inactive one. **If T10's DTO layer
expects an inactive-address 409 on PATCH, this is the decision to revisit** — and the contract, not
the command, is what would need changing.

## Notes

Shares `tests/refactor/route-table.baseline.json` with T11, T13, T17 and T19 — one lane, regenerated in sequence, **never silenced** ([sad.md §10](../sad.md) gate 1). Controllers call use cases only.
