---
id: T2
title: "Stage the Permission catalogue migration and add the feature's PermissionId and ErrorCode members"
layer: 'migration'
deps: ['T1']
acs: ['AC-05', 'AC-22', 'AC-23']
files_hint:
  [
    'docs/features/ordering/migrations/02-grant-ordering-permissions.ts',
    'packages/shared-types/src/enums/permission-id.ts',
    'packages/shared-types/src/enums/error-code.ts',
  ]
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T2 — Stage the Permission catalogue migration and add the feature's PermissionId and ErrorCode members

> **Blocked by:** [T1](./create-ordering-schema-migration.md) · **Layer:** `migration` · **Owner:** Backend Lead · **Estimate:** S
> **Acceptance criteria:** [AC-05](../spec.md), [AC-22](../spec.md), [AC-23](../spec.md)

## Why

Every capability the feature adds is authorized by one of sixteen new Warehouse Permissions, and the server and web both address them through `PermissionId`. Derives from [spec §6.1](../spec.md), [sad §5 `packages/shared-types`](../sad.md) and [data-model §Migrations](../data-model.md).

## What

- Promote the staged pair [`migrations/02-grant-ordering-permissions.ts`](../migrations/02-grant-ordering-permissions.ts) into `apps/server/migrations/`.
- Insert the sixteen catalogue rows, then grant them to every existing `warehouse_manager` Role with an idempotent `INSERT … SELECT … WHERE NOT EXISTS`, following `apps/server/migrations/README.md` § Extending a Permission catalogue.
- Add the sixteen `PermissionId` members and the feature's stable `ErrorCode` members, namespaced `items.*`, `customer_orders.*` and `purchase_drafts.*`, to `packages/shared-types`.

## Definition of Done

- [ ] The staged migration is promoted, applies and reverts cleanly against the development database
- [ ] `down` removes the grants before the catalogue rows, since `role_permissions` references `permissions` with `ON DELETE RESTRICT`
- [ ] An integration test proves every `warehouse_manager` Role holds all sixteen after the migration, and that re-running the grant changes nothing
- [ ] All sixteen `PermissionId` members and every feature `ErrorCode` member are exported, and the shipped `access`, `users` and `workspaces` suites stay green
- [ ] lint + vet clean

## Notes

- Each Permission is `assignable`: none is reserved to the protected Warehouse Manager Role, because a Workspace Owner must be able to delegate each capability to a custom Warehouse Role.
- The identifier members ride here rather than standing alone: `PermissionId` and `ErrorCode` are `as const` maps, so the additions are purely additive and commit green with the catalogue rows they name (tasks skill step 5, contract-task rule).
- Labels stay catalogue data in the database, as with every existing Permission.
