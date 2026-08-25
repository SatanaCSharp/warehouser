---
id: T8
title: 'Build the customer-orders domain and lifecycle: record, amend and cancel under the locked allocated-total read'
layer: 'app'
deps: ['T2', 'T3', 'T5']
acs: ['AC-01', 'AC-02', 'AC-02a', 'AC-03', 'AC-19', 'AC-19a', 'AC-19b']
files_hint:
  [
    'apps/server/src/customer-orders/domain/',
    'apps/server/src/customer-orders/usecases/',
    'apps/server/src/shared/domain/repositories/customer-order-lifecycle.repository.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T8 — Build the customer-orders domain and lifecycle: record, amend and cancel under the locked allocated-total read

> **Blocked by:** [T2](./grant-ordering-permissions-migration.md), [T3](./ordering-persistence-entities.md), [T5](./item-catalogue-domain.md) · **Layer:** `app` · **Owner:** Backend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-01](../spec.md), [AC-02](../spec.md), [AC-02a](../spec.md), [AC-03](../spec.md), [AC-19](../spec.md), [AC-19a](../spec.md), [AC-19b](../spec.md)

## Why

Recording what a named customer is waiting for is the demand half of the loop. Derives from [spec §5 AC-01/AC-02/AC-02a/AC-03/AC-19/AC-19a/AC-19b](../spec.md), [sad §5 `customer-orders/*`](../sad.md) and [sad §6.10](../sad.md).

## What

- Add `customer-orders/domain/`: customer name, demand quantity, needed-by date and cancellation-reason value objects; predicates and error factories for a past needed-by date, a quantity below what is already allocated, a non-Unfulfilled allocation target and an over-Outstanding assignment.
- Add `CustomerOrderLifecycleRepository` with the locked allocated-total read.
- Add `CustomerOrderLifecycleService` under `@Transactional()` and the record / amend / cancel use cases, plus `customer-orders/domain/mappers/`.
- Prove the named Item belongs to `principal.warehouseId` through `ItemCatalogueRepository` before recording.

## Definition of Done

- [ ] Unit tests prove a zero, negative or fractional quantity and an empty customer name are each refused in plain language naming the value (AC-02)
- [ ] A test proves a needed-by date that has already passed is refused with the AC-02a message
- [ ] A test proves an Item of another Warehouse is refused **identically to a missing one**, disclosing nothing (AC-03)
- [ ] An integration test proves an amendment below the already-allocated total is refused against the **locked** row and leaves the Customer Order exactly as it was (AC-19b)
- [ ] A test proves raising a Fulfilled order's quantity returns it to Unfulfilled, and that Outstanding Quantity is recalculated on every amendment
- [ ] A test proves a cancellation records the reason, the acting member and the time
- [ ] A test proves Outstanding Quantity is never silently clamped to zero
- [ ] lint + vet clean

## Notes

- A Customer Order carries a typed customer name only — no identifier beyond it (`spec.md` §8, sixth question, taking its stated default). This is the first personal data in the product.
- Bounds are re-checked against locked rows at the moment the change is recorded, never against the values the member composed against (`sad.md` §8).
- Lock order everywhere: the Purchase Draft row, then its lines, then the Customer Orders it touches in ascending identifier order.
