---
id: T2
title: 'Promote the delivery-destinations migration: 14 columns across five shipped relations, with the Via Warehouse and ending-attribution backfills'
layer: 'migration'
deps: [T1]
acs: ['AC-11', 'AC-11a', 'AC-13', 'AC-16', 'AC-19', 'AC-24']
files_hint:
  - 'docs/features/delivery-addresses/migrations/02-add-delivery-destinations.ts'
  - 'apps/server/migrations/'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T2 — Promote the delivery-destinations migration: 14 columns across five shipped relations, with the Via Warehouse and ending-attribution backfills

## Why

This is the part `ordering` never had to do: two columns become mandatory against rows that already exist. [`data-model.md`](../data-model.md) § Safe evolution requires expand / backfill / contract for both, and [sad.md §11](../sad.md) names the backfill as the one migration risk in this feature. Derives from [sad.md §7 Data](../sad.md).

## What

Promote [`02-add-delivery-destinations.ts`](../migrations/02-add-delivery-destinations.ts) as `1786700100000-AddDeliveryDestinations.ts`: 14 added columns and 1 rename across `customer_orders`, `purchase_draft_lines`, `purchase_draft_demand_snapshots`, `purchase_drafts` and `warehouses`, 2 backfills, 13 checks added and 2 replaced, 5 foreign keys and 1 partial index. `delivery_mode` is added nullable, backfilled to `via_warehouse`, given that value as its `DEFAULT`, and only then made `NOT NULL`; the per-line ending attribution is backfilled from each draft's `arrival_confirmed_*` columns before its check is added.

## Definition of Done

- [ ] The migration applies against a development database that **holds pre-existing rows**, not an empty one.
- [ ] Every pre-existing `purchase_draft_lines` row reads `delivery_mode = via_warehouse` before the column is made `NOT NULL`.
- [ ] `customer_orders.customer_name` drops `NOT NULL` and every existing row satisfies `chk_customer_orders_customer_identity` on its typed-name side.
- [ ] The `down` path is **executed**, not reasoned about: both data repairs run and the revert completes without aborting part-way.
- [ ] lint + vet clean.

## Notes

A line carrying a quantity whose draft has no arrival attribution makes `ADD CONSTRAINT chk_purchase_draft_lines_ending_attribution` fail — [`data-model.md`](../data-model.md) states that is **deliberate and loud**, not a case to repair silently. The revert's cost is stated in § What a revert costs and must be re-read before running it: an order that named a Customer becomes indistinguishable from a typed-name one afterwards.
