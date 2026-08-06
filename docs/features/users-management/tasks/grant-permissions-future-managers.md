---
id: T8
title: 'Grant the new Permissions to future Warehouse Managers via provision-initial-access'
layer: 'app'
deps: ['T7']
acs: ['AC-17']
files_hint:
  [
    'apps/server/src/access/usecases/commands/provision-initial-access.command.ts',
  ]
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T8 — Grant the new Permissions to future Warehouse Managers via provision-initial-access

## Why

[data-model.md §Non-schema follow-ups](../data-model.md#non-schema-follow-ups-not-this-stages-deliverable-flagged-for-tasks)
flags that [T1](./grant-permissions-existing-managers.md)'s migration only fixes Warehouses that
already exist — `provision-initial-access.command.ts`'s `MANAGER_PERMISSION_IDS` constant must also
gain the three new IDs, or a Warehouse registered after this feature ships would not receive them,
silently reopening AC-17.

## What

Add `USERS:EMAIL_UPDATE`, `USERS:PASSWORD_CHANGE`, `USERS:DELETE` (via the `PermissionId` enum from
[T7](./users-contracts-and-shared-types.md)) to `MANAGER_PERMISSION_IDS` in
`access/usecases/commands/provision-initial-access.command.ts`.

## Definition of Done

- [ ] An integration test registers a new Warehouse (via the existing registration flow) and
      confirms its Warehouse Manager Role holds all four `USERS:*` Permissions immediately, without
      relying on [T1](./grant-permissions-existing-managers.md)'s migration having run.
- [ ] `access`'s existing registration test suite stays green.
- [ ] lint + vet clean.

## Notes

This is a one-line addition to an existing `access`-owned constant — not a `users` module change.
`sad §3` confirms `access`'s own Role CRUD/assignment/transfer capabilities are otherwise unchanged.
