---
id: T6
title: 'Build the customers domain: value objects, predicates, error factories, mappers and CustomerAddressBookService'
layer: 'domain'
deps: [T4, T7]
acs: ['AC-02', 'AC-03', 'AC-05', 'AC-06b', 'AC-07']
files_hint:
  - 'apps/server/src/customers/domain/'
  - 'apps/server/src/customers/customers.module.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T6 — Build the customers domain: value objects, predicates, error factories, mappers and CustomerAddressBookService

## Why

Customer and Delivery Address carry one cohesive invariant set — a name unique per Warehouse that deactivation never releases, at least one active address, exactly one Main one — which [sad.md §4](../sad.md) makes one flat top-level module. This task lands the rules with no I/O so the commands above them only orchestrate.

## What

Create `apps/server/src/customers/domain/`: value objects for the customer name, Delivery Address text and access notes; predicates for a blank name, a blank address, name availability, the last-active-address condition and Main-address membership; named error factories for a taken customer name, an unavailable Customer or address, a cross-Customer address, an Inactive address and the last-active-address refusal; mappers to the shared persistence entities; and `CustomerAddressBookService` for the operations more than one command needs, including the Main reassignment of AC-06b.

## Dependency correction (found during implementation)

This task's Definition of Done requires `CustomerAddressBookService` to be an `@Injectable()`
registered on the usecase module, and its only collaborator is `CustomerAddressBookRepository` —
which **T7** builds. `tasks.json` originally gave T6 and T7 the same single dependency (`T4`) and no
edge between them, so the two were schedulable in parallel while one needed the other's output. The
edge `T6 → T7` was added to `tasks.json`, to this frontmatter, and to the tracker.

Everything not needing that collaborator (the value objects, predicates, error factories, mappers
and all five address-book rules) is implemented as pure exported functions and fully tested; only
the dependency-injection wrapper and its module registration wait on T7.

## Definition of Done

- [ ] Unit tests cover the blank-name and blank-address rules with whitespace-only input.
- [ ] Unit tests prove name availability treats an Inactive holder exactly as an active one.
- [ ] Unit tests cover the last-active-address condition and Main-address membership and reassignment.
- [ ] `customers/domain` imports no NestJS, HTTP or TypeORM symbol.
- [ ] `CustomerAddressBookService` is registered on the `UsecaseModule` and **not** exported; nothing outside `customers` can reach it.
- [ ] lint + vet clean.

## Notes

**Hard rule** ([sad.md §10](../sad.md) Architecture): `customers` domain code imports no framework, and `customers` never imports `purchase-drafts`. Shares `customers.module.ts` with T8 and T9.
