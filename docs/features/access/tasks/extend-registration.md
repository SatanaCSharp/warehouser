---
id: T4
title: 'Extend registration with atomic Warehouse provisioning'
layer: 'app'
deps: ['T3']
acs: ['AC-01', 'AC-02', 'AC-02a']
files_hint:
  [
    'packages/contracts/src/auth',
    'apps/server/src/auth/usecases/commands/register.command.ts',
    'apps/server/src/auth/rest',
    'apps/server/src/access/usecases/commands/provision-initial-access.command.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T4 — Extend registration with atomic Warehouse provisioning

## Why

[Spec AC-01–AC-02a](../spec.md) and [sad.md §6.1](../sad.md) require identity, Warehouse access, and initial session to become one indivisible result.

## What

Fold the extended auth contract into its first implementation: add `warehouseName` and immediate access projection, move the transaction boundary around the complete register command, invoke access provisioning by User ID and validated name, and issue the cookie only after commit.

## Definition of Done

- [ ] Shared contract tests cover valid Unicode names and each Warehouse-name rejection rule.
- [ ] Registration integration test observes Account, User, Session, Warehouse, manager Role/grants, and membership after success.
- [ ] Injected failures at every persistence stage leave none of the registration outcome behind.
- [ ] REST test proves no cookie is issued before commit and the safe access projection is returned after success.
- [ ] Contract/server tests, lint, and static checks pass.

## Notes

This task intentionally combines the shared auth contract with its server implementation so the existing statically checked consumers stay green.
