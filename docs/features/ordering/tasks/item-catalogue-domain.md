---
id: T5
title: 'Build the items domain and the Item catalogue: value objects, SKU rules, activation, repository and use cases'
layer: 'app'
deps: ['T2', 'T3']
acs: ['AC-06', 'AC-06b', 'AC-06c', 'AC-06d', 'AC-07', 'AC-07a']
files_hint:
  [
    'apps/server/src/items/domain/',
    'apps/server/src/items/usecases/',
    'apps/server/src/shared/domain/repositories/item-catalogue.repository.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T5 — Build the items domain and the Item catalogue: value objects, SKU rules, activation, repository and use cases

> **Blocked by:** [T2](./grant-ordering-permissions-migration.md), [T3](./ordering-persistence-entities.md) · **Layer:** `app` · **Owner:** Backend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-06](../spec.md), [AC-06b](../spec.md), [AC-06c](../spec.md), [AC-06d](../spec.md), [AC-07](../spec.md), [AC-07a](../spec.md)

## Why

The Item is the first entity the other two name, so it lands first — the ordering [sad §11](../sad.md) recommends so each layer lands against something that already exists. Derives from [spec §5 AC-06/AC-06b/AC-06c/AC-06d/AC-07/AC-07a](../spec.md), [sad §5 `items/*`](../sad.md) and [ADR 0001](../adr/0001-entity-owned-ordering-modules.md).

## What

- Add `items/domain/`: SKU, description, Unit of Measure value objects; the predicates behind SKU correctability and activation; named error factories for a taken SKU, a fixed SKU and an unavailable Item.
- Add `ItemCatalogueRepository` to `shared/domain/repositories/`, answering "is this Item named by any Customer Order **or** any Purchase Draft Line" in **one** query across two tables.
- Add `ItemCatalogueService` and the create / correct / deactivate / reactivate use cases, plus `items/domain/mappers/`.
- Add the Item queries: the Warehouse's Items with on-hand and the latest adjustment reason, and the active-Item picker list.

## Definition of Done

- [ ] Domain unit tests cover SKU format, the correctability predicate and the activation predicates, with no NestJS, HTTP or TypeORM import in `items/domain/`
- [ ] A repository integration test proves the "already named" question is answered in one query across both tables
- [ ] Use-case unit tests against repository doubles prove a duplicate SKU is refused **naming the Item that already holds it**, and that the same SKU is recorded as an unrelated Item in a second Warehouse
- [ ] A test proves a named Item's SKU is refused while an unnamed Item's SKU is still correctable to one unused in that Warehouse
- [ ] A test proves a deactivated Item keeps its SKU taken, drops out of the picker list, and leaves every Customer Order and Purchase Draft Line that names it readable and counting exactly as before
- [ ] A test proves correcting a description or unit of measure leaves every reference naming the same Item
- [ ] lint + vet clean

## Notes

- Merging two Items is out of scope for this release (`spec.md` §8, third question, taking its stated default) — the pick-or-create rule reduces fragmentation without preventing it.
- Overlaps T6 on `items/usecases/`, so `implement` runs them in one lane; T6 depends on this task in any case.
