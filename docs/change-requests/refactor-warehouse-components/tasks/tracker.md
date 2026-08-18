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
| T7  | Move the 22-file administration slice into `modules/workspace`, content-free               | ui    | YuriiH | L        | T6             | done   |
| T8  | Repoint the boundary machinery's stale paths and qualify its predecessor identifiers       | tests | YuriiH | S        | T7             | done   |
| T9  | Split `WarehouseList.tsx` into five flat siblings                                          | ui    | YuriiH | M        | T7             | done   |
| T10 | Split `WarehousePeopleList.tsx` into `WarehousePersonRow`                                  | ui    | YuriiH | S        | T7             | done   |
| T11 | Carve `WarehouseList.spec.tsx` and `WarehouseRow.spec.tsx` out of `WarehousesTab.spec.tsx` | tests | YuriiH | L        | T9             | done   |
| T12 | Carve `WarehousePeopleList.spec.tsx` out of `WarehousesTab.spec.tsx`                       | tests | YuriiH | M        | T10, T11       | done   |
| T13 | Assert case-count identity — the 39 baseline cases, none lost, plus enumerated additions   | tests | YuriiH | S        | T11, T12       | done   |
| T14 | Rename `authSlice.spec.ts` and guard the absence of `store/` scaffolding                   | tests | YuriiH | S        | T7             | done   |
| T15 | Re-run and record the CR-AC-06 `useState` audit at `HEAD`                                  | docs  | YuriiH | S        | T9, T10, T14   | done   |
| T16 | Guard the CR-RG-07 neighbour trees against `baseline_revision`                             | tests | YuriiH | M        | T7, T14        | done   |
| T17 | Produce and compare the CR-RG-05 normalized chunk manifest                                 | tests | YuriiH | M        | T13, T15, T16  | done   |
| T18 | Record the CR-RG-06 attempt and its outcome                                                | tests | YuriiH | S        | T7             | done   |

**Total:** 18 tasks, ~9.0 person-days. Reviewer for every task: Tech Lead.

## Review follow-ups (`_review/review-2026-08-18.md`)

Every finding of the independent review was resolved **Fix now**. `R*` ids are review follow-ups,
not `tasks.json` tasks.

| #   | Follow-up                                                                                                                          | Findings       | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ |
| R1  | Rest the ADR's access-tab exemption on the condition that actually fails; delimit a slice; mirror into `placing-web-components.md` | S1, S2, Q2     | done   |
| R2  | Correct `useRecordWarehouseEntry`'s consumer count everywhere it is stated — six places, not four                                  | Q1, round2-R4  | done   |
| R3  | Name the successor ADR beside the Superseded one in the boundary machinery                                                         | Q3             | done   |
| R4  | Re-pin the people-count derivation and the anti-flash loading composition                                                          | S3, S4         | done   |
| R5  | Assert the revoke gate's absent branch                                                                                             | S5             | done   |
| R6  | Fix the gate identifiers; harden the baseline digest against regeneration                                                          | Q4, Q7         | done   |
| R7  | Reconcile the artifacts of record with the evidence produced                                                                       | S6–S10, Q5, Q6 | done   |

## Round-2 review follow-ups (`_review/review-2026-08-18-round-2.md`)

Round 2 re-verified round 1's fixes and re-checked the change with fresh eyes. Eleven of the
seventeen round-1 findings were fully discharged; S1, S2, S8 and Q1 were only partially fixed and
became R1–R4 below. Every round-2 finding was resolved **Fix now**. Ids are prefixed `round2-` to
keep them distinct from the round-1 `R*` ids above.

