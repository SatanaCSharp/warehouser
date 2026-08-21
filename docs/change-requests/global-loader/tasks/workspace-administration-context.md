---
id: T12
title: 'Give WorkspaceAdministration a route-scoped context projection and remove both dead branches'
layer: 'ui'
deps: ['T7']
acs: ['CR-AC-05']
source_refs:
  - 'change.md#3-override-map CH-05'
  - 'change.md#3-override-map CH-13'
  - 'sad.md#46-the-non-optional-workspace-context-is-route-scoped-not-contract-wide'
  - 'sad.md#amendments-this-sad-proposes-to-specmd'
files_hint:
  - 'apps/web/src/modules/workspace/hooks/projections/useWorkspaceAdministrationContext.ts'
  - 'apps/web/src/modules/workspace/hooks/projections/useWorkspaceAdministrationContext.spec.tsx'
  - 'apps/web/src/modules/workspace/components/WorkspaceAdministration.tsx'
  - 'apps/web/src/modules/workspace/components/WorkspaceAdministration.spec.tsx'
  - 'apps/web/src/test/module-boundaries/module-surface.ts'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T12 — Give `WorkspaceAdministration` a route-scoped projection and remove both dead branches

## Why

`WorkspaceAdministration` holds the request's two **unreachable** branches:
`guards/workspace.guard.ts:19-25` already unwraps `getWorkspaceContext` in `workspaceRoute.beforeLoad`,
so RTK Query serves a fulfilled entry on first render and `isLoading` reads `false` — making the
`Spinner` branch at `:78-85` and the `if (!workspaceContext) return null` at `:87-89` dead code
(CH-05, CH-13).

Removing them honestly needs a non-optional `WorkspaceContext`, and
[`sad.md` §4.6](../sad.md#46-the-non-optional-workspace-context-is-route-scoped-not-contract-wide)
explains why that type belongs to a route-scoped projection rather than the shared contract.

## What

Add `modules/workspace/hooks/projections/useWorkspaceAdministrationContext.ts` — a **projection**
(it derives from state already loaded), so `hooks/projections/` per
[`placing-web-hooks.md`](../../../system/guides/placing-web-hooks.md) §2–§3. It reads the Workspace
match by route id — the pattern `shared/hooks/projections/useEnteredWarehouse.ts` established — and
returns a non-optional `WorkspaceContext`. `requireWorkspaceCapability` unwrapping
`getWorkspaceContext` in `beforeLoad` is what makes that type true, and the projection is the one
place that says so.

Then `WorkspaceAdministration.tsx`: no loading branch, no `if (!workspaceContext) return null`, no
`Spinner` import, no readiness field destructured from `useCurrentWorkspaceContext()`, and a return
type of `ReactElement` rather than `ReactElement | null`. Amend every optional read it drives,
including `WarehousesTab.tsx:94`'s `workspaceContext?.warehouses`.

Add both new files to `WORKSPACE_MODULE_MANIFEST`.

## Definition of Done

- [ ] `useWorkspaceAdministrationContext` returns a non-optional `WorkspaceContext`, with a spec
      proving the type guarantee inside the guarded route.
- [ ] `WorkspaceAdministration.tsx` contains no loading branch, no `if (!workspaceContext) return
    null`, imports no `Spinner`, destructures no readiness field, and returns `ReactElement`.
- [ ] `WarehousesTab.tsx:94` and the other optional reads the projection covers are amended.
- [ ] `WORKSPACE_MODULE_MANIFEST` names both new files; `module-boundaries.spec.ts` passes.
- [ ] `pnpm --filter @warehouser/web lint`, `test` and `build` clean.

## Notes

- **CR-AC-05 is implemented in its amended form.** `spec.md`'s literal second sub-clause — "narrow
  `CurrentWorkspaceContext.workspaceContext` to non-optional" — is replaced by the route-scoped
  projection ([`sad.md` §11](../sad.md#amendments-this-sad-proposes-to-specmd)). Narrowing the shared
  contract cannot be honest: `WarehouseSwitcher.tsx:164` and `RetainedContextMessage.tsx:49` read it
  from the **shell**, where no route has awaited the context, and CR-RG-08 requires the shell to keep
  observing that absence without a skeleton. The criterion's substance is unaffected.
- Therefore T16 must leave `CurrentWorkspaceContext.workspaceContext` optional and remove only
  `isLoading`.
- Shares a lane with T6 (`WorkspaceAdministration.tsx`) and T3/T4/T10 (`module-surface.ts`).
