---
id: T3
title: "Promote the Permission grant migration and add the feature's PermissionId, WorkspacePermissionId and ErrorCode members"
layer: 'migration'
deps: [T2]
acs: ['AC-02', 'AC-09', 'AC-10', 'AC-23']
files_hint:
  - 'docs/features/delivery-addresses/migrations/03-grant-delivery-address-permissions.ts'
  - 'apps/server/migrations/'
  - 'packages/shared-types/src/enums/permission-id.ts'
  - 'packages/shared-types/src/enums/workspace-permission-id.ts'
  - 'packages/shared-types/src/enums/error-code.ts'
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T3 — Promote the Permission grant migration and add the feature's PermissionId, WorkspacePermissionId and ErrorCode members

## Why

The four Warehouse Permissions and one Workspace Permission are catalogue data, and nothing downstream — not the guard, not a controller, not a gate — can name one before its `PermissionId` member exists. Derives from [spec.md §6.1 AuthZ table](../spec.md) and [sad.md §5](../sad.md).

## What

Promote [`03-grant-delivery-address-permissions.ts`](../migrations/03-grant-delivery-address-permissions.ts) as `1786700200000-GrantDeliveryAddressPermissions.ts`, following the shipped `1786600100000-GrantOrderingPermissions` shape. Add `CUSTOMERS:WATCH`, `:CREATE`, `:UPDATE`, `:DEACTIVATE` to `PermissionId`, `WAREHOUSES:ADDRESS_UPDATE` to `WorkspacePermissionId`, and the feature's `customers.*` `ErrorCode` members plus the `customer_orders.*` and `purchase_drafts.*` additions. Labels stay catalogue data in the database.

## Definition of Done

- [ ] The migration applies and reverts cleanly and its inserts and grants are idempotent on a second run.
- [ ] Each of the five Permissions is granted to every existing `warehouse_manager` Role, and the Workspace one to every Workspace-owner Role.
- [ ] `packages/shared-types` exports all five members and every `ErrorCode` the contract in [openapi.yaml](../contracts/openapi.yaml) references.
- [ ] The shipped `workspaces` and `ordering` suites stay green — the vocabulary spec included.
- [ ] lint + vet clean.

## Notes

`packages/shared-types/src/enums/workspace-permission-vocabulary.spec.ts` asserts the Workspace vocabulary and will need the new member. Adding an enum member is a shared-type change every implementer must satisfy, which is why it rides with this migration rather than standing alone.
