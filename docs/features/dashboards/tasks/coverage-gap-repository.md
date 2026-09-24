---
id: T5
title: 'Add WarehouseDemandCoverageRepository with the Coverage Gap statement: four independently grouped CTEs joined on item_id'
layer: 'infra'
deps: [T4]
acs: ['AC-03', 'AC-04', 'AC-05', 'AC-06', 'AC-06a', 'AC-08', 'AC-11', 'AC-25']
files_hint:
  - 'apps/server/src/shared/domain/repositories/warehouse-demand-coverage.repository.ts'
  - 'apps/server/src/shared/domain/repositories/warehouse-demand-coverage.repository.integration.spec.ts'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T5 — Add WarehouseDemandCoverageRepository with the Coverage Gap statement: four independently grouped CTEs joined on item_id

> **Blocked by:** [T4](./app-timezone-configuration.md)
> **Satisfies:** AC-03, AC-04, AC-05, AC-06, AC-06a, AC-08, AC-11, AC-25 — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** L · **Layer:** `infra`

## Why

The Coverage Gap is the feature's thesis Panel and the one where the aggregation defect is easiest
to ship: AC-06a forbids any quantity being multiplied by the row count beside it, which is exactly
what a naive join across two one-to-many relationships produces
([sad.md §6.3](../sad.md), [data-model.md § The read model](../data-model.md)).

## What

`WarehouseDemandCoverageRepository` in `shared/domain/repositories/`, with its first public method
issuing **one statement, four CTEs, joined on `item_id`**:

- `outstanding` — `SUM(outstanding_quantity)` over `customer_orders` where
  `warehouse_id = $1 AND state = 'unfulfilled'`, grouped by `item_id`;
- `inbound` — `SUM(ordered_quantity)` over `purchase_draft_lines` joined to `purchase_drafts` where
  the draft's `state IN ('draft','ready_for_ordering')`, grouped by `item_id`, **both** Delivery
  Modes;
- `on_hand` — `items.on_hand_quantity`, read directly, `deactivated_at` applied as no filter;
- the outer select — `GREATEST(outstanding - on_hand - inbound, 0)`, ordered by uncovered desc,
  total outstanding desc, `sku` asc, ten rows kept, a second CTE rolling the remainder into one row
  with its Item count.

## Definition of Done

- [ ] **The headline case:** an Item with several Unfulfilled Customer Orders **and** several open
      Purchase Draft Lines reports the same quantities as an Item with one of each (AC-06a)
- [ ] A cancelled Customer Order's retained outstanding quantity contributes nothing (AC-04)
- [ ] A deactivated Item is shown with its quantities exactly as an active one (AC-25)
- [ ] Both Delivery Modes count toward Inbound Quantity (AC-08)
- [ ] A Closed or Discarded draft counts nothing (AC-11)
- [ ] Inbound is read from the line's ordered quantity, never from a link's stated quantity (AC-06)
- [ ] A fully covered Item reports nothing uncovered, not a negative, and sorts below every
      uncovered Item (AC-05)
- [ ] The eleventh Item onward is one Remainder Row stating its Item count; the order is stable
      across two reads of the same Warehouse (AC-03)
- [ ] No private method, no import from a feature module, persistence-oriented values in and out
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Shares a lane with [T6](./arrival-timing-repository.md)** — both are methods of this repository
file, so `implement` serializes them.

No `customer_id`, `customer_delivery_address_id`, `customer_name` or `frozen_customer_name` appears
in any column list, `GROUP BY` or join condition ([data-model.md § Security](../data-model.md)).

Hard rule: the bucket axes and the flooring belong to the SQL. A repository that returned rows the
use case then aggregated in memory would break both the performance shape and
`spec.md` §6's row-bounding target.
