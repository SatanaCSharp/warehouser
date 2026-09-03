---
id: T7
title: 'Add the three customers specialized repositories: directory, address book and awaiting demand'
layer: 'infra'
deps: [T4]
acs: ['AC-03', 'AC-03a', 'AC-05', 'AC-07', 'AC-08']
files_hint:
  - 'apps/server/src/shared/domain/repositories/customer-directory.repository.ts'
  - 'apps/server/src/shared/domain/repositories/customer-address-book.repository.ts'
  - 'apps/server/src/shared/domain/repositories/customer-awaiting-demand.repository.ts'
  - 'apps/server/src/shared/domain/domain.module.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T7 — Add the three customers specialized repositories: directory, address book and awaiting demand

## Why

[sad.md §5](../sad.md) names three specialized repositories because each answers one question in one read: the list with its counts, the address set under lock, and one Customer's awaiting demand. Splitting them differently would either re-read or leak persistence shape into a use case. Derives from [data-model.md § Repository boundaries](../data-model.md) and [§ Indexes](../data-model.md).

## What

Add `CustomerDirectoryRepository` (name availability and the Customer list with active-address counts in one read), `CustomerAddressBookRepository` (the address set, the Main-address transition and the last-active-address condition under lock) and `CustomerAwaitingDemandRepository` (one Customer's Unfulfilled orders with Item, Outstanding Quantity, needed-by date and destination) under `shared/domain/repositories/`, registered on `DomainModule`.

## Definition of Done

- [ ] Repository integration tests cover each of the three against the migrated schema.
- [ ] The last-active-address read is proven to take its lock, and a conditional-update transition affecting zero rows is asserted as a refusal rather than a silent success.
- [ ] The awaiting-demand read returns Unfulfilled orders only, omitting Fulfilled and cancelled ones.
- [ ] No repository exposes a private method and none imports a feature module.
- [ ] lint + vet clean.

## Notes

**Hard rule** ([sad.md §5](../sad.md)): persistence entities and persistence-oriented values only — no domain objects cross this boundary. [`data-model.md` § Indexes](../data-model.md) fixes which indexes these reads depend on; do not add one it deliberately rejects.
