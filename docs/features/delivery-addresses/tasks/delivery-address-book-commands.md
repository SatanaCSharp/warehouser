---
id: T9
title: 'Add the Delivery Address book commands: add, revise, mark Main, deactivate and reactivate'
layer: 'app'
deps: [T6, T7]
acs: ['AC-04', 'AC-05', 'AC-06a', 'AC-06b', 'AC-07', 'AC-12']
files_hint:
  - 'apps/server/src/customers/usecases/commands/'
  - 'apps/server/src/customers/customers.module.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T9 — Add the Delivery Address book commands: add, revise, mark Main, deactivate and reactivate

## Why

A Customer's addresses are where its goods may be sent, and two rules make the set safe to choose from: exactly one Main among the active ones, and never zero active ones. AC-07 is a **transition** rule evaluated under lock, not a row constraint — [data-model.md § Constraints the model deliberately does not express](../data-model.md) explains why. Derives from [spec.md §5 AC-04…AC-07](../spec.md) and [sad.md §6.3](../sad.md).

## What

Add the address-book commands to `customers/usecases/commands/`: add an address with its access notes, revise one in place, mark one Main, deactivate one and reactivate one. Deactivating the current Main address delegates the reassignment to `CustomerAddressBookService` and reports which address is now Main.

## Definition of Done

- [ ] Adding a second address and marking it Main clears the previous Main one in the same transaction.
- [ ] Exactly one active address is Main at rest, asserted after each command.
- [ ] Deactivating an address leaves every naming Customer Order and frozen Purchase Draft Line reading and counting exactly as before.
- [ ] Deactivating the Main address promotes a remaining active one and the response names it.
- [ ] The last active address is refused **under lock**, with the guidance to add the replacement first.
- [ ] An address of another Customer or another Warehouse is refused identically to a missing one.
- [ ] lint + vet clean.

## Notes

Revising an address in place corrects it everywhere it is still live — that is the point of holding it by reference ([sad.md §4](../sad.md)). It must not reach a frozen line, which holds captured text and no reference at all (T16).
