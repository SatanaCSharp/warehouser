---
id: T2
title: 'Promote the Warehouse re-key and Active Warehouse selection migrations (04–05)'
layer: 'migration'
deps: ['T1']
acs: []
files_hint:
  [
    'docs/features/workspaces/migrations/04-rekey-warehouse-memberships.ts',
    'docs/features/workspaces/migrations/05-add-active-warehouse-selection.ts',
    'apps/server/migrations/',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T2 — Promote the Warehouse re-key and Active Warehouse selection migrations (04–05)

## Why

Making a Warehouse membership identified by the pair of User and Warehouse is the schema half of
[spec §1](../spec.md#1-context)'s central change, and the Active Warehouse column is where
[sad §4](../sad.md#4-solution-strategy)'s server-persisted presentation state lives. Both are
sequenced after `02` because they reference `users(id, workspace_id)`, per
[data-model.md §Staged migrations](../data-model.md#staged-migrations).

## What

Promote both staged files into live `apps/server/migrations/` with real timestamps:

- `04` — assert `warehouse_memberships` is empty, swap the primary key to
  `(user_id, warehouse_id)`, add `workspace_id`, replace the two plain foreign keys with the
  Workspace-carrying composites, and add `idx_warehouse_memberships_workspace_user`. Preserve the
  existing `uq_warehouse_memberships_one_manager` partial unique index and the same-Warehouse Role
  foreign key untouched.
- `05` — add `users.active_warehouse_id` with its raw-SQL column-list
  `ON DELETE SET NULL (active_warehouse_id)` composite reference against the new membership key.

## Definition of Done

- [ ] Both migrations apply and revert cleanly against the development database, after `01`–`03`.
- [ ] `warehouse_memberships` ends keyed by `(user_id, warehouse_id)` with both Workspace-carrying
      composite foreign keys, and the one-Manager-per-Warehouse uniqueness still rejects a second
      Manager row.
- [ ] Integration check: deleting a `warehouse_memberships` row nulls only that User's
      `active_warehouse_id` and never touches `users.id`.
- [ ] `04.up`, `04.down` and `05` throw the documented rollback-and-replay message rather than
      backfilling or re-keying data when their table is non-empty.
- [ ] lint + build clean.

## Notes

`05` uses raw SQL deliberately: TypeORM's `OnDeleteType` union has no column-list form, and without
the column list PostgreSQL would attempt to null `users.id` as well
([data-model.md §Staged migrations](../data-model.md#staged-migrations)). These migrations are
reversible as _schema_, not as _data_ — that is exactly what [spec §1](../spec.md#1-context)'s
fourth boundary authorizes.
