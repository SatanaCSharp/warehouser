---
id: T6
title: 'Add the packages/contracts/workspaces request and response schemas'
layer: 'ports'
deps: ['T5']
acs: ['AC-32', 'AC-33']
files_hint:
  ['packages/contracts/src/workspaces/', 'packages/contracts/src/index.ts']
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T6 — Add the packages/contracts/workspaces request and response schemas

## Why

[sad §5](../sad.md#5-building-blocks-and-ownership) makes `packages/contracts/workspaces` the single
shared boundary the server DTOs and the web RTK Query endpoints both bind to. The exact fields are
already fixed by [openapi.yaml](../contracts/openapi.yaml), derived from
[data-model.md](../data-model.md) — this task is the Zod expression of it, not a new design.

## What

Add `packages/contracts/src/workspaces/` with strict schemas for every Workspace-level shape in the
contract: the actor-context projection (Workspace identity, name and unnamed state, Workspace
Permissions, the member's Warehouses with archived state, the effective selection), the selection
write, Workspace rename, Workspace Roles and the Permission catalogue, Workspace Members with their
Role assignments, the Workspace's other Users with the Warehouses each belongs to, Owner transfer,
Warehouse records with archived state, the narrow assignable-Roles read, and the membership
assign/revoke edges. Export from `packages/contracts/src/index.ts`.

Follow the conventions [api-sync-report.md](../contracts/api-sync-report.md) records: camelCase
fields, the existing `{items, hasNext, hasPrev, nextCursor}` page wrapper retained only where it
already exists, new Workspace-level lists returned whole, no `Idempotency-Key`.

## Definition of Done

- [ ] A contract spec asserts, per schema, that field names, optionality and nullability match the
      OpenAPI component of the same name — including `WorkspaceRole`, `WorkspacePermission`,
      `WorkspaceMember`, `WorkspaceUser`, `Warehouse`, `AssignableWarehouseRole`,
      `ContextWarehouse` and `ActiveWarehouseSelection`.
- [ ] Schemas are strict: an unknown key is rejected rather than stripped.
- [ ] No request schema accepts a Workspace Permission definition or label, and no request schema
      accepts a capability projection back as proof of authority ([sad §7](../sad.md#7-data-and-interface-impact)).
- [ ] Every Workspace Permission field is typed to `WorkspacePermissionId`, never `PermissionId`.
- [ ] `packages/contracts` suite, lint and build green.

## Notes

Workspace-scoped shapes carry **no** Workspace identifier — the actor's Workspace is derived from
the session ([sad §7](../sad.md#7-data-and-interface-impact)). Only Warehouse records and membership
edges name a `warehouseId`, and they are still Workspace-scoped routes.
