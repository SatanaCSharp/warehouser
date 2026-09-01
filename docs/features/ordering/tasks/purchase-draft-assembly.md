---
id: T12
title: 'Build the purchase-drafts domain and draft assembly: lines, links, Pre-receipt Requirements and the state-guarded write path'
layer: 'app'
deps: ['T2', 'T3', 'T5', 'T8']
acs: ['AC-10', 'AC-10a', 'AC-11', 'AC-11a', 'AC-12', 'AC-13']
files_hint:
  [
    'apps/server/src/purchase-drafts/domain/',
    'apps/server/src/purchase-drafts/usecases/',
    'apps/server/src/shared/domain/repositories/purchase-draft-assembly.repository.ts',
    'apps/server/src/shared/domain/repositories/packaging-type-catalogue.repository.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T12 — Build the purchase-drafts domain and draft assembly: lines, links, Pre-receipt Requirements and the state-guarded write path

> **Blocked by:** [T2](./grant-ordering-permissions-migration.md), [T3](./ordering-persistence-entities.md), [T5](./item-catalogue-domain.md), [T8](./customer-order-lifecycle.md) · **Layer:** `app` · **Owner:** Backend Lead · **Estimate:** L
> **Acceptance criteria:** [AC-10](../spec.md), [AC-10a](../spec.md), [AC-11](../spec.md), [AC-11a](../spec.md), [AC-12](../spec.md), [AC-13](../spec.md)

## Why

A draft is assembled over the course of deciding rather than in one submission, and every assembly write must be structurally impossible against a frozen draft. Derives from [spec §5 AC-10/AC-10a/AC-11/AC-11a/AC-12/AC-13](../spec.md), [sad §4 "Freezing is a state-guarded transition"](../sad.md) and [sad §6.6](../sad.md).

## What

- Add `purchase-drafts/domain/`: ordered/link quantity, Value-adding Note, Expected Arrival Date value objects; the mutable-draft predicate; error factories for a frozen draft, an unknown Packaging Type and a cross-Warehouse target.
- Add `PurchaseDraftAssemblyRepository` whose writes resolve a draft **only in the `draft` state** (`UPDATE … WHERE state = 'draft'`), zero affected rows raising a typed refusal.
- Add `PackagingTypeCatalogueRepository` and the catalogue query.
- Add `PurchaseDraftAssemblyService`, the create and revise use cases (add/change/remove a line, add/change/remove a link, set a line's Pre-receipt Requirement) and `purchase-drafts/domain/mappers/`.

## Definition of Done

- [ ] An integration test proves every assembly write affects zero rows against a non-`draft` draft and raises a typed refusal rather than half-applying
- [ ] A test proves a line Item or a linked Customer Order of a different Warehouse is refused with the AC-11 message
- [ ] A test proves a Packaging Type outside the catalogue is refused **naming the four the catalogue offers** (AC-13)
- [ ] A test proves each line's Packaging Type and Value-adding Note are recorded separately and both are shown when the draft is opened (AC-12)
- [ ] A test proves two lines may link to one Customer Order, and that link quantities summing to more or less than the line quantity are recorded **unadjusted and unblocked** (AC-11a)
- [ ] A test proves an Expected Arrival Date may be left unstated at creation (AC-10), and that the draft stays in `Draft` across every revision (AC-10a)
- [ ] lint + vet clean

## Notes

- Deliberately **not** a constraint: a link's stated quantity is never reconciled with the line quantity, the Customer Order or any other link. A database constraint here would contradict the specification (`data-model.md` §Constraints the model deliberately does not express).
- A link claims no demand against another draft — coverage is the member's decision and the system's job is to show them what they are deciding against.
