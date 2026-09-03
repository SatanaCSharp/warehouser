---
id: T25
title: 'Raise the ordering change request and promote @ObservedPermission into docs/system'
layer: 'docs'
deps: [T5]
acs: ['AC-15', 'AC-19', 'AC-18', 'AC-09a']
files_hint:
  - 'docs/change-requests/'
  - 'docs/system/'
  - 'docs/system/server-index.md'
owner: 'Tech Lead'
estimate: 'M'
status: 'todo'
---

# T25 — Raise the ordering change request and promote @ObservedPermission into docs/system

## Why

Two documentation debts would otherwise ship silently. [sad.md §11](../sad.md) records the first as an **outstanding gate due before `tasks`**: this feature makes four amendments to the approved `ordering` specification and no change request exists, so a reviewer reading `ordering` alone still finds it contradicted. The second is that `@ObservedPermission` is new shared authorization infrastructure, and a reader of the documented authorization stage would find it incompletely described.

## What

Raise the change request against `ordering` under `docs/change-requests/` covering all four amendments: the narrowed loose-linking boundary (AC-15), the crossed "ends where the goods arrive" non-goal (AC-19), the per-line closure replacing the once-per-draft one (AC-19), and the extended Demand Snapshot (AC-18). Separately, promote the observed-Permission stage into `docs/system` and update `docs/system/server-index.md` in the same change.

## Definition of Done

- [ ] All four amendments are recorded with the `ordering` sections they amend, so `ordering` is no longer self-contradictory to a reader who opens it alone.
- [ ] The record states that the closure change reaches **every** Purchase Draft, not only those holding a direct line.
- [ ] The observed-Permission stage is documented in `docs/system` beside the two-level authorization stage it extends.
- [ ] `docs/system/server-index.md` gains its entry in the **same** change, per the repository rule that adding a system document updates its index.
- [ ] No production code changes in this task.

## Notes

Sequenced early and blocking nothing so it cannot be squeezed out at the end — which is how it went missing in the first place. Owner per [sad.md §11](../sad.md): PM for the change request, Tech Lead + Security Lead for the system promotion.
