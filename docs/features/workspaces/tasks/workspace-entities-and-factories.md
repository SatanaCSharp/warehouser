---
id: T7
title: 'Add the Workspace persistence entities, change the existing ones, and extend the test factories'
layer: 'infra'
deps: ['T2']
acs: []
files_hint:
  ['apps/server/src/shared/domain/entities/', 'apps/server/src/test/factories/']
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T7 — Add the Workspace persistence entities, change the existing ones, and extend the test factories

## Why

Every repository in the epic maps through these entities, and every integration test in the epic
builds on `persistWorkspaceGraph`. [sad §5](../sad.md#5-building-blocks-and-ownership) keeps entities
in `shared/domain/entities`, and
[data-model.md §Test fixtures](../data-model.md#test-fixtures) fixes the factory set.

## What

Add `WorkspaceEntity`, `WorkspacePermissionEntity`, `WorkspaceRoleEntity`,
`WorkspaceRolePermissionEntity` and `WorkspaceMembershipEntity` matching the promoted schema exactly
— including the `kind` discriminators and the composite references that keep Roles and assignments
inside one Workspace. Change `UserEntity` (non-null Workspace relation, nullable Active Warehouse
selection), `WarehouseEntity` (non-null Workspace relation, `archivedAt`) and
`WarehouseMembershipEntity` (composite key by User and Warehouse, carrying `workspaceId`).

Extend `apps/server/src/test/factories/` with `buildWorkspace` (unnamed by default),
`buildWorkspacePermission` (`assignable` by default), `buildWorkspaceRole` (custom by default),
`buildWorkspaceMembership`, the extended `buildWarehouse` and `buildWarehouseMembership`, and
`persistWorkspaceGraph` — a Workspace, its Owner Role and grants, two Warehouses (one archived),
their Roles, and memberships for several Users in one integration-test transaction.

## Definition of Done

- [ ] An integration test persists and reads back every new and changed entity against PostgreSQL,
      proving the mapping matches the promoted schema (column names, nullability, composite keys).
- [ ] An integration test proves the composite references reject a Workspace Role from another
      Workspace and a Role from another Warehouse.
- [ ] `persistWorkspaceGraph` produces the graph
      [data-model.md §Test fixtures](../data-model.md#test-fixtures) specifies and is usable inside a
      caller's transaction.
- [ ] Identities use `example.test` addresses and synthetic UUIDs; no fixture data lives in a
      migration or seed.
- [ ] lint + vet clean; the existing server suite stays green after the entity changes.

## Notes

Every repository task ([T8](./guard-read-repositories.md)–[T12](./split-provisioning-and-rekey-writes.md))
depends on this task in practice even where the DAG shows only `T7 → Tn`. The unnamed-by-default
Workspace fixture makes the AC-29 placeholder path the default in every downstream test.
