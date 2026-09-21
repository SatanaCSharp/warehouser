---
id: T9
title: 'Add the Order Flow read: twelve pooled weeks keyed on the recording week, with the allocation aggregate in its own CTE'
layer: 'infra'
deps: [T8]
acs: ['AC-04', 'AC-06a', 'AC-16', 'AC-17', 'AC-17a']
files_hint:
  - 'apps/server/src/shared/domain/repositories/workspace-performance-read.repository.ts'
  - 'apps/server/src/shared/domain/repositories/workspace-performance-read.repository.integration.spec.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T9 — Add the Order Flow read: twelve pooled weeks keyed on the recording week, with the allocation aggregate in its own CTE

> **Blocked by:** [T8](./workspace-performance-repository-foundation.md)
> **Satisfies:** AC-04, AC-06a, AC-16, AC-17, AC-17a — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** M · **Layer:** `infra`

## Why

Order Flow is the one Panel that reports the Workspace's own trend rather than setting its
Warehouses beside one another, and the one figure that legitimately counts a cancelled Customer
Order. Three acceptance criteria turn on which week a quantity lands in
([sad.md §6.6](../sad.md), [data-model.md § The read model](../data-model.md)).

## What

A third public method on `WorkspacePerformanceReadRepository`: twelve weeks pooled across the
Workspace's active Warehouses, naming no Warehouse, in one statement.

- bucketed by `date_trunc('week', created_at AT TIME ZONE $tz)` over
  `created_at >= twelve weeks ago`;
- **every** Customer Order state including cancelled — the one read that does;
- each week's whole is `quantity` **as it stands now**;
- the assigned part is `SUM(arrival_allocations.allocated_quantity)` in **its own CTE grouped by
  `customer_order_id`**, joined back, so it lands in the order's recording week;
- the withdrawn part is a cancelled order's retained `outstanding_quantity`.

## Definition of Done

- [ ] A Customer Order satisfied by goods arriving on three separate occasions in three later
      weeks reports all three assignments against **its own recording week** and places nothing in
      the three arrival weeks (AC-17)
- [ ] A Customer Order with three allocations reports the same recorded quantity as one with none
      (AC-06a)
- [ ] A Customer Order amended upward eight weeks ago reports the **current** quantity in its old
      week (AC-17a)
- [ ] A cancelled Customer Order contributes to its Order Flow week and to **no** owed figure
      anywhere else on either surface (AC-04, AC-16)
- [ ] The withdrawn part is read from `outstanding_quantity`, never from the whole `quantity` —
      stating the whole would double-count the part already allocated
- [ ] No Warehouse identifier appears in the result
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Shares a lane with [T8](./workspace-performance-repository-foundation.md) and
[T10](./receipt-reliability-repository-read.md)** (same file).

The figure is named **quantity assigned**, never _orders fulfilled_ — no record states when a
Customer Order was satisfied, and claiming one would be the kind of dispute `spec.md` §7 says costs
more trust than the surface earns in a quarter.

`chk_customer_orders_state_outstanding` keeps the quantity a cancellation left uncovered, which is
why the retained `outstanding_quantity` is the only reading the schema supports.
