---
id: T5
title: 'Implement TypeORM auth persistence adapters'
layer: 'infra'
deps: ['T1', 'T3']
acs: ['AC-01', 'AC-01b', 'AC-03', 'AC-04', 'AC-07', 'AC-08', 'AC-09']
dod: 'PostgreSQL integration tests prove atomic registration commit and rollback, concurrent normalized-email uniqueness, valid-session lookup, and idempotent revocation without leaking TypeORM types.'
files_hint:
  [
    'apps/server/src/auth/infrastructure/persistence',
    'apps/server/src/test/factories',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T5 — Implement TypeORM auth persistence adapters

## Why

Persistence must implement the ports from T3 and the exact records, constraints, and transaction behavior in [data-model.md](../data-model.md).

## What

Add private TypeORM records/mappers, atomic registration and Session repository adapters, database-error translation, and focused test factories. Apply validity predicates server-side during digest lookup.

## Definition of Done

- [ ] PostgreSQL tests prove full registration commit and rollback with no orphan Account, User, or Session.
- [ ] A concurrency test proves case-variant duplicate registration is decided by the unique constraint and maps to the duplicate outcome.
- [ ] Repository tests prove valid lookup, expiry/revocation rejection, and idempotent current-digest revocation.
- [ ] TypeORM types do not cross the adapter boundary; server test, lint, and static analysis pass.

## Notes

Use the promoted migration from T1; do not recreate schema through runtime synchronization.
