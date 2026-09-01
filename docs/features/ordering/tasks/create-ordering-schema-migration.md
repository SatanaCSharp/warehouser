---
id: T1
title: 'Stage the ordering schema migration: nine relations, their constraints and indexes, and the Packaging Type seed'
layer: 'migration'
deps: []
acs: ['AC-07', 'AC-07a', 'AC-09', 'AC-13']
files_hint: ['docs/features/ordering/migrations/01-create-ordering-schema.ts']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T1 — Stage the ordering schema migration: nine relations, their constraints and indexes, and the Packaging Type seed

> **Blocked by:** — (can start immediately) · **Layer:** `migration` · **Owner:** Backend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-07](../spec.md), [AC-07a](../spec.md), [AC-09](../spec.md), [AC-13](../spec.md)

## Why

Nothing else in the feature can be written against a schema that does not exist. Derives from [data-model §Entities](../data-model.md) and [§Migrations](../data-model.md), [sad §7 Data](../sad.md), and the constraints behind [spec §5 AC-07/AC-07a/AC-09/AC-13](../spec.md).

## What

- Promote the staged pair [`migrations/01-create-ordering-schema.ts`](../migrations/01-create-ordering-schema.ts) into `apps/server/migrations/`, keeping the class name and timestamp.
- The nine relations, their check constraints, unique constraints, composite Warehouse references and the indexes `data-model.md` §Indexes names.
- The four-row Packaging Type seed, which is catalogue data extended only by migration.
- No shipped migration is edited and no existing table, key or constraint is altered.

## Definition of Done

- [ ] The staged migration is promoted into the live `apps/server/migrations/` and applies cleanly against the development database
- [ ] `down` fully reverses `up`, verified by applying and reverting against that same database
- [ ] A repository integration test proves a SKU is unique per Warehouse and that the same SKU is accepted in a second Warehouse
- [ ] A repository integration test proves the non-negative whole-quantity checks reject a negative and a fractional value
- [ ] The four Packaging Type rows are present with the identifiers `spec.md` AC-13 fixes
- [ ] lint + vet clean

## Notes

- Forward-only and assumes no pre-existing rows, which is true by construction — none of these relations exists, so no expand/backfill/contract sequence is warranted (`data-model.md` §Migrations).
- Every index is created on an empty table in the same migration, so no `CREATE INDEX CONCURRENTLY` is used.
- `layer: migration` — `implement` serializes this with T2 as an ordered migration sequence.
