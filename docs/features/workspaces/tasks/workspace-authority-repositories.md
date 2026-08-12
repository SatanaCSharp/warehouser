---
id: T10
title: 'Add the Workspace Role lifecycle, membership and Owner-transfer repositories'
layer: 'infra'
deps: ['T7']
acs: ['AC-17', 'AC-19b', 'AC-26']
files_hint:
  [
    'apps/server/src/shared/domain/repositories/workspace-role-lifecycle.repository.ts',
    'apps/server/src/shared/domain/repositories/workspace-membership.repository.ts',
    'apps/server/src/shared/domain/repositories/workspace-owner-transfer.repository.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T10 — Add the Workspace Role lifecycle, membership and Owner-transfer repositories

## Why

The three write paths that must transition directly between valid states: deleting an assigned
Workspace Role (AC-17), moving a Member to another Workspace Role (AC-19b) and transferring
Workspace Owner (AC-26). [data-model.md §Repository boundaries](../data-model.md#repository-boundaries-transactions-and-locking)
fixes their shapes and lock order, mirroring `RoleLifecycleRepository` and `ManagerTransferRepository`
one level down.

## What

- `WorkspaceRoleLifecycleRepository` — scoped Workspace Role create/update/delete, Permission
  membership replacement, and the atomic assigned-Role replacement
  (`UPDATE workspace_memberships SET workspace_role_id = $replacement` then
  `DELETE FROM workspace_roles`), using `idx_workspace_memberships_role_id`.
- `WorkspaceMembershipRepository` — add, remove and reassign a Workspace membership, plus the
  locking reads for the current Owner and the target.
- `WorkspaceOwnerTransferRepository.transfer` — lock the `workspaces` row, then both membership rows
  in `user_id` order, recheck their composite Role relations, and update both assignments in one
  statement.

All three join the caller's transaction via `getEntityManager(this.dataSource)` and stay
feature-agnostic.

## Definition of Done

- [ ] Repository integration tests cover Role create/update/delete scoped to one Workspace, and
      Permission-membership replacement including replacement with the empty set.
- [ ] A test proves the assigned-Role replacement moves every affected membership and deletes the
      Role inside one transaction, with no intermediate state observable and nothing left behind on
      an injected failure.
- [ ] A test proves Workspace membership add/remove/reassign each leave exactly one Workspace Role
      per Member.
- [ ] A concurrent-transfer test proves `uq_workspace_memberships_one_owner` is the final arbiter:
      one transfer commits, the other fails with the concurrency error, and exactly one Owner
      remains.
- [ ] A test proves the lock order is `workspaces` first, then Role/membership rows, so no cycle
      with a Warehouse-level command is possible.
- [ ] lint + vet clean.

## Notes

The lock order here is deliberately stronger than [sad §6.5](../sad.md#65-archive-and-restore-a-warehouse)
draws: locking the parent `workspaces` row serializes concurrent Workspace-level lifecycle work at
one row instead of one lock per child ([data-model.md §Lock order](../data-model.md#repository-boundaries-transactions-and-locking)).
Warehouse-level commands keep the approved order and never take a Workspace lock.
