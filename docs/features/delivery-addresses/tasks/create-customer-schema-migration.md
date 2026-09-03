---
id: T1
title: 'Promote the customer-schema migration: two relations, their checks, keys and the partial unique Main-address index'
layer: 'migration'
deps: []
acs: ['AC-01', 'AC-03', 'AC-03a', 'AC-05']
files_hint:
  - 'docs/features/delivery-addresses/migrations/01-create-customer-schema.ts'
  - 'apps/server/migrations/'
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T1 — Promote the customer-schema migration: two relations, their checks, keys and the partial unique Main-address index

## Why

Every rule about a Customer rests on a relation that does not exist yet, and two of them — a name unique per Warehouse across active and Inactive, and at most one Main address among a Customer's active ones — [`data-model.md`](../data-model.md) requires to be **database constraints** rather than application checks, so concurrency cannot produce two. Derives from [sad.md §7 Data](../sad.md) and [data-model.md § Migrations](../data-model.md).

## What

Promote the staged [`01-create-customer-schema.ts`](../migrations/01-create-customer-schema.ts) into `apps/server/migrations/` as `1786700000000-CreateCustomerSchema.ts` — the class name already carries that timestamp. It creates `customers` and `customer_delivery_addresses` with their 6 checks, 3 foreign keys, 4 unique constraints and 2 indexes, one of them the partial unique index that expresses the Main-address rule over active rows only. No shipped migration is edited.

## Definition of Done

- [ ] The staged file is promoted under its recorded name and no shipped migration is touched.
- [ ] `migration:run` applies and `migration:revert` reverts cleanly against the development database.
- [ ] A repository integration test proves a customer name is refused a second time in one Warehouse whether the holder is active or Inactive, and accepted in a second Warehouse.
- [ ] A repository integration test proves the partial unique index refuses a concurrent second Main mark.
- [ ] lint + vet clean.

## Notes

Shares the `apps/server/migrations/` lane with T2 and T3; `layer: migration` is serialized by `implement` regardless, and the three must land in timestamp order. **Never run `migration:generate`** — [`data-model.md`](../data-model.md) § Never run `migration:generate` records that it emits a 368-statement migration dropping every `chk_*` constraint.
