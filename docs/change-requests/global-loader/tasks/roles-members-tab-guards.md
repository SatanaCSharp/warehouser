---
id: T15
title: 'Collapse the RolesTab and MembersTab guards keeping the permission and error arms'
layer: 'ui'
deps: ['T2', 'T7']
acs: ['CR-AC-15', 'CR-RG-05']
source_refs:
  - 'change.md#3-override-map CH-14'
  - 'change.md#3-override-map CH-15'
  - 'spec.md#cr-ac-15-cr-us-05-ch-15--behavioral'
  - 'sad.md#48-what-replaces-each-collapsed-guard'
files_hint:
  - 'apps/web/src/modules/access/components/access-workspace/components/roles/RolesTab.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/roles/RolesTab.spec.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MembersTab.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MembersTab.spec.tsx'
owner: 'YuriiH'
estimate: 'S'
status: 'todo'
---

# T15 — Collapse the `RolesTab` and `MembersTab` guards keeping the permission and error arms

## Why

These two tabs reach `RolesDatasetCard` / `MembersDatasetCard` — the **only** renderers of
`roles.error` and the Members error — through their `!isReady` term today. Dropping that term without
replacing it would send a permitted actor whose read **failed** into `RoleDirectory` /
`MemberDirectory` with `items: []`, telling them "no roles are available" for a failed read and
making [CR-AC-15](../spec.md#cr-ac-15-cr-us-05-ch-15--behavioral) unsatisfiable by any code path.

[`sad.md` §4.8](../sad.md#48-what-replaces-each-collapsed-guard)'s rule applies here in full: keep
the permission arm, keep the error arm, drop the readiness term.

## What

- `RolesTab.tsx:46` and `MembersTab.tsx:26`: the surviving condition is **_not-permitted or
  errored_**, never the permission term alone. The error arm is always explicit — it is not covered
  by reachability the way T11's four sites are.
- `RolesTab` keeps its genuine **alternative-surface** arm: a `ROLES:WATCH`-only actor is admitted and
  gets the read-only card. That is a permission distinction, not a readiness one.
- `MembersTab.tsx:26`'s `canReadMembers` is `USERS:WATCH`, the same Permission that admits the tab,
  so its _not-permitted_ arm is unreachable and needs no branch beyond the error one.
- `empty` becomes `items.length === 0`.

`RolesTab.tsx:46` is the one site where admission is **wider** than the dataset's gate — the Roles tab
admits 6 Permissions while the catalogue admitted 3. T2's widening closes that gap structurally, which
is why this task depends on it rather than adding a branch here.

## Definition of Done

- [ ] Neither file retains a readiness term, and each surviving condition is _not-permitted **or**
      errored_ — never the permission term alone.
- [ ] A spec proves a **permitted** actor whose read **failed** reaches `roles.error` / the Members
      error rather than an empty directory (CR-AC-15).
- [ ] A spec proves the `ROLES:WATCH`-only actor still gets the read-only card (CR-RG-05,
      CR-RG-07).
- [ ] With a primary read that succeeded and one secondary that failed, the destination paints, the
      tabs whose datasets arrived render content, and `RouteErrorState` does **not** appear
      (CR-AC-15).
- [ ] `pnpm --filter @warehouser/web lint`, `test` and `build` clean.

## Notes

- `AccessDataset.isError` survives CH-09 precisely so these arms stay expressible; T16 must not
  remove it.
- Depends on T2 because the reachability argument only holds once `useAccessPermissions`'s set is
  `rolesTabPermissions`.
- Shares a lane with T2 and T6 on the access-workspace tab components.
