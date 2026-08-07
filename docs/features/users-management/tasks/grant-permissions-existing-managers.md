---
id: T1
title: 'Promote and apply the Permission-catalogue migration granting USERS:* to existing Warehouse Managers'
layer: 'migration'
deps: []
acs: ['AC-17']
files_hint:
  [
    'docs/features/users-management/migrations/01-grant-users-management-permissions.ts',
  ]
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T1 — Promote and apply the Permission-catalogue migration granting USERS:\* to existing Warehouse Managers

## Why

[spec §AC-17](../spec.md) requires every existing Warehouse Manager Role to directly gain the four
`USERS:*` Permissions. [data-model.md §Migrations](../data-model.md#migrations) already stages the
reversible migration that does this; this task promotes it into the live migration sequence.

## What

Promote the staged
[`01-grant-users-management-permissions.ts`](../migrations/01-grant-users-management-permissions.ts)
into `apps/server/migrations/` following the repository's existing numeric-timestamp naming
convention (see `1785859200000-CreateAccessSchema.ts`). No edits to its logic are expected — it
already inserts the three new `permissions` rows and idempotently grants all four `USERS:*` IDs to
every `role` row with `kind = 'warehouse_manager'`.

## Definition of Done

- [ ] Migration applies cleanly against a fresh and against an already-seeded database.
- [ ] `down` reverts cleanly, removing only the three new `permissions` rows and their
      `role_permissions` grants — `USERS:CREATE`'s pre-existing grants are untouched.
- [ ] An integration test confirms every pre-existing `warehouse_manager` Role holds all four
      `USERS:*` Permissions after `up`.
- [ ] lint + vet clean.

## Notes

This only covers Warehouses that exist before the migration runs. Warehouses registered afterward
are covered separately by [T8](../tasks/grant-permissions-future-managers.md), which updates
`provision-initial-access.command.ts`.
