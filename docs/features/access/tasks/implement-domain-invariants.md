---
id: T2
title: 'Implement access domain invariants and Unicode names'
layer: 'domain'
deps: []
acs:
  [
    'AC-02a',
    'AC-03',
    'AC-04',
    'AC-05',
    'AC-06',
    'AC-06a',
    'AC-06b',
    'AC-07',
    'AC-09',
    'AC-09a',
    'AC-10',
    'AC-11',
    'AC-12a',
    'AC-13',
    'AC-14',
    'AC-14a',
  ]
files_hint: ['apps/server/src/access/domain']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T2 — Implement access domain invariants and Unicode names

## Why

The framework-free access model owns the rules described in [spec.md §5](../spec.md), [sad.md §5](../sad.md), and the validation strategy in [data-model.md](../data-model.md).

## What

Add Warehouse, Role, Permission membership, access principal, typed errors, lifecycle predicates/services, mappers' domain inputs, and a shared Warehouse/Role name value object using `Intl.Segmenter` grapheme segmentation.

## Definition of Done

- [ ] Unit tests cover trimming, 1–100 graphemes, control/format rejection, Unicode preservation, exact case-sensitive duplicate behavior, and differently normalized names.
- [ ] Unit tests cover assignable/reserved Permissions, protected Role mutation, ordinary manager assignment, Role replacement, and manager-transfer preconditions.
- [ ] Domain code imports no NestJS, HTTP, or TypeORM modules.
- [ ] Server lint and static checks pass.

## Notes

Do not normalize submitted Unicode. Protected status comes from Role kind, never display name.
