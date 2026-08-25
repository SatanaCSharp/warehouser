---
id: T9
title: 'Build DemandAllocationService and its repository, exported for Arrival Confirmation'
layer: 'app'
deps: ['T8']
acs: ['AC-17a', 'AC-18', 'AC-19b']
files_hint:
  [
    'apps/server/src/customer-orders/domain/services/demand-allocation.service.ts',
    'apps/server/src/shared/domain/repositories/demand-allocation.repository.ts',
    'apps/server/src/customer-orders/usecases/',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T9 — Build DemandAllocationService and its repository, exported for Arrival Confirmation

> **Blocked by:** [T8](./customer-order-lifecycle.md) · **Layer:** `app` · **Owner:** Backend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-17a](../spec.md), [AC-18](../spec.md), [AC-19b](../spec.md)

## Why

The effect of an arrival on demand is a Customer Order invariant, so `customer-orders` owns it and `purchase-drafts` calls it. Decided in [ADR 0002](../adr/0002-arrival-confirmation-ownership.md); derives from [spec §5 AC-17a/AC-18/AC-19b](../spec.md) and [sad §6.9](../sad.md).

## What

- Add `DemandAllocationRepository` to `shared/domain/repositories/`.
- Add `DemandAllocationService` in `customer-orders/domain/services/`: apply Allocations to linked Customer Orders under lock, enforce the AC-18 bounds, recompute Outstanding Quantity and the Fulfilled transition.
- Export it from the module's use-case module so `purchase-drafts` can call it inside the confirmation's own `@Transactional()` boundary.
- The service opens no transaction of its own — it joins the caller's.

## Definition of Done

- [ ] Unit tests prove each AC-18 bound refuses the **whole** confirmation: assigning more than was recorded as arrived for the line, more than a Customer Order is still waiting for, and to an order since cancelled or already Fulfilled
- [ ] An integration test proves the bounds are evaluated after the Customer Order rows are locked in ascending identifier order inside the caller's transaction
- [ ] A test proves an order assigned its whole Outstanding Quantity becomes Fulfilled and one assigned part of it keeps counting for the remainder (AC-17a)
- [ ] An architecture check proves the service is reachable only through the module's declared public surface, and that `customer-orders` does not import `purchase-drafts`
- [ ] lint + vet clean

## Notes

- ADR 0002: propagation keeps the arrival one transaction, satisfying `spec.md` §6 "Arrival atomicity" without either module enforcing the other's rules.
- Overlaps T8 on `customer-orders/usecases/`, so `implement` runs them in one lane.
