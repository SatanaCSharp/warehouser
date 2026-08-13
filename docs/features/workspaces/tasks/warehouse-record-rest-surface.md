---
id: T25
title: 'Add the Warehouse-record and membership-edge REST routes'
layer: 'ports'
deps: ['T6', 'T13', 'T20', 'T21', 'T22']
acs: ['AC-10', 'AC-25d']
files_hint:
  [
    'apps/server/src/workspaces/rest/',
    'apps/server/src/workspaces/usecases/usecase.module.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T25 — Add the Warehouse-record and membership-edge REST routes

## Why

These routes carry a `warehouseId` in their path yet are **Workspace**-scoped, because their subject
is the Warehouse record or a membership edge rather than a resource the Warehouse owns
([sad §7](../sad.md#7-data-and-interface-impact), [spec §1](../spec.md#1-context) first boundary).
Getting that classification right is what keeps AC-11's "renaming, restoring, assigning and
withdrawing remain available on an archived Warehouse" true.

## What

Add the controllers for `/api/v1/workspace/warehouses`, `.../{warehouseId}`,
`.../{warehouseId}/archival`, `.../{warehouseId}/assignable-roles`,
`.../{warehouseId}/memberships` and `.../{warehouseId}/memberships/{userId}`, with `createZodDto`
adapters over `@warehouser/contracts/workspaces`. Each declares
`@RequiredWorkspacePermission(...)` — `WAREHOUSES:WATCH`, `WAREHOUSES:CREATE`, `WAREHOUSES:RENAME`,
`WAREHOUSES:ARCHIVE`, `WAREHOUSE_MEMBERSHIPS:ASSIGN`, `WAREHOUSE_MEMBERSHIPS:REVOKE` — and resolves
authority through `WorkspaceAccessGuard`, never the Warehouse guard.

## Definition of Done

- [ ] REST contract tests cover every path and method above: schema validation, success shape, and
      the stable error code and status of each documented failure branch.
- [ ] A test per route proves it succeeds against an **archived** Warehouse, because the Workspace
      guard never consults archived state (AC-11).
- [ ] Tests prove a Warehouse of another Workspace is denied without disclosing that it exists
      (AC-10), and likewise for a membership in one (AC-25d).
- [ ] A test proves none of these handlers is reachable through `WarehouseAccessGuard` or declares a
      Warehouse Permission.
- [ ] lint + vet clean.

## Notes

Shares a lane with [T24](./workspace-rest-surface.md) (same `workspaces/rest/` directory and
use-case module), so `implement` serializes the pair; they may be committed together behind one gate.
