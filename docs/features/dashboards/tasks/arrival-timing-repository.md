---
id: T6
title: 'Add the Arrival Timing statement: two never-netted series over nine buckets with four exclusion counts as columns'
layer: 'infra'
deps: [T4, T5]
acs: ['AC-07', 'AC-08', 'AC-08a', 'AC-11']
files_hint:
  - 'apps/server/src/shared/domain/repositories/warehouse-demand-coverage.repository.ts'
  - 'apps/server/src/shared/domain/repositories/warehouse-demand-coverage.repository.integration.spec.ts'
  - 'docs/features/dashboards/spec.md'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T6 — Add the Arrival Timing statement: two never-netted series over nine buckets with four exclusion counts as columns

> **Blocked by:** [T4](./app-timezone-configuration.md) · [T5](./coverage-gap-repository.md)
> **Satisfies:** AC-07, AC-08, AC-08a, AC-11 — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** L · **Layer:** `infra`

## Why

Arrival Timing sets two series that must never be netted beside one another, and its honesty rests
entirely on four exclusion counts — without them the weeks shown read as the whole of what is owed
and on order ([sad.md §6.4](../sad.md), [AC-07](../spec.md), [AC-08a](../spec.md)).

## What

A second public method on `WarehouseDemandCoverageRepository`, one statement:

- **demand** — outstanding quantity on Unfulfilled Customer Orders, bucketed by `needed_by` over one
  Overdue bucket and eight weeks from the week in progress;
- **supply** — drafts standing in `ready_for_ordering` **at read time**, bucketed by
  `expected_arrival_date`, `expected_arrival_date IS NOT NULL`, counting `via_warehouse` lines only;
- **four exclusion columns** of the same result — demand beyond the eighth week with the Customer
  Orders it covers, undated Ready drafts, dated drafts still in `draft`, and drafts since `closed`
  or `discarded`.

Plus the one-line `spec.md` §5 AC-07 amendment recording the late-Ready-draft bucket.

## Definition of Done

- [ ] The two series are returned independently and are never netted against one another
- [ ] A Ready draft whose Expected Arrival Date has already passed lands in the **first bucket**,
      beside the Overdue demand — the `tasks`-gate ruling of 2026-09-21
- [ ] A Direct to Customer line reaches no bucket here while still counting toward Inbound Quantity
      on the Coverage Gap (AC-08)
- [ ] A draft since Closed or Discarded counts toward no week and is stated as its own exclusion
- [ ] Each of the four exclusion counts equals exactly the rows it excludes (AC-08a)
- [ ] `spec.md` §5 AC-07 states which bucket holds a late Ready draft
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Shares a lane with [T5](./coverage-gap-repository.md)** (same file) **and with
[T23](./cross-feature-invariant-amendments.md)** (both edit `spec.md`).

The supply series reads the draft's state **at the moment of the read**, not a historical state: a
draft that has since reached Closed or been Discarded counts toward no week, because its Expected
Arrival Date then describes goods whose ending has been recorded or that will not come.

The difference between this Panel's supply total and the Coverage Gap's Inbound Quantity is exactly
the stated exclusions — that is what makes the two Panels reconcilable side by side.