| #          | Follow-up                                                                                             | Findings | Status |
| ---------- | ----------------------------------------------------------------------------------------------------- | -------- | ------ |
| round2-R1  | Read the tiebreak's second condition on entity scope, not the glossary's "subject of the operation"   | S1       | done   |
| round2-R2  | Mirror that wording into `adding-a-web-module.md`, which round 1 left on the module-location phrasing | S2       | done   |
| round2-R3  | Carry the CR-RG-05 Method to `spec.md` §6, `test-plan.md` §6 and `sad.md`'s verification table        | S8       | done   |
| round2-R4  | Correct the two surviving `useRecordWarehouseEntry` two-consumer claims in `sad.md`                   | Q1       | done   |
| round2-R5  | Restate the CR-AC-05 record's importer count as 68, naming the two non-importers excluded             | —        | done   |
| round2-R6  | Say when the container runtime arrived; add a superseding note to the round-1 gate result             | S7       | done   |
| round2-R7  | State the case count the gate asserts — 39 baseline names all present, 42 total at `HEAD`             | S3–S5    | done   |
| round2-R8  | Qualify the predecessor identifier the split renumbered in `WarehouseRow.tsx`                         | —        | done   |
| round2-R9  | Propagate S7's T18 retitle into `tasks.json` and the task file                                        | S7       | done   |
| round2-R10 | Point CH-D2's two `change.md` cells at the ADR filename that exists                                   | —        | done   |
| round2-R11 | Rewrite `sad.md` §5.2/§5.5's two pre-CH-W6 root paths                                                 | —        | done   |
| round2-R12 | Record the people-list chain's fourth prop hop as out-of-scope, not as a satisfied budget             | —        | done   |

## Criterion coverage

> **Task status is not criterion status.** A `done` task means its work was committed; a criterion
> is discharged only by the evidence its row names. The two were conflated in an earlier revision of
> this file (`_review/review-2026-08-18.md` S7) — CR-RG-06 read as closed while it was in fact
> unverified. The `Status` column below is the criterion's, not the task's.

| Criterion | Tasks                                    | Status    | Evidence                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ---------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CR-AC-01  | T7                                       | satisfied | `WORKSPACE_MODULE_MANIFEST` vs. `git ls-tree HEAD`                                                                                                                                                                                                                                                                                                                                           |
| CR-AC-02  | T7, T8                                   | satisfied | `module-boundaries.spec.ts` green, zero exceptions                                                                                                                                                                                                                                                                                                                                           |
| CR-AC-03  | T2, T3, T4, T5, R1, round2-R1, round2-R2 | satisfied | ADR + three guides; decision procedure corrected twice and **re-derived** at round 2 — condition 1 fires for both slices (one production importer each), condition 2 separates them: the warehouses slice enforces Warehouse invariants (Warehouse-scoped) exercised at Workspace → move; the access tabs enforce Workspace Role invariants (Workspace-scoped) exercised at Workspace → stay |
| CR-AC-04  | T9, T10                                  | satisfied | file set vs. `sad.md` §5.3; hop budgets                                                                                                                                                                                                                                                                                                                                                      |
| CR-AC-05  | T6                                       | satisfied | [`_review/cr-ac-05-shared-api-equivalence.md`](../_review/cr-ac-05-shared-api-equivalence.md)                                                                                                                                                                                                                                                                                                |
| CR-AC-06  | T14, T15                                 | satisfied | `useState` audit re-run at `HEAD`                                                                                                                                                                                                                                                                                                                                                            |
| CR-RG-01  | T1, T7, T11, T12, T13, R4                | satisfied | zero assertion drift over the 39 baseline cases and their 96 expectations; derivations re-pinned at review                                                                                                                                                                                                                                                                                   |
| CR-RG-02  | T9, T11                                  | satisfied | four clauses asserted in `WarehouseRow.spec.tsx`                                                                                                                                                                                                                                                                                                                                             |
| CR-RG-03  | T10, T12, R5                             | satisfied | own-row disabled + revoke gate's absent branch asserted                                                                                                                                                                                                                                                                                                                                      |
| CR-RG-04  | T11, T13                                 | satisfied | conditional fetch preserved; four permission cases in the tab                                                                                                                                                                                                                                                                                                                                |
| CR-RG-05  | T1, T17                                  | satisfied | normalized chunk manifest; Method amended for the CH-W5 leaves                                                                                                                                                                                                                                                                                                                               |
| CR-RG-06  | T18                                      | satisfied | [`_review/cr-rg-06-known-red-server-case.md`](../_review/cr-rg-06-known-red-server-case.md) §"The resolving run" — 1 failed / 31 passed against a clean database, identical assertion and received value                                                                                                                                                                                     |
| CR-RG-07  | T1, T6, T8, T16                          | satisfied | 471/471 baseline blobs; now gate-enforced (`baseline-artifacts.spec.mjs`)                                                                                                                                                                                                                                                                                                                    |

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
