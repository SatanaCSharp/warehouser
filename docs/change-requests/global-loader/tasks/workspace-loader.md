---
id: T4
title: 'Add loadWorkspaceAdministration and give workspaceRoute its loader'
layer: 'ui'
deps: ['T1', 'T3']
acs: ['CR-AC-02', 'CR-AC-03', 'CR-AC-15', 'CR-RG-02']
source_refs:
  - 'change.md#3-override-map CH-03'
  - 'change.md#3-override-map CH-15'
  - 'sad.md#55-what-each-loader-awaits'
  - 'sad.md#42-primary-reads-reject-secondary-reads-settle'
files_hint:
  - 'apps/web/src/modules/workspace/loaders/workspace-administration.loader.ts'
  - 'apps/web/src/modules/workspace/loaders/workspace-administration.loader.spec.ts'
  - 'apps/web/src/modules/workspace/route.tsx'
  - 'apps/web/src/test/module-boundaries/module-surface.ts'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T4 — Add `loadWorkspaceAdministration` and give `workspaceRoute` its loader

## Why

Rollout step 2 of [`change.md` §6](../change.md#6-rollout), still additive. Today each of the four
administration tabs fetches its own dataset after the page mounts, so `/workspace` assembles itself
in pieces. CH-03 moves those reads to the route so the destination paints complete.

Derives from [`sad.md` §5.5](../sad.md#55-what-each-loader-awaits) and
[§4.2](../sad.md#42-primary-reads-reject-secondary-reads-settle);
[ADR 0001](../adr/0001-module-owned-route-loaders.md) is why the function lives under `loaders/`
rather than in `route.tsx`.

## What

Add `modules/workspace/loaders/workspace-administration.loader.ts` and declare it as
`workspaceRoute.loader`. `route.tsx` gains one line and no dispatch.

Two phases, with no per-dataset error handling
([`sad.md` §4.2](../sad.md#42-primary-reads-reject-secondary-reads-settle)):

1. **Primary** — `await` `getWorkspaceContext`, unwrapped. A rejection propagates out of the loader
   and reaches `RouteErrorState`. `requireWorkspaceCapability` has already awaited it in
   `beforeLoad`, so this resolves from cache without a second request.
2. **Secondary** — one `Promise.allSettled` round over every dataset the actor's admitted surfaces
   would fetch, per `sad.md` §5.5:

   | Dataset                                                    | Gate                      | Gate kind      |
   | ---------------------------------------------------------- | ------------------------- | -------------- |
   | `listWorkspaceWarehouses`                                  | `WAREHOUSES:WATCH`        | tab descriptor |
   | `listWorkspaceUsers`                                       | `WORKSPACE_MEMBERS:WATCH` | hook skip      |
   | T3's three via `loadWorkspaceAdministrationAccessDatasets` | see T3                    | hook skip      |

   `allSettled` **is** the settle semantics — no `catch` per dataset, nothing swallowed silently. A
   failed entry is already in the cache with `isError: true`, which the component's own error arm
   renders (CR-AC-15). It also bounds the wait by the slowest admitted dataset rather than their sum,
   which is `spec.md` §6 row 1's target.

Every dispatch uses `subscribe: false`.

Add the loader and its spec to `WORKSPACE_MODULE_MANIFEST`.

## Definition of Done

- [ ] `workspaceRoute` declares `loadWorkspaceAdministration`; the loader body contains the two
      phases above and `route.tsx` contains no dispatch.
- [ ] The colocated spec proves: a rejected **primary** propagates out of the loader; a rejected
      **secondary** is absorbed and the loader resolves (CR-AC-15).
- [ ] The spec proves all five secondary datasets are dispatched in **one** round, not sequentially
      (`spec.md` §6 row 1's structural measurement).
- [ ] The spec proves an actor holding only `WORKSPACE:RENAME` causes **no** secondary dispatch
      (CR-AC-03's second clause).
- [ ] The spec covers each of CR-RG-02's five `workspaceRoute` rows under its stated gate kind, in
      both directions.
- [ ] `WORKSPACE_MODULE_MANIFEST` names both new files and `module-boundaries.spec.ts` passes.
- [ ] `pnpm --filter @warehouser/web lint` and `test` clean.

## Notes

- **`listWorkspaceWarehouses` has no hook skip.** `WarehousesTab.tsx:51-52` is ungated; its real gate
  is the tab descriptor's `WAREHOUSES:WATCH` at `WorkspaceAdministration.tsx:56-58`. Conflating the
  three gate kinds is the mistake CR-RG-02 exists to catch, and this row is the one T8 has to cover
  by test because no constant exists for it.
- `listWorkspaceUsers` is dispatched **once**, from the workspace side — one cache entry serving both
  `WarehousesTab.tsx:66` and `useWorkspaceUsers`.
- Shares a lane with T1 (`route.tsx`) and T3/T10/T12 (`module-surface.ts`).
- The loader must not import a page module (`sad.md` §8's chunk-boundary note).
