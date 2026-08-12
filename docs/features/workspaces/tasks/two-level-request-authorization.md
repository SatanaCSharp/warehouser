---
id: T13
title: 'Add WorkspaceAccessGuard and rework WarehouseAccessGuard for the named Warehouse'
layer: 'ports'
deps: ['T5', 'T8']
acs: ['AC-03a', 'AC-04', 'AC-05', 'AC-12', 'AC-12a', 'AC-30', 'AC-31']
files_hint:
  [
    'apps/server/src/shared/guards/workspace-access.guard.ts',
    'apps/server/src/shared/guards/warehouse-access.guard.ts',
    'apps/server/src/shared/decorators/required-workspace-permission.decorator.ts',
    'apps/server/src/shared/access/',
  ]
owner: 'Backend Lead + Security Lead'
estimate: 'L'
status: 'todo'
---

# T13 — Add WorkspaceAccessGuard and rework WarehouseAccessGuard for the named Warehouse

## Why

This is [ADR 0001](../adr/0001-two-level-request-authorization.md) in code and the authorization
spine both [sad §6.2](../sad.md#62-protected-workspace-operation) and
[§6.3](../sad.md#63-protected-warehouse-operation) draw. AC-03a is enforced **structurally** here: a
Warehouse-scoped request that names no Warehouse cannot reach a handler at all, rather than being
checked by each command.

## What

- Add `WorkspaceAccessGuard`, composing after `SessionAuthGuard`. It reads
  `@RequiredWorkspacePermission(...)` from its own metadata key, resolves the actor's Workspace
  membership, Workspace Role and Role-Permission membership in one read via
  `WorkspaceCurrentUserRepository`, denies missing authority, and attaches a frozen
  `WorkspaceCurrentUser` (`userId`, `workspaceId`, `workspaceRoleId`, `workspaceRoleKind`,
  `permissionId`). It decides no target ownership.
- Add `@RequiredWorkspacePermission`, typed to `WorkspacePermissionId`, keyed separately from
  `@RequiredPermission`.
- Rework `WarehouseAccessGuard`: read `@RequiredPermission(...)` **and** the route's `warehouseId`,
  refuse a request that names no Warehouse, resolve the `(User, Warehouse)` membership and its
  Permission, refuse an archived Warehouse **unless** the handler declares read tolerance, and
  attach `AccessCurrentUser` extended with the `warehouseId` proven from the request and the
  Warehouse's archived state.
- Add the archived-tolerance declaration and extend `shared/access/access-request.ts` with the
  optional `workspace` principal alongside the existing `access` one.

## Definition of Done

- [ ] Guard unit tests cover both guards for: session composition, reading only their own metadata
      key, missing membership, and a safe principal shape carrying no client-supplied value.
- [ ] A test proves a Warehouse-scoped request naming no Warehouse is refused, and is **never**
      resolved to the actor's stored selection or any other default (AC-03a).
- [ ] Tests prove a membership in a different Warehouse, and a Permission held only through another
      Warehouse's Role, both deny (AC-04, AC-05).
- [ ] Tests prove an archived Warehouse denies by default and permits a handler that explicitly
      declares read tolerance (AC-12, AC-12a).
- [ ] A test proves a Workspace Permission declared on a Warehouse handler (or the reverse) resolves
      nothing and denies — the runtime half of AC-31, its compile-time half owned by
      [T5](./workspace-permission-vocabulary.md).
- [ ] A test proves a denial is the same non-enumerating failure as a missing target (AC-30).
- [ ] Neither guard reads `users.active_warehouse_id`.
- [ ] lint + vet clean.

## Notes

Both principals are server-local and are never returned to the browser
([sad §5](../sad.md#5-building-blocks-and-ownership)). Archived tolerance is legal on reads and — per
[ADR 0003](./archived-tolerance-adr.md) — on the single membership-edge mutation in
[T26](./reshape-access-rest.md); [T30](./two-level-authorization-coverage-check.md) fails the build
for anything else.
