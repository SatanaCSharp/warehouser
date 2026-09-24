---
id: T8
title: 'Add WorkspacePerformanceReadRepository with the active-Warehouse scope, Demand Pressure and Purchasing Spread'
layer: 'infra'
deps: [T4]
acs: ['AC-14', 'AC-18']
files_hint:
  - 'apps/server/src/shared/domain/repositories/workspace-performance-read.repository.ts'
  - 'apps/server/src/shared/domain/repositories/workspace-performance-read.repository.integration.spec.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T8 — Add WorkspacePerformanceReadRepository with the active-Warehouse scope, Demand Pressure and Purchasing Spread

> **Blocked by:** [T4](./app-timezone-configuration.md)
> **Satisfies:** AC-14, AC-18 — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** M · **Layer:** `infra`

## Why

All four Workspace Panels share one scope — the Workspace's **active** Warehouses — and every one
of them reports the archived count as a field of its own. Getting that scope's binding wrong costs
the index on every subsequent read ([sad.md §6.6](../sad.md),
[data-model.md § Indexes](../data-model.md)).

## What

`WorkspacePerformanceReadRepository` in `shared/domain/repositories/`, with the shared scope and the
two simplest Panels:

- the scope — `warehouses WHERE workspace_id = $1 AND archived_at IS NULL`, resolved once and bound
  to every read as an explicit `warehouse_id = ANY($1::uuid[])`;
- **Demand Pressure** — outstanding quantity per Warehouse on Unfulfilled Customer Orders, split
  into Overdue / due soon (the next fourteen days) / due later, as absolute quantities;
- **Purchasing Spread** — draft counts per Warehouse across **all four** states, the one read that
  counts `closed` and `discarded`.

## Definition of Done

- [ ] The active-Warehouse set is bound as an explicit `uuid[]`, **never** as a correlated
      subquery — `EXPLAIN` shows `idx_customer_orders_warehouse_created` with both columns in the
      index condition
- [ ] An archived Warehouse appears in no row and in every archived count
- [ ] Demand Pressure returns quantities, not shares (AC-14)
- [ ] The Urgency Band boundaries fall where `APP_TIMEZONE` puts them, asserted from both sides of
      a boundary
- [ ] Purchasing Spread returns a count for every Warehouse × state pairing including the empty
      ones (AC-18)
- [ ] No private method, no import from a feature module
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Opens a lane shared with [T9](./order-flow-repository-read.md) and
[T10](./receipt-reliability-repository-read.md)** — all three are methods of this file.

_Measured:_ written as `warehouse_id IN (SELECT id FROM warehouses WHERE …)` the planner seq-scans
`customer_orders`; written as `= ANY($1::uuid[])` over the already-resolved set it uses the index.
The set is read anyway, so binding it costs nothing.

Purchasing Spread is the **one** Panel on either surface that counts a draft the open-state rule
excludes everywhere else. It is named here precisely so that invariant stays scoped to the Warehouse
Panel it was written for.
