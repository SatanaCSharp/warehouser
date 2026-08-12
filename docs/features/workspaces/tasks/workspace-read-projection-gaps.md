---
id: T41
title: 'Aggregate assignedMemberCount and isWorkspaceMember in the Workspace reads'
layer: 'infra'
deps: ['T9', 'T24']
acs: ['AC-14', 'AC-33']
files_hint:
  [
    'apps/server/src/shared/domain/repositories/workspace-read.repository.ts',
    'apps/server/src/workspaces/rest/controllers/workspace.controller.ts',
  ]
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T41 — Aggregate `assignedMemberCount` and `isWorkspaceMember` in the Workspace reads

## Why

Added during `implement`, not by `tasks`. [T24](./workspace-rest-surface.md) wired the
Workspace-level REST surface and found that two fields the contract **requires** are not produced by
[T9](./workspace-read-repository.md)'s `WorkspaceReadRepository`. Rather than invent data, T24 served
the contract shape minus those fields, typed as `Omit<…>`, and raised the gap. This task closes it.

The Warehouse level already proves the shape: `AccessReadRepository` aggregates its own
`assignedMemberCount` (`apps/server/src/shared/domain/repositories/access-read.repository.ts`), so
this is a known technique applied one level up, not a new design.

## What

- `listWorkspaceRolesWithPermissions` — aggregate `assignedMemberCount`, the number of
  `workspace_memberships` rows carrying each Workspace Role. A Role with no members must return `0`,
  not be absent from the result. Mirror the Warehouse-level aggregation rather than inventing a
  second style.
- The Workspace Users projection — carry `isWorkspaceMember`, the existence of a
  `workspace_memberships` row for that `user_id`. Per AC-21 the flag must survive the User losing
  every **Warehouse** membership, so it is derived from Workspace membership alone and never from a
  Warehouse join.
- Remove the two `Omit<…>` workarounds in `workspaces/rest/controllers/workspace.controller.ts` and
  the comments that point at this task, so `GET /roles`, `PATCH /roles/{id}` and `GET /users` return
  the full contract shape.

## Definition of Done

- [ ] Repository integration test: `assignedMemberCount` counts exactly the memberships carrying each
      Workspace Role, returns `0` for an unassigned Role, and never counts across Workspaces.
- [ ] Repository integration test: `isWorkspaceMember` is `true` for a User holding a Workspace
      membership and `false` for a User of the Workspace who holds none, and stays `true` for a
      Workspace Member who holds no Warehouse membership at all (AC-21).
- [ ] The controller returns the full `WorkspaceRole` and `WorkspaceUser` contract shapes; both
      `Omit<…>` aliases are gone.
- [ ] The contract tests for `WorkspaceRole` and `WorkspaceUser` pass against the real handler shape.
- [ ] lint + vet clean.

## Notes

**This task blocks [T38](./workspace-roles-tab.md) and [T39](./workspace-members-tab.md).** The roles
tab renders the member count per Role and the members tab distinguishes Workspace Members from
candidate Users; neither can be built against a projection that omits those fields, and both would
otherwise type-check against a shape the server does not actually return.

Its evidence is entirely integration-level, so it cannot be proven on a machine without Docker —
see the run notes in the handoff. Do **not** widen the Users projection while here: it deliberately
carries no Warehouse Role ([api-sync-report.md](../contracts/api-sync-report.md) **F-5**).
