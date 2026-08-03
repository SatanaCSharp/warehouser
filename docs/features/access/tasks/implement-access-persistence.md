---
id: T3
title: 'Implement access persistence entities and repositories'
layer: 'infra'
deps: ['T1', 'T2']
acs:
  [
    'AC-01',
    'AC-02',
    'AC-06',
    'AC-08',
    'AC-10',
    'AC-11',
    'AC-12',
    'AC-12a',
    'AC-13',
    'AC-16',
    'AC-20',
    'AC-21',
  ]
files_hint:
  [
    'apps/server/src/shared/domain/entities',
    'apps/server/src/shared/domain/repositories/access',
    'apps/server/src/access/domain/mappers',
    'apps/server/src/test/factories/access.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T3 — Implement access persistence entities and repositories

## Why

The specialized repositories in [sad.md §5](../sad.md) implement the scoped queries, lock order, and transaction behavior fixed by [data-model.md](../data-model.md).

## What

Add TypeORM entities, domain mappers, access-principal/read/lifecycle/manager-transfer/provisioning repositories, and synthetic integration fixtures. Keep mapping above repository boundaries and constrain target operations by both ID and Warehouse.

## Definition of Done

- [ ] Integration tests prove fresh principal resolution and bounded deterministic Warehouse-scoped reads.
- [ ] Integration tests prove same-Warehouse assignment, atomic assigned-Role replacement, and provisioning rollback.
- [ ] Concurrent transfer test proves the Warehouse-first lock order and exactly one manager.
- [ ] Repositories expose no TypeORM query builders and import no `access` domain code.
- [ ] Server tests, lint, and static checks pass.

## Notes

This task starts after both schema and domain foundations. Cross-Warehouse IDs must remain indistinguishable from unavailable targets.
