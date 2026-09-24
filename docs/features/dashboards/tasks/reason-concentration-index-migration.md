---
id: T1
title: 'Promote the Reason Concentration index migration onto the populated rejection relation'
layer: 'migration'
deps: []
acs: ['AC-12']
files_hint:
  - 'docs/features/dashboards/migrations/01-add-reason-concentration-index.ts'
  - 'apps/server/migrations/'
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T1 — Promote the Reason Concentration index migration onto the populated rejection relation

> **Blocked by:** —
> **Satisfies:** AC-12 — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** S · **Layer:** `migration`

## Why

Reason Concentration groups `purchase_draft_line_rejections` by `rejection_reason_id` under a
`warehouse_id` predicate, and that relation carries exactly one index today —
`uq_purchase_draft_line_rejections_line_reason`, led by `purchase_draft_line_id` — so a
Warehouse-wide read has **no access path at all**. `arrival-inspection` deferred this index in as
many words until "a product surface filters by Reason"; this is that surface
([data-model.md § Why the one new index](../data-model.md), [AC-12](../spec.md)).

## What

Promote the staged migration into the live tree by rename only:

- [`migrations/01-add-reason-concentration-index.ts`](../migrations/01-add-reason-concentration-index.ts)
  → `apps/server/migrations/1786900000000-AddReasonConcentrationIndex.ts`.

The class name already carries that timestamp, which sorts after
`1786800100000-GrantArrivalInspectionPermissions`. No shipped migration is edited and no entity
changes, so `shared/database/entities.ts` and `entity-registry.architectural.spec.ts` are untouched.

## Definition of Done

- [ ] The staged file is promoted under its timestamped name with its contents unedited
- [ ] `up` creates `idx_purchase_draft_line_rejections_warehouse_reason` on
      `(warehouse_id, rejection_reason_id)`; `down` drops it and leaves every seeded Rejection intact
- [ ] Applies and reverts cleanly against a database already holding Rejection rows, then replays
- [ ] No shipped migration file appears in the diff
- [ ] `pnpm --filter @warehouser/server test:integration` clean
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

`CREATE INDEX` — not `CREATE INDEX CONCURRENTLY`, which cannot run inside the transaction every
migration here runs in — takes a `SHARE` lock on the relation for the build, blocking a Rejection
being raised or amended. Measured at 11.6 ms over 19 306 rows, which extrapolates to under a second
at roughly 1.5 million Rejections; past that size the index comes out of the migration and is built
by hand ([data-model.md § Safe evolution](../data-model.md)).

**Never run `migration:generate`** in this repository — against the shipped entities it emits a
migration dropping every `chk_*` constraint, every column `DEFAULT` and every `C` collation.
