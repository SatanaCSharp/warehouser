---
id: T10
title: 'Build ConsolidatedDemandRepository as one non-fan-out query and the demand queries over it'
layer: 'app'
deps: ['T3', 'T8']
acs: ['AC-04', 'AC-17a', 'AC-20', 'AC-21a']
files_hint:
  [
    'apps/server/src/shared/domain/repositories/consolidated-demand.repository.ts',
    'apps/server/src/customer-orders/usecases/queries/',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T10 — Build ConsolidatedDemandRepository as one non-fan-out query and the demand queries over it

> **Blocked by:** [T3](./ordering-persistence-entities.md), [T8](./customer-order-lifecycle.md) · **Layer:** `app` · **Owner:** Backend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-04](../spec.md), [AC-17a](../spec.md), [AC-20](../spec.md), [AC-21a](../spec.md)

## Why

The consolidated demand is the answer the whole feature exists to give, and it is derived on every read rather than stored. Derives from [spec §5 AC-04/AC-17a/AC-20/AC-21a](../spec.md), [sad §4 "Derived on read, one query, never materialized"](../sad.md), [sad §6.5](../sad.md) and [data-model §Indexes and §The non-fan-out requirement](../data-model.md).

## What

- Add `ConsolidatedDemandRepository` as **one** purpose-built query joining Customer Orders, Items and link rows — not a composition of table-shaped reads.
- Add the queries: the consolidated demand, the Unfulfilled Customer Orders behind one Demand Line, and the linkable Customer Orders a draft line may name.
- Apply the index design `data-model.md` §Indexes fixes for the demand and coverage aggregations.

## Definition of Done

- [ ] A repository integration test with **many Customer Orders per Item and many links per Customer Order together** proves no double counting — the fan-out case `sad.md` §11 flags, as a correctness test rather than a performance measurement
- [ ] A test proves each Demand Line carries the total Outstanding Quantity, the earliest needed-by date of its Unfulfilled orders, that Item's current On-hand Quantity, and its Coverage references and quantities (AC-04, AC-20)
- [ ] A test proves Fulfilled and cancelled Customer Orders are omitted (AC-04, AC-17a)
- [ ] A test proves a Closed or Discarded draft never presents as Coverage, whichever way it closed, while remaining readable (AC-21a)
- [ ] A test proves a Demand Line covered by two drafts is still offered to a further draft
- [ ] Nothing derived is stored, and no background job exists to repair it
- [ ] lint + vet clean

## Notes

- Returned whole rather than paged at the `spec.md` §1 scale. Outgrowing that scale is the explicit trigger to revisit §6 and introduce paging, not a silent regression.
- The freshness guarantee is structural: there is no second copy to go stale.
