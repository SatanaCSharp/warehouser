---
id: T15
title: 'Re-run and record the CR-AC-06 `useState` audit at `HEAD`'
layer: 'docs'
deps: ['T9', 'T10', 'T14']
acs: ['CR-AC-06']
files_hint: ['docs/change-requests/refactor-warehouse-components/change.md']
source_refs: ['docs/change-requests/refactor-warehouse-components/change.md']
owner: 'YuriiH'
estimate: 'S'
status: 'done'
---

# T15 — Re-run and record the CR-AC-06 `useState` audit at `HEAD`

## Why

CR-AC-06's judgement half — [`test-plan.md` §Review gates](../test-plan.md#review-gates) names it as a gate no static check can decide: _"that the audit table accounts for every occurrence in the three modules at `HEAD`, and that the count drops by exactly one for the reason recorded"_.

## What

Re-enumerate every `useState` in `modules/warehouse`, `modules/workspace` and `modules/access` at `HEAD` and update `change.md` §4.2's table so each occurrence is accounted for after the move and the splits.

Record the one expected delta explicitly: `WarehousePeopleList`'s `WorkspaceUser | null` becomes a boolean owned by `WarehousePersonRow` (T10), so the count drops by exactly one. Re-apply `frontend-architecture.md`'s slice test to the post-split state and confirm the conclusion is unchanged — **no** state qualifies for a Redux slice.

## Definition of Done

- [ ] every `useState` in the three modules at `HEAD` appears in the table
- [ ] the net change is exactly −1, attributed to `WarehousePeopleList` → `WarehousePersonRow`
- [ ] the slice test is re-applied and its conclusion recorded as unchanged
- [ ] no new Redux slice and no `store/` directory exists in `warehouse` or `workspace` (T14's guard)

## Notes

Documentation-only — it must not change any `apps/` file. An occurrence the table cannot account for is a finding against T9 or T10, not a reason to widen the table.
