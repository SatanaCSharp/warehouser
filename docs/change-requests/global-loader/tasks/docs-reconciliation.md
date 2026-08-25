---
id: T19
title: "Reconcile the nine docs/system rows and close CR-AC-01's documentation gate"
layer: 'docs'
deps: ['T18']
acs: ['CR-AC-01']
source_refs:
  - 'change.md#3-override-map CH-01'
  - 'change.md#8-canonical-reconciliation-after-pass'
  - 'sad.md#additions-to-changemd-8s-reconciliation-table'
  - 'adr/0001-module-owned-route-loaders.md'
files_hint:
  - 'docs/system/frontend-architecture.md'
  - 'docs/system/guides/writing-web-components.md'
  - 'docs/system/guides/adding-a-web-module.md'
  - 'docs/system/web-index.md'
  - 'apps/web/src/test/readiness-documentation/readiness-documentation.spec.ts'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T19 — Reconcile the nine `docs/system` rows and close CR-AC-01's documentation gate

## Why

Four `docs/system` passages instruct the arrangement this request replaces, and two more describe a
source tree that no longer matches. Rollout step 6 of [`change.md` §6](../change.md#6-rollout) puts
this at **ship**, after review passes — and per this stage's decision it is a task **on this branch**,
so CR-AC-01 is covered and the documentation gate goes green with the branch's final commit rather
than after merge.

## What

Apply all nine rows — [`change.md` §8](../change.md#8-canonical-reconciliation-after-pass)'s seven
plus [`sad.md` §11](../sad.md#additions-to-changemd-8s-reconciliation-table)'s two:

| Owner                                         | Edit                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-architecture.md` §Page              | First-paint readiness of a destination is owned by its **route**; the narrowest-owner rule keeps governing error, empty and success only |
| `frontend-architecture.md` §Route             | Extend the loader-wiring bullet: a route awaits the data its destination paints                                                          |
| `frontend-architecture.md` §Source structure  | Add `loaders/` to the `modules/<module>/` tree as plain route data functions, per ADR 0001                                               |
| `guides/adding-a-web-module.md`               | State when a new route declares a loader and where that loader's file goes                                                               |
| `guides/writing-web-components.md:21` §1      | `DatasetSkeleton` no longer exists — `DatasetMessage` alone is the private-helper example                                                |
| `guides/writing-web-components.md` §3         | The Tab/panel container resolves capabilities and renders datasets its **route already awaited**                                         |
| `guides/writing-web-components.md:104-106` §4 | "callers just read `.items` and `.isReady`" → `.items` only                                                                              |
| `guides/writing-web-components.md` §6         | Replace the `!members.isReady` early-return example with one branching on **permission and empty** only                                  |
| `web-index.md`                                | No new document, so no new entry — confirm the amended guide descriptions still match their entries                                      |

Add `src/test/readiness-documentation/readiness-documentation.spec.ts` — the document-content gate for
CR-AC-01.

## Definition of Done

- [ ] All nine rows are applied.
- [ ] `writing-web-components.md` §6's replacement example **compiles** against the post-CH-09
      contract — the old one does not.
- [ ] No amended passage names a removed symbol (`DatasetSkeleton`, `.isReady`, a deleted skeleton).
- [ ] `readiness-documentation.spec.ts` asserts the document content and is **green** — this is the
      commit that turns it from red to green.
- [ ] `docs/system/web-index.md`'s entry descriptions still match the documents they name (AGENTS.md
      requires the index stay current with any `docs/system` change).
- [ ] `pnpm --filter @warehouser/web lint` and `test` clean.

## Notes

- **CR-AC-01's gate is red for the whole implementation, by design**
  ([`test-plan.md` § Sequencing](../test-plan.md#sequencing)). It must not be weakened or skipped to
  buy an earlier green.
- CH-01 amends a `docs/system` document rather than adding a decision record, so **no ADR is created
  here**. The two feature ADRs are already Accepted.
- No feature specification under `docs/features/` states a loading rule, so none is edited. No roadmap
  item is created: this is an internal consistency change, not a portfolio outcome
  (`change.md` §8, `_shared/work-item.md`).
- Inherited decisions this change applies without re-deciding stay untouched: RTK Query as the only
  server-state mechanism (02-08-2026), declarative permission gating (19-08-2026), placement by scope
  of exercise (18-08-2026), centralized public translations (27-07-2026).
