---
id: T27
title: 'Re-shape the users REST surface to the named Warehouse'
layer: 'ports'
deps: ['T12', 'T13']
acs: ['AC-24']
files_hint:
  [
    'apps/server/src/users/rest/',
    'apps/server/src/users/usecases/commands/create-member.command.ts',
    'packages/contracts/src/users/',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T27 — Re-shape the users REST surface to the named Warehouse

## Why

`api-sync-report.md` **F-2**: `users.controller.ts` guards all four handlers with
`WarehouseAccessGuard` and Warehouse Permissions, each resolving the actor's single membership from
the session with no Warehouse named. Under AC-03a they cannot survive either — a blast radius
`sad.md` §7 and §11 under-name. [sad §4](../sad.md#4-solution-strategy) additionally requires
`CreateMemberCommand` to establish the new User's Workspace relation at creation time.

## What

Re-path all four handlers to `/api/v1/warehouses/{warehouseId}/users/...` (create, delete, email,
password) and re-scope `packages/contracts/src/users/` to match
[openapi.yaml](../contracts/openapi.yaml). Each keeps its existing Warehouse Permission
(`USERS:CREATE`, `USERS:DELETE`, `USERS:EMAIL_UPDATE`, `USERS:PASSWORD_CHANGE`) and is classified
mutating.

Change `CreateMemberCommand` to write the new User's `workspace_id` from the Workspace owning the
named Warehouse, and to write a `(User, Warehouse)` membership through the re-keyed
`MemberLifecycleRepository` ([T12](./split-provisioning-and-rekey-writes.md)). The relation is never
re-derived from memberships afterwards ([spec §1](../spec.md#1-context), second boundary).

## Definition of Done

- [ ] REST contract tests cover all four re-pathed operations: schema validation, success shape, and
      the stable error code and status of each documented failure branch.
- [ ] A test per handler proves it resolves the membership in the **named** Warehouse and is denied
      on an archived one.
- [ ] Integration test: a member created in a Warehouse belongs to that Warehouse's Workspace and to
      no other, so every Warehouse membership they can later receive stays inside one Workspace
      (AC-24).
- [ ] Integration test: the created member's Workspace relation survives losing every Warehouse
      membership — it is not re-derived (supports AC-21).
- [ ] A test proves a request to any of these paths without a `warehouseId` cannot reach a handler.
- [ ] The existing `users` suites are migrated and green.
- [ ] lint + vet clean.

## Notes

The contract re-scope is folded in here for the same compile-coupling reason as
[T26](./reshape-access-rest.md). `users` still imports no `access` or `auth` feature-owned file and
must not import `workspaces` — it reads the Workspace relation from the Warehouse row through shared
infrastructure.
