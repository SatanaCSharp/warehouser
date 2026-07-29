---
id: T1
title: 'Promote and verify the auth schema migration'
layer: 'migration'
deps: []
acs: ['AC-01', 'AC-01b', 'AC-03', 'AC-07', 'AC-08', 'AC-09']
dod: 'The staged auth migration applies and reverts against PostgreSQL, and integration assertions prove the Account/User bijection, normalized-email uniqueness, and Session constraints.'
files_hint: ['docs/features/auth/migrations/01-create-auth-schema.ts']
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T1 — Promote and verify the auth schema migration

## Why

The durable identity and Session constraints derive from [data-model.md](../data-model.md) and support the atomic and revocable flows in [spec AC-01, AC-01b, AC-03, AC-07–AC-09](../spec.md).

## What

Confirm the deployment database has no conflicting out-of-band auth tables, promote the staged migration into the live TypeORM migration location, and verify its forward and reverse behavior. Keep the staged file as the task lane marker consumed by `implement`.

## Definition of Done

- [ ] A PostgreSQL integration test proves the Account/User shared-key bijection, normalized-email uniqueness, 32-byte Session digest, fixed expiry ordering, and revocation ordering.
- [ ] The promoted migration applies and reverts cleanly through the repository migration commands.
- [ ] No runtime synchronization or seed data is introduced.
- [ ] Server lint and static analysis pass.

## Notes

Do not promote until the target database check confirms the fresh-schema assumption in [data-model.md](../data-model.md). The migration path remains serialized by the `migration` layer.
