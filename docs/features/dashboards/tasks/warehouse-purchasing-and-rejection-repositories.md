---
id: T7
title: 'Add the Purchasing Pipeline and Reason Concentration repositories, one statement each'
layer: 'infra'
deps: [T1, T4]
acs: ['AC-10', 'AC-11', 'AC-12']
files_hint:
  - 'apps/server/src/shared/domain/repositories/warehouse-purchasing-read.repository.ts'
  - 'apps/server/src/shared/domain/repositories/warehouse-purchasing-read.repository.integration.spec.ts'
  - 'apps/server/src/shared/domain/repositories/warehouse-rejection-read.repository.ts'
  - 'apps/server/src/shared/domain/repositories/warehouse-rejection-read.repository.integration.spec.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T7 — Add the Purchasing Pipeline and Reason Concentration repositories, one statement each

> **Blocked by:** [T1](./reason-concentration-index-migration.md) · [T4](./app-timezone-configuration.md)
> **Satisfies:** AC-10, AC-11, AC-12 — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** M · **Layer:** `infra`

## Why

Two single-Permission Panels, neither a conjunction, each one statement over one relation. Reason
Concentration is the sole consumer of the index [T1](./reason-concentration-index-migration.md)
adds ([sad.md §6.5](../sad.md)).

## What

Two repositories in `shared/domain/repositories/`:

- `WarehousePurchasingReadRepository` — counts `purchase_drafts`, **never quantities**, grouped by
  `state` and by a `CASE` over an age derived from **two different columns in one statement**:
  `created_at` for a Draft, `readied_at` for a Ready for Ordering draft. `state IN
('draft','ready_for_ordering')` only.
- `WarehouseRejectionReadRepository` — sums `purchase_draft_line_rejections.quantity` grouped by
  `rejection_reason_id` under the Warehouse predicate, ordered by refused quantity descending, with
  the running share as a **window function** over that order. Both Rejection Sources counted.
  Undecided quantity and Customer-reported quantity as **two independent columns**. Reasons beyond
  the tenth rolled into one row with its Reason count.

## Definition of Done

- [ ] A draft readied yesterday after a month in Draft reads as a **day** old (AC-10)
- [ ] All four Age Bands are produced by the statement, not by the caller
- [ ] A Closed or Discarded draft is counted nowhere (AC-11)
- [ ] A Rejection that is both Undecided **and** Customer-reported appears once in the bar and once
      in each column — never double-counted (AC-12)
- [ ] Both Rejection Sources count toward the bar
- [ ] No Remainder Row is emitted while nothing has been gathered into it
- [ ] `EXPLAIN` shows `idx_purchase_draft_line_rejections_warehouse_reason` is used
- [ ] Neither class has a private method or imports a feature module
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

The Direct to Customer exclusion that governs the dock figures **does not govern this one**: a
Warehouse's Rejections are its own wherever the goods were refused
([CONTEXT.md § Invariants](../CONTEXT.md)).

`chk_purchase_draft_line_rejections_source_matches_mode` makes `source` a function of
`delivery_mode`, so AC-12's "refused by the end customer" is decidable from `delivery_mode`, which
is already on the Rejection row — no join to the line is needed.

The Rejection's `description` is member prose and is never read by this feature.
