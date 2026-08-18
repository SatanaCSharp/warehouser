---
id: T16
title: 'Guard the CR-RG-07 neighbour trees against `baseline_revision`'
layer: 'tests'
deps: ['T7', 'T14']
acs: ['CR-RG-07']
files_hint: ['apps/web/src/test/baselines']
source_refs: []
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T16 — Guard the CR-RG-07 neighbour trees against `baseline_revision`

## Why

[`spec.md` CR-RG-07](../spec.md#cr-rg-07--the-untouched-neighbours) is the fence around the whole request: the evidence that a behavior-preserving refactor did not leak into its neighbours. It is also the fallback evidence CR-RG-06 leans on when the container runtime is missing.

## What

Add a guard that diffs the five fenced trees against the committed baseline and classifies every hunk, admitting only:

| Tree                                | Permitted                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/access`                    | `shared/api` import specifiers in its 33 importing files, **plus** the single comment hunk at `hooks/workspace-role-name-validation.spec.ts:17-18` (T8) |
| `modules/home`                      | none — byte-identical                                                                                                                                   |
| `modules/auth`                      | the `auth.slice.spec.ts` rename plus `shared/api` import specifiers in its 2 importing files                                                            |
| `apps/server`, `packages/contracts` | none — byte-identical                                                                                                                                   |

Any hunk outside that table fails, naming the file and the hunk.

## Definition of Done

- [ ] the guard passes at `HEAD`
- [ ] `git diff --name-status 42f1205 -- apps/server packages/contracts apps/web/src/modules/home` is empty
- [ ] `modules/access`'s diff is import specifiers plus exactly one comment hunk — nothing executable
- [ ] the guard fails when a non-import hunk is introduced into any fenced tree
- [ ] `pnpm --filter @warehouser/web lint && test` clean

## Notes

The `modules/access` comment carve-out exists only because `spec.md` CR-RG-07 was amended before this breakdown (`sad.md` §11 O2). It is **one** hunk at one location — do not generalize it to "comments are free".

`modules/access/components/workspace-administration/*` is **unmoved** and otherwise unedited: no file added, removed or renamed (`spec.md` §3, unconditional).
