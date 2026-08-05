---
id: T1
title: 'Promote the access schema and Permission catalogue migration'
layer: 'migration'
deps: []
acs:
  [
    'AC-01',
    'AC-02',
    'AC-03',
    'AC-04',
    'AC-05',
    'AC-07',
    'AC-08',
    'AC-10',
    'AC-13',
    'AC-18',
    'AC-20',
    'AC-21',
  ]
files_hint: ['docs/features/access/migrations/01-create-access-schema.ts']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T1 — Promote the access schema and Permission catalogue migration

## Why

The storage and concurrency constraints defined by [data-model.md](../data-model.md) backstop the lifecycle invariants in [spec.md §5](../spec.md) and [sad.md §6](../sad.md).

## What

Promote the staged migration into the live server migration sequence without changing its modeled schema. Verify tables, indexes, composite foreign keys, exact-name uniqueness, protected-manager uniqueness, and the nine initial Permission records in both directions.

## Definition of Done

- [ ] Migration integration test verifies schema constraints and initial Permission identifiers/kinds.
- [ ] Migration applies and reverts cleanly against a database at the current auth schema.
- [ ] The precondition that no existing production Users require backfill is documented in the migration check.
- [ ] Server lint and static checks pass.

## Notes

Use the staged file named in `files_hint`; `implement` promotes it to a timestamped live migration. Do not add non-transactional migration steps or real-looking identities.
