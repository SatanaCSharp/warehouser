---
id: T15
title: 'Add the Workspace rename command and the Workspace configuration queries'
layer: 'app'
deps: ['T4', 'T6', 'T9']
acs: ['AC-29', 'AC-29a', 'AC-32', 'AC-33', 'AC-34']
files_hint:
  [
    'apps/server/src/workspaces/usecases/commands/rename-workspace.command.ts',
    'apps/server/src/workspaces/usecases/queries/',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T15 — Add the Workspace rename command and the Workspace configuration queries

## Why

US-10 and US-11 together: naming the Workspace (AC-29, AC-29a) and reviewing its configuration under
the applicable watch Permission (AC-32, AC-33, AC-34). [sad §6.2a](../sad.md#62a-rename-the-workspace)
and [§5](../sad.md#5-building-blocks-and-ownership) put both in `workspaces/usecases`, each proving
Workspace ownership itself rather than relying on the guard.

## What

- `rename-workspace.command.ts` — validate through the shared name value object
  ([T3](./promote-shared-name-value-object.md)), record the trimmed name preserving submitted
  Unicode without normalization, and permit a name that duplicates another Workspace's.
- `workspaces/usecases/queries/` — one query per watch Permission over
  `WorkspaceReadRepository`: Workspace Roles plus the Workspace Permission catalogue under
  `WORKSPACE_ROLES:WATCH`; Workspace Members with their Role assignments together with the other
  Users of the Workspace and the Warehouses each belongs to under `WORKSPACE_MEMBERS:WATCH`; the
  Workspace's Warehouses with archived state under `WAREHOUSES:WATCH`.

Every query and the command take the principal from the guard and prove the target belongs to
`principal.workspaceId`.

## Definition of Done

- [ ] Integration test: setting a name on an unnamed Workspace and later changing it both record the
      trimmed name with Unicode preserved, and it replaces the unnamed placeholder in the projection
      (AC-29).
- [ ] Integration tests: an empty-after-trim name, one over 100 user-perceived characters, and one
      containing a control or format character are each rejected with the broken rule named, leaving
      the existing name or unnamed state untouched (AC-29a).
- [ ] Integration tests: each read returns exactly its own Workspace's rows for an actor holding its
      watch Permission (AC-32, AC-33).
- [ ] Integration tests: an actor lacking the applicable watch Permission, and an actor targeting
      another Workspace, are both denied with the same non-enumerating failure (AC-34).
- [ ] A test proves the Users read exposes the Warehouses a User belongs to but no Warehouse Role.
- [ ] lint + vet clean.

## Notes

Lists are returned whole at the scale [spec §1](../spec.md#1-context)'s fifth boundary states — do
not add paging; the retained page shape means it can be introduced later without a contract break
([sad §7](../sad.md#7-data-and-interface-impact)).
