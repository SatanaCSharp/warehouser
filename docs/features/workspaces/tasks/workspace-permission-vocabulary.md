---
id: T5
title: 'Add WorkspacePermissionId and the new stable error codes to shared-types'
layer: 'ports'
deps: []
acs: ['AC-18', 'AC-31']
files_hint:
  [
    'packages/shared-types/src/enums/workspace-permission-id.ts',
    'packages/shared-types/src/enums/error-code.ts',
    'packages/shared-types/src/enums/index.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T5 — Add WorkspacePermissionId and the new stable error codes to shared-types

## Why

[ADR 0001](../adr/0001-two-level-request-authorization.md) and
[sad §4](../sad.md#4-solution-strategy) make level confusion (AC-31) a **compile** error rather than
a runtime hole: `PermissionId` and `WorkspacePermissionId` are separate types, so passing a Workspace
Permission to `@RequiredPermission` cannot type-check. The 22 new codes
[api-sync-report.md §2](../contracts/api-sync-report.md) enumerates are the other half of that
boundary.

## What

Add `WorkspacePermissionId` as a vocabulary structurally distinct from `PermissionId` — not a union
member, not a widened string alias — holding the sixteen catalogue identifiers of
[spec §1](../spec.md#1-context). Extend `ErrorCode` with the new stable codes for level confusion,
archived Warehouse, last non-archived Warehouse, sole Owner, self-assignment, cross-Workspace or
unavailable target, protected Workspace Role, reserved Workspace Permission, already-a-Member and
concurrency, exactly as `api-sync-report.md` §2 lists them. Export both from
`packages/shared-types/src/enums/index.ts`.

## Definition of Done

- [ ] A type-level test asserts that a `WorkspacePermissionId` is not assignable to `PermissionId`
      and vice versa, in both directions.
- [ ] The sixteen identifiers match migration `01`'s catalogue rows exactly (a test compares the two
      lists), with `WORKSPACE_OWNER_ROLE:REASSIGN` marked reserved.
- [ ] Every code named in `api-sync-report.md` §2 exists in `ErrorCode` with no duplicate value.
- [ ] Labels remain catalogue data — no label is introduced as a type or constant here (AC-18).
- [ ] `packages/shared-types` and `packages/contracts` suites, lint and build stay green.

## Notes

This is additive to `shared-types`, so it compiles green on its own and is safe as a standalone
task. The **re-scoping** of `packages/contracts/src/access` and `.../users` is not: it breaks its
implementers, so it is folded into [T26](./reshape-access-rest.md) and
[T27](./reshape-users-rest.md) respectively.
