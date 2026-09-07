---
id: T6
title: 'Extend PurchaseDraftReadRepository so each line carries its Rejections, its conformance and the derived Accepted and Rejected Quantities in one query'
layer: 'infra'
deps: [T3]
acs: ['AC-21', 'AC-22', 'AC-23', 'AC-23a']
files_hint:
  - 'apps/server/src/shared/domain/repositories/purchase-draft-read.repository.ts'
  - 'apps/server/src/shared/domain/repositories/purchase-draft-read.repository.integration.spec.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T6 — Extend PurchaseDraftReadRepository with the condition breakdown

## Why

AC-21 needs each line's whole account — ordered, presented, accepted, rejected, and each refused
quantity beside its Reason, description, Source and Disposition — and [sad.md §8](../sad.md) keeps the
250 ms read budget honest only if that account is built in the query that already assembles the line's
links and drift, not in a second one. Derives from [sad.md §6.3](../sad.md) and
[data-model.md §Derived quantities](../data-model.md).

## What

Join each line's Rejections and its Pre-receipt Conformance into the correlated per-line aggregation
the drift and by-line reads already build, and derive the Rejected Quantity (`SUM(quantity)` over the
line's Rejections) and the Accepted Quantity (`ending_quantity − COALESCE(that sum, 0)`) inside that
same query. A Rejection carries its Reason **identifier**; nothing copies the Reason's wording.

The repository returns the full row set. **Choosing which of the four shapes to present is T12's job,
not this one's** — but the withheld shape is built by _not selecting_ the withheld columns, so this
repository must expose the projection in a form T12 can narrow at the query, never one T12 has to
fetch and then delete from.

## Definition of Done

- [ ] Each line in the draft read and the by-line read carries its Rejections, its conformance verdict
      and note, and the derived Accepted and Rejected Quantities.
- [ ] An assertion proves the Rejections and the derived figures come from the **same** query as the
      links and drift — the statement count for a draft read is unchanged from today.
- [ ] The Reason is carried as its identifier; a test extends the catalogue after a Rejection is
      recorded and proves the read is unchanged (AC-23a).
- [ ] The frozen `packaging_type_id` on the line is what the read carries, not a current reading of
      the Packaging Type catalogue (AC-23).
- [ ] An integration test proves a line whose ending predates this release returns `NULL` conformance,
      **no** Rejections, and an Accepted Quantity equal to its ending quantity — the absent case
      [spec.md §5](../spec.md) never describes ([sad.md §7](../sad.md)).
- [ ] An `EXPLAIN` assertion proves the per-line Rejection fetch uses
      `uq_purchase_draft_line_rejections_line_reason` rather than a sequential scan.
- [ ] A shape exists in which the Rejection columns are **not selected at all**, so T12 can build
      AC-22's withheld form without fetching and deleting.
- [ ] `pnpm --filter @warehouser/server test`, `test:integration`, `lint` and `build` are green.

## Notes

**Hard rule** ([spec.md §6.1](../spec.md) abuse cases, [sad.md §4](../sad.md)): redaction is achieved
by **not selecting** the withheld columns, never by fetching and deleting them. Do not add a
`rejectionCount` or any materialized total — [data-model.md §Security](../data-model.md) records its
absence as deliberate, because it would be exactly the probeable placeholder AC-22 forbids.

Neither prose column may appear in an index or a unique constraint, so neither can leak through a
constraint-violation message ([data-model.md §Security](../data-model.md)).
