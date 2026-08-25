---
id: T3
title: "Add the access module's Workspace-administration dataset loader and its surface entry"
layer: 'ui'
deps: []
acs: ['CR-AC-03', 'CR-RG-02']
source_refs:
  - 'change.md#3-override-map CH-03'
  - 'sad.md#54-dependency-direction-across-the-module-boundary'
  - 'adr/0001-module-owned-route-loaders.md'
files_hint:
  - 'apps/web/src/modules/access/loaders/workspace-administration-datasets.loader.ts'
  - 'apps/web/src/test/module-boundaries/module-surface.ts'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T3 — Add the access module's Workspace-administration dataset loader and its surface entry

## Why

`/workspace` is composed from two modules: the destination and the Warehouses tab belong to
`modules/workspace`, and the Roles, Members and Permissions tabs come from `modules/access`. Its
loader must have the same shape, or `modules/workspace` would have to learn which Permissions gate
the access module's datasets. [`sad.md` §5.4](../sad.md#54-dependency-direction-across-the-module-boundary)
keeps that division: the workspace side passes the resolved `workspacePermissionIds` and the access
module applies its own gates. Recorded in
[ADR 0001](../adr/0001-module-owned-route-loaders.md).

Landing this before T4 means T4 imports a finished surface entry rather than inverting a dependency.

## What

Add `modules/access/loaders/workspace-administration-datasets.loader.ts` exporting
`loadWorkspaceAdministrationAccessDatasets`. It takes the resolved `workspacePermissionIds` and the
store, and returns the dispatch thunks for the three datasets its own gates admit — leaving the
caller to settle them in one round:

| Dataset                    | Gate                      |
| -------------------------- | ------------------------- |
| `listWorkspaceMembers`     | `WORKSPACE_MEMBERS:WATCH` |
| `listWorkspaceRoles`       | `WORKSPACE_ROLES:WATCH`   |
| `listWorkspacePermissions` | `WORKSPACE_ROLES:WATCH`   |

Every dispatch uses `subscribe: false`, mirroring `guards/workspace.guard.ts:19-25` and
`guards/warehouse-entry.guard.ts:19-25` ([`sad.md` §4.4](../sad.md#44-subscribe-false-plus-force-mounted-panels)).

Add the file to `MODULE_SURFACE.access` in `src/test/module-boundaries/module-surface.ts`, annotated
with its importer (`modules/workspace/loaders/workspace-administration.loader.ts`) as every entry
there is. This is the **only** new `MODULE_SURFACE.access` entry in the request.

The loader must not import a page: `route.tsx` is already in the router chunk, and importing a page
would defeat the lazy `import('./page')` chunk boundary (`sad.md` §8).

## Definition of Done

- [ ] `loadWorkspaceAdministrationAccessDatasets` dispatches exactly the three datasets above under
      exactly those gates, with `subscribe: false`, and issues nothing for an actor holding neither
      watch Permission.
- [ ] It receives `workspacePermissionIds` as an argument and reads no Permission of its own from the
      workspace module's side of the boundary.
- [ ] `MODULE_SURFACE.access` names it with its importer and `module-boundaries.spec.ts` passes.
- [ ] The loader imports no page module.
- [ ] `pnpm --filter @warehouser/web lint` and `test` clean.

## Notes

- Shares a lane with T4, T10 and T12 on `module-surface.ts`; T4 and T12 depend on this ordering
  transitively, T10 lands much later.
- `listWorkspaceUsers` is **not** here. It is dispatched once, by the workspace side (T4), as one
  cache entry serving both `WarehousesTab.tsx:66`'s people counts and `useWorkspaceUsers`'s candidate
  list — which is why CR-RG-02 lists it as one row, not two.
