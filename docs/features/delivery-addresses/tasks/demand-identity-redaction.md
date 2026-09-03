---
id: T13
title: 'Redact customer identity in the demand and Customer Order projections and serve their REST surface'
layer: 'ports'
deps: [T5, T12]
acs: ['AC-09a', 'AC-11', 'AC-11a', 'AC-11b', 'AC-11c', 'AC-24']
files_hint:
  - 'apps/server/src/customer-orders/usecases/queries/'
  - 'apps/server/src/customer-orders/rest/'
  - 'apps/server/src/shared/domain/repositories/consolidated-demand.repository.ts'
  - 'packages/contracts/src/customer-orders/'
  - 'tests/refactor/route-table.baseline.json'
owner: 'Security Lead'
estimate: 'L'
status: 'todo'
---

# T13 — Redact customer identity in the demand and Customer Order projections and serve their REST surface

## Why

[sad.md §11](../sad.md) names retrofitting the shipped surfaces under a Permission they never declared as "the largest and least visible part of this feature — a missed surface leaks silently and forever". Redaction is a property of the **projection**: the withheld value is never selected into the response. Derives from [spec.md §5 AC-09a](../spec.md) and [ADR 0001](../adr/0001-observed-permission-redaction.md).

## What

Build the redacted and full forms of the consolidated-demand and Customer Order projections from `observedPermissionIds`, and serve the demand, Customer Order list, amendment and redirection endpoints with `@ObservedPermission(CUSTOMERS:WATCH)` declared. Extend the `customer-orders` contracts subpath so the redacted form **omits** the fields rather than nulling them.

## Definition of Done

- [ ] One redaction unit test per projection, on both sides of `CUSTOMERS:WATCH`.
- [ ] Withheld means the field is **absent**, so a redaction failure is a contract violation rather than a rendering artefact.
- [ ] A name typed onto an order that names no Customer is withheld exactly as a Customer's name is.
- [ ] No count survives redaction anywhere in the response.
- [ ] Everything the member's own Permissions do admit is unchanged — asserted, not assumed.
- [ ] Both the redacted and the unredacted shape validate against the contract.
- [ ] lint + vet clean.

## Notes

The mechanical check that this was done for **every** identity-bearing surface rather than the remembered ones is T20; this task lands the mechanism, T20 proves the coverage. Shares the route-table baseline lane.
