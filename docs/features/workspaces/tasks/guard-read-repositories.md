---
id: T8
title: 'Add WorkspaceCurrentUserRepository and re-key AccessCurrentUserRepository'
layer: 'infra'
deps: ['T7']
acs: ['AC-05', 'AC-31']
files_hint:
  [
    'apps/server/src/shared/domain/repositories/workspace-current-user.repository.ts',
    'apps/server/src/shared/domain/repositories/access-current-user.repository.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T8 — Add WorkspaceCurrentUserRepository and re-key AccessCurrentUserRepository

## Why

These two reads are the authorization hot path at both levels.
[spec §6](../spec.md#6-non-functional-requirements) requires each authorization stage to stay within
50 ms at p95 and the Warehouse stage not to grow with the number of Warehouses a member belongs to;
[data-model.md §Indexes](../data-model.md#indexes) fixes both as two point lookups against a primary
key.

## What

Add `WorkspaceCurrentUserRepository.resolveRequiredWorkspacePermission`: membership by `user_id`,
then the single `(workspace_role_id, workspace_permission_id)` grant. Return persistence-oriented
scope only — never a domain object, never anything shaped like a client claim.

Re-key `AccessCurrentUserRepository` so every membership lookup takes `(userId, warehouseId)`
instead of `userId`, and the result carries the Warehouse's `archived_at` read by primary key in the
same round trip.

Both obtain their manager from `getEntityManager(this.dataSource)` so they join the caller's
transaction, stay feature-agnostic, and expose no private methods
([creating a server repository](../../../system/guides/creating-a-server-repository.md)).

## Definition of Done

- [ ] Repository integration tests prove the Workspace read resolves the actor's membership, Role
      and Role-Permission membership, and returns nothing for a User with no Workspace membership.
- [ ] Repository integration tests prove the Warehouse read resolves the `(User, Warehouse)`
      membership for the **named** Warehouse and returns the Warehouse's archived state with it.
- [ ] A test proves a Permission held only through another Warehouse's Role is **not** returned for
      the named Warehouse (AC-05).
- [ ] A test proves a Workspace Permission is never returned by the Warehouse read and vice versa
      (AC-31).
- [ ] A test over `persistWorkspaceGraph` with a member holding many memberships shows the Warehouse
      read issues the same two indexed lookups regardless of membership count.
- [ ] lint + vet clean.

## Notes

Neither read consults `users.active_warehouse_id`. The stored selection is presentation state and is
never an input to an authorization decision
([spec §6.1](../spec.md#61-security--privacy) "Warehouse confusion").
