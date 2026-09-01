---
id: T3
title: 'Add the nine shared persistence entities and register them on DomainModule'
layer: 'infra'
deps: ['T1']
acs: ['AC-03', 'AC-11']
files_hint:
  [
    'apps/server/src/shared/domain/entities/',
    'apps/server/src/shared/domain/domain.module.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T3 — Add the nine shared persistence entities and register them on DomainModule

> **Blocked by:** [T1](./create-ordering-schema-migration.md) · **Layer:** `infra` · **Owner:** Backend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-03](../spec.md), [AC-11](../spec.md)

## Why

Every repository this feature adds accepts and returns shared persistence entities, so the entities gate all three module lanes. Derives from [sad §5 `shared/domain/entities`](../sad.md) and [data-model §Entities](../data-model.md) and [§Repository boundaries](../data-model.md).

## What

- Add `ItemEntity`, `ItemStockAdjustmentEntity`, `CustomerOrderEntity`, `PackagingTypeEntity`, `PurchaseDraftEntity`, `PurchaseDraftLineEntity`, `PurchaseDraftLineLinkEntity`, `DemandSnapshotEntryEntity` and `ArrivalAllocationEntity` under `shared/domain/entities/`.
- Each carries the `warehouse_id` its ownership rule needs, and the line/link/snapshot/allocation relations carry the composite Warehouse reference `data-model.md` names as the candidate shape.
- Register all nine on `DomainModule`.

## Definition of Done

- [ ] Every entity maps to the relation T1 created — column names, nullability and types match the migration
- [ ] `DomainModule` resolves all nine, asserted by the existing `domain.module.spec.ts` pattern
- [ ] An integration test round-trips one row of each entity
- [ ] A test proves the composite Warehouse reference refuses a line and a link whose parent and target sit in different Warehouses
- [ ] lint + vet clean

## Notes

- Persistence entities only — mapping to feature domain objects belongs in each module's `domain/mappers/`, not here.
- No index or constraint keys on `customer_orders.customer_name`, so it can never leak through a constraint-named error (`data-model.md` §Security).
