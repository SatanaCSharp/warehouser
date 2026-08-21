---
id: T11
title: 'Drop the four Workspace-administration tab readiness arms'
layer: 'ui'
deps: ['T7']
acs: ['CR-AC-08', 'CR-RG-05']
source_refs:
  - 'change.md#3-override-map CH-08'
  - 'change.md#3-override-map CH-14'
  - 'sad.md#48-what-replaces-each-collapsed-guard'
files_hint:
  - 'apps/web/src/modules/access/components/workspace-administration/permissions/WorkspacePermissionsTab.tsx'
  - 'apps/web/src/modules/access/components/workspace-administration/permissions/WorkspacePermissionsTab.spec.tsx'
  - 'apps/web/src/modules/access/components/workspace-administration/roles/WorkspaceRolesTab.tsx'
  - 'apps/web/src/modules/access/components/workspace-administration/roles/WorkspaceRolesTab.spec.tsx'
  - 'apps/web/src/modules/access/components/workspace-administration/members/WorkspaceMembersTab.tsx'
  - 'apps/web/src/modules/access/components/workspace-administration/members/WorkspaceMembersTab.spec.tsx'
  - 'apps/web/src/modules/access/components/workspace-administration/members/WorkspaceMemberList.tsx'
owner: 'YuriiH'
estimate: 'S'
status: 'todo'
---

# T11 — Drop the four Workspace-administration tab readiness arms

## Why

The remaining CH-08 skeleton surface (`WorkspacePermissionsTab`'s `Skeleton`) and three of CH-14's
call-site branches all sit on the `/workspace` tabs, and all four are unreachable once the route
loader has awaited their datasets. The rule for each is
[`sad.md` §4.8](../sad.md#48-what-replaces-each-collapsed-guard)'s: **keep the permission arm, keep
the error arm, drop the readiness term.**

## What

- `WorkspacePermissionsTab` renders no `Skeleton`.
- Drop the readiness terms at `WorkspaceRolesTab.tsx:31`, `WorkspaceMembersTab.tsx:27` and
  `WorkspaceMemberList.tsx:27`.
- `empty` becomes `items.length === 0`.

**No branch replaces the not-permitted arm** at these four sites. Each of these hooks gates on the
same Permission that admits its tab, so an actor who reaches the mounted tab is necessarily inside
the skip set and the _not-permitted_ arm is unreachable — CR-RG-05's reachability argument, which is
exactly what T2's widening and T6's force-mounting make true.

## Definition of Done

- [ ] `WorkspacePermissionsTab` renders no `Skeleton`, and none of `WorkspaceRolesTab.tsx:31`,
      `WorkspaceMembersTab.tsx:27` or `WorkspaceMemberList.tsx:27` retains a readiness term
      (CR-AC-08).
- [ ] **No `?? []` default is introduced.** `useWorkspaceRoles` and `useWorkspacePermissionCatalogue`
      are not among CH-09's five contract files, so `undefined` survives the change in the type;
      defaulting it would render `workspaceMembers.empty` as a false statement after a failed or
      evicted read (CR-RG-05).
- [ ] `workspaceRoles.empty`, `workspaceMembers.empty` and `workspacePermissions.empty` still render
      in their own cases (CR-RG-05).
- [ ] No capability boolean is introduced at any of the four sites (CR-RG-07).
- [ ] `pnpm --filter @warehouser/web lint`, `test` and `build` clean.

## Notes

- `MemberListStatus`'s narrowing to `'empty' | 'ready' | 'searchEmpty'` is **not** here — it lives in
  `MemberList.tsx` on the access surface and belongs to T14, which owns that file.
- These four sites are where reachability replaces a branch. `RolesTab.tsx:46` is the one site where
  admission is _wider_ than the dataset's gate, and T2 closes that gap rather than a branch — T15
  handles it.
