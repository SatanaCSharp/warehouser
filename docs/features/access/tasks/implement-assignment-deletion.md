---
id: T7
title: 'Implement member assignment and atomic Role deletion'
layer: 'app'
deps: ['T3', 'T5']
acs: ['AC-08', 'AC-09', 'AC-09a', 'AC-10', 'AC-11', 'AC-12', 'AC-12a', 'AC-19']
files_hint:
  [
    'apps/server/src/access/usecases/commands/assign-member-role.command.ts',
    'apps/server/src/access/usecases/commands/delete-role.command.ts',
    'apps/server/src/access/usecases/member-role-lifecycle.spec.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T7 — Implement member assignment and atomic Role deletion

## Why

[Spec AC-08–AC-12a and AC-19](../spec.md) and [sad.md §6.3](../sad.md) require exactly one Role per member and atomic replacement when deleting an assigned Role.

## What

Implement ordinary custom-Role assignment and Role deletion commands using one complete-use-case transaction, Warehouse-first lock order, same-Warehouse target constraints, and optional replacement only for unassigned Roles.

## Definition of Done

- [ ] Assignment tests prove exactly-one custom Role success and reject manager Role assignment/current-manager reassignment.
- [ ] Tests reject cross-Warehouse member/Role IDs without disclosure.
- [ ] Assigned deletion moves every member and deletes the source in one outcome; unassigned deletion needs no replacement.
- [ ] Injected replacement/deletion failure rolls back all assignments and the Role.
- [ ] Server tests, lint, and static checks pass.

## Notes

The protected manager changes only through T8. Replacement cannot be the source Role.
