---
id: T8
title: "Repoint the boundary machinery's stale paths and qualify its predecessor identifiers"
layer: 'tests'
deps: ['T7']
acs: ['CR-AC-02', 'CR-RG-07']
files_hint:
  [
    'apps/web/src/modules/module-boundaries.spec.ts',
    'apps/web/src/test/module-surface.ts',
    'apps/web/src/modules/access/hooks/workspace-role-name-validation.spec.ts',
  ]
source_refs:
  [
    'apps/web/src/modules/module-boundaries.spec.ts',
    'apps/web/src/test/module-surface.ts',
    'apps/web/src/modules/access/hooks/workspace-role-name-validation.spec.ts',
  ]
owner: 'YuriiH'
estimate: 'S'
status: 'done'
---

# T8 — Repoint the boundary machinery's stale paths and qualify its predecessor identifiers

## Why

[`spec.md` CR-AC-02](../spec.md#cr-ac-02-cr-us-02-ch-w3ch-w4--enforced-boundary)'s second clause, plus the third site [`sad.md` §5.6](../sad.md#56-boundary-machinery-after-the-move) found outside CR-AC-02's original scope — the one `spec.md` CR-RG-07 was amended for (`sad.md` §11 O2).

## What

Four sites, all comment or message text:

| Site                                                                                                        | Fix                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `module-boundaries.spec.ts` SCAN SCOPE comment                                                              | `modules/warehouse/hooks/warehouse-name-validation.spec.ts` → its `modules/workspace` path                                       |
| `test/module-surface.ts` `MODULE_SURFACE.auth` comment                                                      | "`modules/access` and `modules/warehouse`" → "`modules/access` and `modules/workspace`"; the count stays **three** call sites    |
| `module-boundaries.spec.ts` header `(CH-W5)`, `SURFACE_RULE` `(CR-AC-04)`, manifest docblock `per CR-AC-03` | qualify each with its owning request, e.g. `modules-level-refactor CR-AC-03` — **do not renumber** to this request's identifiers |
| `modules/access/hooks/workspace-role-name-validation.spec.ts:17-18`                                         | re-point the moved path — the single comment hunk CR-RG-07 now permits in `modules/access`                                       |

`SURFACE_RULE`'s message text may be reworded freely: CR-AC-02 states that editing a rule description is not assertion drift, and `module-boundaries.spec.ts` is not a moved spec.

## Definition of Done

- [ ] `grep -rn 'modules/warehouse/hooks/warehouse-name-validation' apps/web/src` returns zero hits
- [ ] each of the three predecessor identifiers reads with its owning request name and none is renumbered
- [ ] the `modules/access` diff for this task is exactly one comment hunk — nothing executable changes
- [ ] the boundary spec still passes with an empty exception list
- [ ] `pnpm --filter @warehouser/web lint && test` clean

## Notes

**CR-RG-07 hard rule.** The `modules/access` edit is _one comment hunk and nothing else_. Any executable change in `modules/access` here is a CR-RG-07 failure.

Shares a lane with T7 (both touch `test/module-surface.ts`), so it is serialized behind it — which is intended: T7 must stay content-free for `sad.md` §4.3's diff property to hold.
