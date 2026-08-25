---
id: T19
title: "Declare each web module's surface and enforce it with a boundary spec"
layer: 'tests'
deps: ['T18']
acs: ['CR-AC-04', 'CR-AC-12']
files_hint:
  - 'apps/web/src/test/module-surface.ts'
  - 'apps/web/src/modules/module-boundaries.spec.ts'
  - 'apps/web/src/modules/fixtures/'
source_refs: ['CH-W5']
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T19 — Declare each web module's surface and enforce it with a boundary spec

## Why

`apps/web` has **no** import-boundary enforcement today: its boundaries are prose in
`frontend-architecture.md` and `eslint.config.mjs` carries no `no-restricted-paths` rule
([CH-W5](../change.md#3-override-map)). A layout without an executable rule regresses at the first
feature with nowhere obvious to go, so [CR-AC-12](../spec.md#cr-ac-12-cr-us-03-ch-w5-ch-s6--boundary)
requires a spec that fails and names the file and the rule.

## What

Per [ADR 0001](../adr/0001-enumerated-web-module-surface-declaration.md), which chose an enumerated
declaration read as data over per-module `index.ts` barrels (barrels would defeat the lazy
`import('./page')` boundary at `router.ts` — the "no new eager chunk" NFR):

- Add `apps/web/src/test/module-surface.ts` exporting `MODULE_SURFACE`, mapping each module name to the
  import specifiers other code may reach. The declared surface is the **nine** entries
  [sad §5.2](../sad.md#52-web-modules-after-the-move) enumerates plus T17's four tab entries:
  every module's `route`; `modules/auth/{session/session, sign-out/components/SignOutButton,
store/auth.selectors, store/auth.slice}`; `modules/warehouse/hooks/useRecordWarehouseEntry`;
  `modules/warehouse/…/WarehousesTab`; and `modules/access/…/Workspace{Roles,Members,Permissions}Tab`.
- Add `apps/web/src/modules/module-boundaries.spec.ts` — mirroring the server's colocated
  `module-boundaries.spec.ts` naming — asserting three things:
  1. `MODULE_SURFACE`'s keys are **exactly** the directories directly under `modules/` (the flat-module
     identity check);
  2. every `modules/**` import from a file outside that module resolves to an entry in the target
     module's list — sibling modules and composition layer alike;
  3. `modules/workspace` contains exactly CR-AC-03's file manifest.
- Add a negative fixture under `apps/web/src/modules/fixtures/` importing a non-surface path, outside any
  scanned production tree, following the `tests/access/fixtures/` precedent.

## Definition of Done

- [ ] The spec passes with an **empty exception list** — only the per-module surface declaration is
      consulted. Every legal import today resolves to a declared entry, including the three
      `selectCurrentUser` call sites and the composition layer's imports of module internals.
- [ ] **None of `shared/layouts/WarehouseLayout.tsx`, `shared/layouts/RootLayout.tsx` or
      `guards/auth.guard.ts` is edited** — they are made legal by _declaring_ their targets, not by
      changing them (CR-RG-07).
- [ ] The fixture importing an undeclared path **fails**, and the message names the importer, the target
      and the rule.
- [ ] A file added to `modules/workspace` fails the manifest and is named — it stays failing until someone
      deliberately amends the manifest, which is the point.
- [ ] `modules/auth`'s `login/`, `sign-up/` and `sign-out/` route sub-trees **pass** the flatness check: a
      module may organize routes of its own entity into sub-directories.
- [ ] `pnpm --filter @warehouser/web lint && test && build` green.

## Notes

The declaration lives under `src/test/` because it is data consumed only by a spec, and
[frontend-architecture.md](../../../system/frontend-architecture.md) §"Testing" reserves that directory
for cross-cutting test support. **A declared entry is the rule's input, not an exception** — an exception
is an import permitted _despite_ violating the rule, and this request admits none; the test is whether an
entry would fail if the list were empty ([change.md §6](../change.md#6-rollout) abort threshold). What the
spec cannot decide is _whose invariants does this file enforce?_ — [sad §4.7](../sad.md#47-flatness-is-a-property-of-module-identity-not-of-directory-depth)
concedes it is human, and the manifest exists to force the answer rather than compute it.
[sad §11 R5](../sad.md#risks) is the residual risk: someone can widen the declaration instead of fixing a
misplaced import, catchable only by review of a one-file diff.
