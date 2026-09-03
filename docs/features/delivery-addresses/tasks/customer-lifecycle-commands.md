---
id: T8
title: 'Add the Customer lifecycle commands: record, correct the name, deactivate and reactivate'
layer: 'app'
deps: [T6, T7]
acs: ['AC-01', 'AC-02', 'AC-03', 'AC-03a', 'AC-03b', 'AC-03c', 'AC-06', 'AC-12']
files_hint:
  - 'apps/server/src/customers/usecases/commands/'
  - 'apps/server/src/customers/customers.module.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T8 — Add the Customer lifecycle commands: record, correct the name, deactivate and reactivate

## Why

US-01 and US-03 turn a typed string into a record a Warehouse maintains once. The name rule is the load-bearing one: deactivation never releases it, so "Acme" cannot be quietly recreated beside the Inactive Acme. Derives from [spec.md §5 AC-01…AC-03c, AC-06](../spec.md) and [sad.md §6.2, §6.3](../sad.md).

## What

Add the four lifecycle commands to `customers/usecases/commands/`: record a Customer with its first Delivery Address as Main, correct a Customer's name, deactivate a Customer and reactivate one. Each proves the Customer it touches belongs to `principal.warehouseId` before anything else.

## Definition of Done

- [ ] A recorded Customer is active, has its one address as Main, and carries the recording member and time.
- [ ] A blank or whitespace-only name or address is refused naming the value, and nothing is written.
- [ ] A taken name is refused naming the holder, whether that holder is active or Inactive.
- [ ] The same name is accepted in a second Warehouse as an unrelated Customer.
- [ ] A correction to an unused name leaves every naming Customer Order and frozen line reading as before.
- [ ] Deactivation keeps the name taken, leaves every address in the state it was in, and is reversible.
- [ ] A Customer of another Warehouse is refused **identically** to one that does not exist.
- [ ] lint + vet clean.

## Notes

**Hard rule** ([spec.md §6.1](../spec.md) abuse cases): a denial never discloses that the target exists elsewhere. Shares `customers/usecases/commands/` with T9 — same lane.
