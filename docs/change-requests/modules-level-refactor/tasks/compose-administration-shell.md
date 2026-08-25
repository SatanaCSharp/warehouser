---
id: T17
title: 'Compose the administration shell across modules and reduce workspace to its manifest'
layer: 'ui'
deps: ['T15', 'T16']
acs: ['CR-AC-03', 'CR-AC-04', 'CR-RG-01']
files_hint:
  - 'apps/web/src/modules/workspace/components/WorkspaceAdministration.tsx'
  - 'apps/web/src/modules/workspace/components/WorkspaceAdministration.spec.tsx'
  - 'apps/web/src/modules/workspace/'
source_refs: ['CH-W3']
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T17 — Compose the administration shell across modules and reduce `workspace` to its manifest

## Why

`WorkspaceAdministration` composes four tabs it also owned the implementation of. After T15 and T16 it
owns none of them, and [CR-AC-03](../spec.md#cr-ac-03-cr-us-01-ch-w3--structure) reduces
`modules/workspace` to the route, the shell and Workspace naming. The shell importing four page-level
views across module boundaries is the **new convention** this request establishes — additive, legalizing
something no code did before ([sad §6.3](../sad.md#63-cross-module-tab-composition-on-the-web-cr-ac-03-cr-ac-04)).

## What

- Update `WorkspaceAdministration.tsx` to import `WarehousesTab` from `modules/warehouse` and
  `WorkspaceRolesTab`, `WorkspaceMembersTab`, `WorkspacePermissionsTab` from `modules/access`. **Only the
  import specifiers change** — the tab set, tab order, gating predicates via
  `shared/hooks/useWorkspacePermissions`, and rendered output stay identical.
- Update `WorkspaceAdministration.spec.tsx`'s import specifiers for the cross-module tabs; its tab-set,
  order, gating and rendered-copy assertions are **behavioral and may not change**.
- Verify `modules/workspace/` now contains exactly: `route.tsx`, `page.tsx`,
  `components/WorkspaceAdministration.tsx` + its spec,
  `components/workspace-administration/NameWorkspaceAction.tsx`, `NameWorkspaceDialog.tsx`,
  `schemas/name-workspace-form.schema.ts`, `hooks/useRenameWorkspace.ts`. Nothing else — no file that
  CH-W1, CH-W2 or CH-W3 does not name a destination for, and **none of the six multi-consumer helpers**.

## Definition of Done

- [ ] The shell renders the **same four tabs, in the same order, under the same gating predicates**, with
      two of them now imported from sibling modules.
- [ ] `modules/workspace/` matches CR-AC-03's enumeration exactly — verified by listing, and locked
      mechanically by T19's manifest assertion.
- [ ] `pnpm --filter @warehouser/web lint && test && build` green; the shell's 511-line spec passes with
      import-specifier diffs only.
- [ ] `apps/web/src/router.spec.tsx` passes with import-specifier changes only — the `/workspace` route
      registration is unchanged.
- [ ] The web build produces **no new eager chunk** and preserves every lazy route boundary: the
      `/workspace` route already loaded all four tab components, so only their file paths changed.

## Notes

This task depends on T4 having landed `placing-web-components.md`'s narrowing — read literally, the old
rule required a component with a second-module consumer be promoted to `shared/components/`, which would
put `WarehousesTab` and the Warehouse domain back **outside** its module. That is the one canonical
document that instructed the opposite of this request, which is why it was amended before any code moved
([sad §4.6](../sad.md#46-documentation-lands-before-the-code-it-governs)). The four new imports are
declared surface of their modules in T19's declaration, so the boundary rule still passes with an empty
exception list.
