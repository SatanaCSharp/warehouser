---
id: T16
title: 'Move the workspace scope of Access into modules/access'
layer: 'ui'
deps: ['T14']
acs: ['CR-AC-02', 'CR-AC-03', 'CR-RG-01']
files_hint:
  - 'apps/web/src/modules/access/components/workspace-administration/'
  - 'apps/web/src/modules/access/api/'
  - 'apps/web/src/modules/access/hooks/'
  - 'apps/web/src/modules/access/schemas/workspace-role-form.schema.ts'
  - 'apps/web/src/modules/workspace/'
source_refs: ['CH-W2']
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T16 — Move the workspace scope of Access into `modules/access`

## Why

`modules/access/` is warehouse-scoped exclusively while a near-duplicate workspace-scoped implementation
of the same capability sits in `modules/workspace/` ([CH-W2](../change.md#3-override-map)).
[CR-AC-02](../spec.md#cr-ac-02-cr-us-02-ch-w2-ch-w4--structure) makes `access` carry both scopes so a
contributor extends one implementation instead of choosing between two, with the scope in the file and
symbol names rather than in a second module.

## What

Move into `apps/web/src/modules/access/`:

- The 26 components + three specs from
  `modules/workspace/components/workspace-administration/{members,roles,permissions}/` →
  `modules/access/components/workspace-administration/{members,roles,permissions}/`. They sit as
  scope-named siblings of the existing warehouse-scoped `access-workspace/` tree: `WorkspaceRolesTab`
  beside `RolesTab`, `WorkspaceMembersTab` beside `MembersTab`.
- `api/workspace-members-api.ts` and `api/workspace-roles-api.ts` → `modules/access/api/`.
  **Not** `workspace-users-api.ts` — T14 sent it to `shared/api/`.
- The thirteen hooks: `useWorkspaceMembers`, `useWorkspaceUsers`, `useWorkspaceRoles`,
  `useAddWorkspaceMember`, `useRemoveWorkspaceMember`, `useAssignWorkspaceRole`,
  `useTransferWorkspaceOwner`, `useSaveWorkspaceRole`, `useDeleteWorkspaceRole`,
  `useWorkspacePermissionLabel`, `workspace-permission-groups`, `workspace-role-name-validation`.
  `useWorkspacePermissionLabel` lands beside `usePermissionLabel.ts` as the scope-named second file — it
  has a single destination and is **not** shared.
- `schemas/workspace-role-form.schema.ts`.
- The workspace-role half of `name-validation.spec.ts`, colocated with
  `workspace-role-name-validation.ts`.

## Definition of Done

- [ ] Every file above resolves from `modules/access/`, and **no file left under `modules/workspace/`
      enforces an Access role, permission, member or membership rule**.
- [ ] Each moved file's scope is expressed in its **name**, not in a directory that constitutes a second
      module — no nested module appears inside `access`.
- [ ] `pnpm --filter @warehouser/web lint && test && build` green with **no assertion changed** but file
      locations and import specifiers; the three large workspace tab specs move untouched.
- [ ] T2's split-case gate confirms the workspace-role half of `name-validation.spec.ts` lost no case.
- [ ] Both scopes coexist: the pre-existing warehouse-scoped `roles`, `members` and `permissions`
      surfaces still render their own copy, and no file was overwritten by an incoming same-named one.

## Notes

Name collisions are the mechanical hazard here — `access` already has `RolesTab`, `MembersTab`,
`PermissionsTab`, `RoleEditor`, `RoleList`, `PermissionCheckbox` and `useFormFieldErrors`. Every incoming
file keeps its `Workspace`-prefixed name for exactly that reason; **no incoming file may overwrite an
existing one**. i18n is deliberately deferred to T18, where the three colliding locale blocks get their
scope-named parents in the same commit as the `t()` namespace arguments. Serialized with T14, T15 and T17
by the shared `modules/workspace/` directory.
