---
id: T9
title: 'Add WorkspaceReadRepository'
layer: 'infra'
deps: ['T7']
acs: ['AC-32', 'AC-33', 'AC-34']
files_hint:
  ['apps/server/src/shared/domain/repositories/workspace-read.repository.ts']
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T9 — Add WorkspaceReadRepository

## Why

[sad §5](../sad.md#5-building-blocks-and-ownership) gives `workspaces` its own read repository rather
than reusing an `access` query and filtering afterwards, because two Workspace Permissions carry a
deliberately narrowed read at the other level. `WORKSPACE_MEMBERS:WATCH` covers the Users of the
Workspace and the Warehouses each belongs to, and nothing more — narrowing in SQL is what keeps
AC-33 from becoming AC-31 confusion.

## What

Add `WorkspaceReadRepository` with the projections
[data-model.md §Repository boundaries](../data-model.md#repository-boundaries-transactions-and-locking)
names:

- Workspace identity and name (including the unset state).
- Workspace Roles with their Permission membership, and the Workspace Permission catalogue with its
  assignable/reserved classification (AC-32).
- Workspace Members with their Workspace Role assignments (AC-33).
- The other Users of the Workspace with the Warehouses each belongs to — served by
  `idx_warehouse_memberships_workspace_user`, projected without any Warehouse Role (AC-33).
- The Workspace's Warehouses with archived state, served by `idx_warehouses_workspace_name`
  (AC-33).

Every query is constrained by `workspace_id` **in SQL** and deterministically ordered; lists are
returned whole at the scale [spec §1](../spec.md#1-context)'s fifth boundary states.

## Definition of Done

- [ ] Repository integration tests cover each projection against `persistWorkspaceGraph`, asserting
      the exact column set and a stable order.
- [ ] A test with two Workspaces present proves no query returns a row of the other Workspace, and
      that a cross-Workspace identifier yields the same empty result as a missing one (AC-34).
- [ ] A test proves the Users projection returns the Warehouses a User belongs to but **no**
      Warehouse Role, and includes Users who are not Workspace Members.
- [ ] Query plans use the indexes `data-model.md` §Indexes names for the Users, Warehouses and
      Members reads.
- [ ] lint + vet clean.

## Notes

The narrow assignable-Roles read for `WAREHOUSE_MEMBERSHIPS:ASSIGN` is **not** here — it belongs to
`WarehouseMembershipAssignmentRepository` in [T11](./warehouse-record-repositories.md), because its
subject is a Warehouse's Roles rather than the Workspace.
