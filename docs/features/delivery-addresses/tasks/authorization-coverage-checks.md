---
id: T20
title: 'Add the architecture check that ties an identity-bearing response schema to its observed-Permission declaration'
layer: 'tests'
deps: [T10, T13, T19]
acs: ['AC-09', 'AC-09a']
files_hint:
  - 'apps/server/src/test/'
  - 'tests/refactor/'
owner: 'Security Lead'
estimate: 'M'
status: 'todo'
---

# T20 — Add the architecture check that ties an identity-bearing response schema to its observed-Permission declaration

## Why

[sad.md §11](../sad.md) prescribes **two mechanical defences rather than a review pass**, because a missed surface leaks silently and forever. The contract shape is one (T13, T19); this check is the other, and it is what makes quality goal 1 mechanical rather than remembered. Derives from [sad.md §10 Architecture](../sad.md) and [§8 Authorization coverage](../sad.md).

## What

Add the static check that reads the resolved handler metadata and the contract schemas and fails when any read whose response schema can carry a customer-identity field does not declare `@ObservedPermission(CUSTOMERS:WATCH)`. Enumerate the identity-bearing surfaces from the [spec.md §1](../spec.md) inventory rather than from memory. Add the companion module-boundary checks.

## Definition of Done

- [ ] The check fails when the declaration is removed from any one identity-bearing read — proven by removing one.
- [ ] The surface list is derived from the inventory, not hand-maintained from recollection.
- [ ] Companion checks prove controllers call use cases only.
- [ ] Companion checks prove `customers` domain code imports no framework and `customers` does not import `purchase-drafts`.
- [ ] Companion checks prove no module imports another module's `domain/errors/`, predicates or DTOs, and shared repositories import no feature module.
- [ ] Every new handler is classified per [sad.md §8](../sad.md).
- [ ] lint + vet clean.

## Notes

**Hard rule** ([spec.md §6](../spec.md) Authorization coverage): 100% of this feature's capabilities have an explicit Permission rule and Warehouse ownership check, **reads included**, and 100% of the pre-existing identity-bearing surfaces are covered. Metadata coverage alone is not sufficient evidence — the per-endpoint denial tests and per-projection redaction tests are the rest.
