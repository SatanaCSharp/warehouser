---
id: T4
title: 'Add the two new shared persistence entities and extend the four shipped ones, registered on DomainModule'
layer: 'infra'
deps: [T1, T2]
acs: ['AC-01', 'AC-04', 'AC-11', 'AC-16', 'AC-18', 'AC-19']
files_hint:
  - 'apps/server/src/shared/domain/entities/'
  - 'apps/server/src/shared/domain/domain.module.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T4 — Add the two new shared persistence entities and extend the four shipped ones, registered on DomainModule

## Why

Every repository, command and query in this feature reads through the shared persistence entities, so they are the first thing that must exist above the migrated schema. Derives from [sad.md §5 `shared/domain/entities`](../sad.md) and [data-model.md § Entities](../data-model.md).

## What

Add `CustomerEntity` and `CustomerDeliveryAddressEntity`, and extend `CustomerOrderEntity` (customer and Delivery Address references), `PurchaseDraftLineEntity` (Delivery Mode, live address reference, frozen address / notes / customer-name values, per-line ending attribution), `DemandSnapshotEntryEntity` (captured Delivery Address) and `WarehouseEntity` (own Delivery Address and access notes). Register the two new ones on `DomainModule`.

## Definition of Done

- [ ] Each new relation carries the `warehouse_id` its ownership rule needs, and the composite Warehouse reference where a child relation depends on one.
- [ ] `DomainModule` resolves every new and changed entity.
- [ ] An integration test round-trips a row of each of the two new entities and of each of the four changed ones.
- [ ] lint + vet clean.

## Notes

Shares `domain.module.ts` with T7 — same lane, so the two land in sequence. The frozen columns on `PurchaseDraftLineEntity` are written only by the freeze command (T16); nothing else may target them.
