---
id: T1
title: 'Promote the Workspace authority schema migrations (01–03)'
layer: 'migration'
deps: []
acs: ['AC-35']
files_hint:
  [
    'docs/features/workspaces/migrations/01-create-workspace-authority-schema.ts',
    'docs/features/workspaces/migrations/02-add-workspace-relations.ts',
    'docs/features/workspaces/migrations/03-create-workspace-memberships.ts',
    'apps/server/migrations/',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T1 — Promote the Workspace authority schema migrations (01–03)

## Why

The whole feature stands on the relations in
[data-model.md §Entities](../data-model.md#entities) and its
[§Staged migrations](../data-model.md#staged-migrations) table. AC-35 additionally requires the
Workspace Permission catalogue to be release-managed — extended by a migration with no person
acting — so the seeding shape established here is the pattern every later capability follows.

## What

Promote the three staged files into live `apps/server/migrations/` with real timestamps, keeping
their `up`/`down` bodies as designed:

- `01` — `workspaces`, `workspace_permissions` plus the sixteen-row catalogue with its
  `assignable | reserved` classification, `workspace_roles`, `workspace_role_permissions`, and the
  unique indexes `uq_workspace_roles_workspace_name`, `uq_workspace_roles_id_kind`,
  `uq_workspace_roles_id_workspace_kind`, `uq_workspace_roles_one_owner_per_workspace`,
  `idx_workspace_permissions_kind_id`, `idx_workspace_role_permissions_permission_id`.
- `02` — assert `users` and `warehouses` are empty, then add `users.workspace_id`,
  `warehouses.workspace_id`, `warehouses.archived_at`, the two composite uniques and
  `idx_users_workspace_id` / `idx_warehouses_workspace_name`.
- `03` — `workspace_memberships` with both composite foreign keys, `idx_workspace_memberships_*`
  and the `uq_workspace_memberships_one_owner` partial unique index.

Document the AC-35 catalogue-extension recipe in `apps/server/migrations/README.md` alongside the
existing `1786025100000-GrantUsersManagementPermissions` precedent: an idempotent insert into
`workspace_permissions`, an idempotent `INSERT ... SELECT` granting a non-reserved Permission to
every `kind = 'workspace_owner'` Role, and a `down` that removes both.

## Definition of Done

- [ ] All three migrations apply cleanly against the development database and revert cleanly, in
      order, with no `CREATE INDEX CONCURRENTLY` and every step inside its transaction.
- [ ] After `up`, `workspace_permissions` holds exactly the sixteen identifiers of
      [spec §1](../spec.md#1-context), with `WORKSPACE_OWNER_ROLE:REASSIGN` classified `reserved`
      and the other fifteen `assignable`.
- [ ] `02.up` throws the documented rollback-and-replay message — not a backfill — when `users` or
      `warehouses` is non-empty.
- [ ] `apps/server/migrations/README.md` documents the AC-35 catalogue-extension recipe.
- [ ] lint + build clean.

## Notes

Existing migrations are never edited ([sad §7](../sad.md#7-data-and-interface-impact)). The
sixteen identifiers must match `WorkspacePermissionId` in [T5](./workspace-permission-vocabulary.md)
exactly — whichever lands second reconciles against the first.
