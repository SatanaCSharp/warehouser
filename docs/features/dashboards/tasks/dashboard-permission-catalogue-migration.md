---
id: T2
title: 'Promote the Workspace Permission grant migration and add WAREHOUSE_PERFORMANCE:WATCH to the catalogue enum and its hand-enumerated gate'
layer: 'migration'
deps: [T1]
acs: ['AC-21', 'AC-21a']
files_hint:
  - 'docs/features/dashboards/migrations/02-grant-dashboard-permissions.ts'
  - 'apps/server/migrations/'
  - 'packages/shared-types/src/enums/workspace-permission-id.ts'
  - 'packages/shared-types/src/enums/workspace-permission-vocabulary.spec.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T2 — Promote the Workspace Permission grant migration and add WAREHOUSE_PERFORMANCE:WATCH to the catalogue enum and its hand-enumerated gate

> **Blocked by:** [T1](./reason-concentration-index-migration.md)
> **Satisfies:** AC-21, AC-21a — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** M · **Layer:** `migration`

## Why

The Workspace surface has no authority to stand on: every `WorkspacePermissionId` today is
administrative. This is the feature's whole stored-data footprint, and AC-21a requires every
Workspace Owner Role that already exists to carry the new Permission after the release with no
person acting ([sad.md §6.7](../sad.md), [data-model.md § Entities](../data-model.md)).

## What

Promote [`migrations/02-grant-dashboard-permissions.ts`](../migrations/02-grant-dashboard-permissions.ts)
→ `apps/server/migrations/1786900100000-GrantDashboardPermissions.ts`, and add the catalogue key in
the two places that must move together:

- `packages/shared-types/src/enums/workspace-permission-id.ts` — the `WAREHOUSE_PERFORMANCE:WATCH`
  member. **`WATCH`, not `OBSERVE`**: every read Permission in both catalogues uses `WATCH`
  ([data-model.md](../data-model.md) supersedes `sad.md` §5's working name).
- `packages/shared-types/src/enums/workspace-permission-vocabulary.spec.ts` — the literal
  `MIGRATION_WORKSPACE_PERMISSION_CATALOGUE` entry. Adding the enum without the literal **fails**
  that spec; adding neither passes it silently.

## Definition of Done

- [ ] The staged file is promoted under its timestamped name, unedited
- [ ] The catalogue row inserts as `kind = 'assignable'`, satisfying
      `chk_workspace_permissions_identifier` and admitting the Permission on a custom Role through
      `chk_workspace_role_permissions_reserved_exclusive`
- [ ] Every `workspace_owner` Role that existed before the apply carries it afterwards; no custom
      Role gains it (AC-21a)
- [ ] Re-applying the grant is a no-op (`NOT EXISTS`-guarded); re-applying the catalogue insert
      fails loudly on the primary key
- [ ] `down` deletes the grants **before** the catalogue row —
      `fk_workspace_role_permissions_permission` is `ON DELETE RESTRICT`
- [ ] `packages/shared-types` is rebuilt, and the server suites resolve the new member through
      `dist`
- [ ] `workspace-permission-vocabulary.spec.ts` passes with the new literal, and is shown to fail
      without it
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**The insert and the grant use two different naming worlds on purpose.**
`queryRunner.manager.insert` maps **entity property names**, so the insert object is
`{ id, label, kind }`; the grant is raw SQL in **snake_case**. Mixing them is the failure that
passes the PGlite tier and vanishes in production
([sad.md §7](../sad.md), [data-model.md § Migrations](../data-model.md)).

`1786700200000-GrantDeliveryAddressPermissions.ts` is the model to follow exactly.

A revert removes the Permission from every Role holding it, including a custom Role an Owner had
since granted it to — the `DELETE` keys on the Permission, not the Role kind. That is inherent to
reverting a catalogue row and is the trade every Permission migration here makes.
