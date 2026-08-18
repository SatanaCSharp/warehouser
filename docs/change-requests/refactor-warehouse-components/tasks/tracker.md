# Tracker — change-request: refactor-warehouse-components

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                                                                       | Layer | Owner  | Estimate | Blocked by     | Status |
| --- | ------------------------------------------------------------------------------------------ | ----- | ------ | -------- | -------------- | ------ |
| T1  | Capture the three `baseline_revision` comparison artifacts                                 | tests | YuriiH | M        | —              | done   |
| T2  | Author CH-D2's system ADR — the narrowed placement rule                                    | docs  | YuriiH | L        | —              | done   |
| T3  | Supersede ADR 14-08-2026 and re-list both ADRs in `web-index.md`                           | docs  | YuriiH | S        | T2             | done   |
| T4  | Reconcile `placing-web-components.md` §"When not to nest"                                  | docs  | YuriiH | S        | T2             | done   |
| T5  | Reconcile `adding-a-web-module.md` at its four contradicting statements                    | docs  | YuriiH | M        | T2             | done   |
| T6  | Reorganize `shared/api` into four domain directories and rewrite its 68 importers          | infra | YuriiH | L        | T1, T3, T4, T5 | done   |
| T7  | Move the 22-file administration slice into `modules/workspace`, content-free               | ui    | YuriiH | L        | T6             | todo   |
| T8  | Repoint the boundary machinery's stale paths and qualify its predecessor identifiers       | tests | YuriiH | S        | T7             | todo   |
| T9  | Split `WarehouseList.tsx` into five flat siblings                                          | ui    | YuriiH | M        | T7             | todo   |
| T10 | Split `WarehousePeopleList.tsx` into `WarehousePersonRow`                                  | ui    | YuriiH | S        | T7             | todo   |
| T11 | Carve `WarehouseList.spec.tsx` and `WarehouseRow.spec.tsx` out of `WarehousesTab.spec.tsx` | tests | YuriiH | L        | T9             | todo   |
| T12 | Carve `WarehousePeopleList.spec.tsx` out of `WarehousesTab.spec.tsx`                       | tests | YuriiH | M        | T10, T11       | todo   |
| T13 | Assert case-count identity — 39 cases, distributed 25/7/4/3                                | tests | YuriiH | S        | T11, T12       | todo   |
| T14 | Rename `authSlice.spec.ts` and guard the absence of `store/` scaffolding                   | tests | YuriiH | S        | T7             | todo   |
| T15 | Re-run and record the CR-AC-06 `useState` audit at `HEAD`                                  | docs  | YuriiH | S        | T9, T10, T14   | todo   |
| T16 | Guard the CR-RG-07 neighbour trees against `baseline_revision`                             | tests | YuriiH | M        | T7, T14        | todo   |
| T17 | Produce and compare the CR-RG-05 normalized chunk manifest                                 | tests | YuriiH | M        | T13, T15, T16  | todo   |
| T18 | Record CR-RG-06's known-red server case as identically failing at `HEAD`                   | tests | YuriiH | S        | T7             | todo   |

**Total:** 18 tasks, ~9.0 person-days. Reviewer for every task: Tech Lead.

## Criterion coverage

| Criterion | Tasks                 |
| --------- | --------------------- |
| CR-AC-01  | T7                    |
| CR-AC-02  | T7, T8                |
| CR-AC-03  | T2, T3, T4, T5        |
| CR-AC-04  | T9, T10               |
| CR-AC-05  | T6                    |
| CR-AC-06  | T14, T15              |
| CR-RG-01  | T1, T7, T11, T12, T13 |
| CR-RG-02  | T9, T11               |
| CR-RG-03  | T10, T12              |
| CR-RG-04  | T11, T13              |
| CR-RG-05  | T1, T17               |
| CR-RG-06  | T18                   |
| CR-RG-07  | T1, T6, T8, T16       |

## Review gates

[`test-plan.md` §Review gates](../test-plan.md#review-gates) lists nine clauses no static check can
decide. Each is recorded in the pull request beside the task that owns it; a gate left unrecorded is
an uncovered criterion, not a formality.

| Gate                                                                  | Owning task                      |
| --------------------------------------------------------------------- | -------------------------------- |
| New-ADR content (CR-AC-03)                                            | T2                               |
| Guide reconciliation at four locations (CR-AC-03, O1)                 | T5                               |
| Shared-api equivalence — every hunk an import specifier (CR-AC-05)    | T6                               |
| Surface-declaration diff — no entry added to accommodate a bad import | T7                               |
| Hop budgets counted from the two split roots (CR-AC-04)               | T9, T10                          |
| One reason to change — the design-time judgement (CR-AC-04)           | T9, T10                          |
| Per-expectation diff review (CR-RG-01)                                | T11, T12                         |
| The `useState` audit (CR-AC-06)                                       | T15                              |
| Focus order in the running application (CR-RG-02)                     | T9 + manual verification at ship |
| Placement judgement — the tiebreak is not over-applied (risk R6)      | T2                               |
