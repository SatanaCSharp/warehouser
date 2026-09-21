---
id: T10
title: 'Add the Receipt Reliability read: two rates with different denominators, six exclusions, and no rate where no line is admissible'
layer: 'infra'
deps: [T8]
acs: ['AC-19', 'AC-20', 'AC-20a', 'AC-20b']
files_hint:
  - 'apps/server/src/shared/domain/repositories/workspace-performance-read.repository.ts'
  - 'apps/server/src/shared/domain/repositories/workspace-performance-read.repository.integration.spec.ts'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T10 — Add the Receipt Reliability read: two rates with different denominators, six exclusions, and no rate where no line is admissible

> **Blocked by:** [T8](./workspace-performance-repository-foundation.md)
> **Satisfies:** AC-19, AC-20, AC-20a, AC-20b — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** L · **Layer:** `infra`

## Why

Receipt Reliability is the heaviest read on either surface, the only one with no period bound, and
the one whose two rates have **different denominators and different Delivery Mode rules** — easy to
get wrong in both directions ([sad.md §6.6](../sad.md),
[data-model.md § The read model](../data-model.md)).

## What

A fourth public method on `WorkspacePerformanceReadRepository`, one statement, per active
Warehouse, over the **whole retained record**:

- **On-time Arrival Rate** — `via_warehouse` lines **only**, judged by
  `(ending_recorded_at AT TIME ZONE $tz)::date <= expected_arrival_date`;
- **Conformance Rate** — instructed lines, **not** restricted by Delivery Mode;
- **quantity received** — `SUM(ending_quantity)` over Via Warehouse lines whose ending recorded
  something, returned as a server-supplied absolute;
- **six exclusion counts** as columns of the same result.

## Definition of Done

- [ ] An **undated** line enters neither part of the on-time rate (AC-20)
- [ ] A line with **no ending** enters neither part — nothing has yet said the goods reached the
      dock (AC-20b)
- [ ] An ending that **recorded nothing received** enters neither part — no arrival happened that
      could be timely or late (AC-20b)
- [ ] A **Direct to Customer** line enters neither part of the on-time rate, **but does** enter the
      Conformance Rate when it carries a verdict (AC-20b, `data-model.md`)
- [ ] An **unrecorded** and a **Not applicable** verdict are excluded from both parts of the
      Conformance Rate rather than counted as having failed (AC-20)
- [ ] Each of the six exclusion counts equals the rows it excludes
- [ ] A Warehouse admitting no line into either rate reports **no rate** — not zero and not one
      hundred (AC-20a)
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Shares a lane with [T8](./workspace-performance-repository-foundation.md) and
[T9](./order-flow-repository-read.md)** (same file).

Both Conformance exclusions are schema-decidable and need no remembered rule:
`chk_purchase_draft_lines_conformance_requires_ending` makes a verdict exist only where an ending
recorded something, and `chk_purchase_draft_lines_pre_receipt_conformance_instruction` makes
`not_applicable` exactly the lines frozen carrying neither a Packaging Type nor a Value-adding Note.

**Risk carried, not solved here:** `spec.md` §6's 900 ms p95 across up to 20 Warehouses cannot be
measured by the PGlite tier. A green integration run is not evidence for it
([sad.md §10](../sad.md)). The withdrawn `purchase_draft_lines (warehouse_id, purchase_draft_id)`
index is the first lever if a real deployment misses the budget.
