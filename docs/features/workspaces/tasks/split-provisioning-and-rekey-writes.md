---
id: T12
title: 'Split registration provisioning and re-key the existing Warehouse-level writes'
layer: 'infra'
deps: ['T7']
acs: ['AC-01', 'AC-36']
files_hint:
  [
    'apps/server/src/shared/domain/repositories/workspace-provisioning.repository.ts',
    'apps/server/src/shared/domain/repositories/access-provisioning.repository.ts',
    'apps/server/src/shared/domain/repositories/role-lifecycle.repository.ts',
    'apps/server/src/shared/domain/repositories/manager-transfer.repository.ts',
    'apps/server/src/shared/domain/repositories/member-lifecycle.repository.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T12 — Split registration provisioning and re-key the existing Warehouse-level writes

## Why

[sad §4](../sad.md#4-solution-strategy) moves Warehouse-row creation out of `access` so `workspaces`
owns the Warehouse lifecycle while `access` keeps only what a Warehouse owns. Every existing
membership write must additionally carry `workspace_id` and match by the composite key, or the
re-keyed table in [T2](./promote-warehouse-rekey-migrations.md) rejects it.

## What

- Add `WorkspaceProvisioningRepository.provisionWorkspace`: insert the Workspace, its protected
  Owner Role, that Role's catalogue grants and the registrant's Workspace membership, joining the
  outer registration transaction. Fail when any required Workspace Permission identifier is absent,
  mirroring `AccessProvisioningRepository`.
- Change `AccessProvisioningRepository` to stop inserting the `warehouses` row: it receives a
  `warehouseId` and a `userId` and inserts only the protected Manager Role, its grants and the
  membership — which now also carries `workspace_id`.
- Change `RoleLifecycleRepository`, `ManagerTransferRepository` and `MemberLifecycleRepository` so
  every membership write supplies `workspace_id` and every membership match uses
  `(user_id, warehouse_id)`.

## Definition of Done

- [ ] Repository integration tests prove Workspace provisioning writes all four row kinds inside a
      caller's transaction and fails when a catalogue identifier is missing (AC-01).
- [ ] A test proves `AccessProvisioningRepository` creates no `warehouses` row and works against a
      Warehouse the caller supplies.
- [ ] Tests prove `ManagerTransferRepository` matches and updates memberships by the composite key
      and that a member's memberships in other Warehouses are untouched by a transfer (AC-36).
- [ ] Tests prove `RoleLifecycleRepository`'s assignment replacement and
      `MemberLifecycleRepository`'s insert/delete both write and match `workspace_id` correctly.
- [ ] The existing `access` and `users` repository suites stay green.
- [ ] lint + vet clean.

## Notes

`access` learns nothing about Workspaces beyond storing the `workspace_id` it is handed
([sad §4](../sad.md#4-solution-strategy)). Do not import anything from `workspaces` here — that
direction is a cycle, and [T30](./two-level-authorization-coverage-check.md) fails the build for it.
