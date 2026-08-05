---
id: T6
title: 'Implement custom Role lifecycle commands'
layer: 'app'
deps: ['T3', 'T5']
acs: ['AC-03', 'AC-04', 'AC-05', 'AC-06', 'AC-06a', 'AC-06b', 'AC-07', 'AC-19']
files_hint:
  [
    'apps/server/src/access/usecases/commands/create-role.command.ts',
    'apps/server/src/access/usecases/commands/update-role.command.ts',
    'apps/server/src/access/usecases/role-lifecycle.spec.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T6 — Implement custom Role lifecycle commands

## Why

Custom Role writes in [spec AC-03–AC-07 and AC-19](../spec.md) belong to the command boundary defined by [sad.md §5](../sad.md).

## What

Implement create and update commands that accept `AccessPrincipal`, apply domain name/catalogue/protected-Role rules, scope every lookup to the actor Warehouse, and replace Permission membership including an empty set.

## Definition of Done

- [ ] Command tests cover create, rename, Permission replacement, and empty membership success.
- [ ] Tests cover exact duplicate names, invalid/reserved/unknown Permissions, protected Role mutation, cross-Warehouse targets, and missing authority.
- [ ] Every rejected operation leaves the Role and assignments unchanged.
- [ ] Server tests, lint, and static checks pass.

## Notes

Permission labels and identifiers are never user-mutable. Authorization uses the principal, not a client Warehouse ID.
