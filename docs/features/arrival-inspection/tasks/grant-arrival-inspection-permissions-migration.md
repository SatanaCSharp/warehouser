---
id: T2
title: 'Promote the Permission grant migration and add the three PermissionId members with every arrival-inspection ErrorCode'
layer: 'migration'
deps: [T1]
acs: ['AC-01a', 'AC-20', 'AC-22', 'AC-26']
files_hint:
  - 'docs/features/arrival-inspection/migrations/02-grant-arrival-inspection-permissions.ts'
  - 'apps/server/migrations/'
  - 'packages/shared-types/src/enums/permission-id.ts'
  - 'packages/shared-types/src/enums/error-code.ts'
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T2 — Promote the Permission grant migration and add the shared enum members

## Why

The three new capabilities are ordinary assignable Warehouse Permissions, and every task downstream
names them: the ending command's capability assertion (AC-01a), the amendment's guard (AC-20), the
projection's cause-withholding (AC-22) and the non-disclosing cross-Warehouse refusal (AC-26).
[spec.md §8](../spec.md)'s fifth question takes its stated default — the protected
`warehouse_manager` Role receives all three by migration, every custom Role is an administrator's
decision. Derives from [spec.md §6.1](../spec.md) and [data-model.md §Migrations](../data-model.md).

## What

Promote [`02-grant-arrival-inspection-permissions.ts`](../migrations/02-grant-arrival-inspection-permissions.ts)
to `apps/server/migrations/1786800100000-GrantArrivalInspectionPermissions.ts`. It follows
`apps/server/migrations/README.md` § "Extending a Permission catalogue" and
`1786700200000-GrantDeliveryAddressPermissions` as its model: insert the three catalogue rows, then
grant them to the protected Roles that already exist with a `NOT EXISTS`-guarded `INSERT … SELECT`,
because provisioning only granted the set known when each Role was created.

Add `REJECTIONS:CREATE`, `REJECTIONS:WATCH` and `REJECTIONS:UPDATE` to `PermissionId`, and every
`purchase_drafts.*` `ErrorCode` member this feature's named refusals map to. Reason and Disposition
labels stay catalogue data and translated copy respectively — **never enum members**
([sad.md §5](../sad.md)).

## Definition of Done

- [ ] The staged file is promoted under its live name, applies and reverts cleanly.
- [ ] All three Permissions are inserted as **`assignable`** — none is reserved, because a Workspace
      Owner must be able to delegate each to a custom Role.
- [ ] Re-applying the grant on a database that already holds them inserts nothing and fails nothing.
- [ ] Every protected `warehouse_manager` Role that existed before the migration holds all three
      afterwards; an integration test asserts it against a Role created by earlier provisioning.
- [ ] **No Workspace Permission is added** and nothing touches the Warehouse record itself.
- [ ] `packages/shared-types` exports the three `PermissionId` members and every `purchase_drafts.*`
      `ErrorCode` this feature names, with no `RejectionReason` or `Disposition` enum introduced.
- [ ] The shipped `ordering`, `delivery-addresses`, `access` and `workspaces` suites stay green.
- [ ] `pnpm --filter @warehouser/server test`, `test:integration`, `lint` and `build` are green.

## Notes

Shares the ordered migration lane with T1 — `layer: migration` is serialized by `implement`, and this
one must run second.

**Known consequence, accepted** ([spec.md §8](../spec.md), fifth question): on deployment morning a
member on a custom Role holds none of the three, so they can record only an ending that refuses
nothing — which is indistinguishable from the feature working. That is a documented operational
consequence, not a defect this task fixes.
