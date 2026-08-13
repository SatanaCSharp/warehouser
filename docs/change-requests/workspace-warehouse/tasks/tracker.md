# Tracker — change-request: workspace-warehouse

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                             | Layer  | Owner         | Estimate | Blocked by      | Status  |
| --- | ------------------------------------------------ | ------ | ------------- | -------- | --------------- | ------- |
| T1  | Locale keys and the two new icons                | ui     | Frontend Lead | S        | —               | done    |
| T2  | `WarehouseEntryRefusal` component                | ui     | Frontend Lead | S        | T1              | done    |
| T3  | `resolveWarehouseEntry` entry guard              | app    | Frontend Lead | M        | —               | done    |
| T4  | Warehouse layout route and `useEnteredWarehouse` | wiring | Frontend Lead | M        | T2, T3          | done    |
| T5  | `RouteErrorState` component                      | ui     | Frontend Lead | S        | T1              | done    |
| T6  | Access relocation and addressed permissions      | app    | Frontend Lead | M        | T4              | done    |
| T7  | Landing resolver and root not-found              | app    | Frontend Lead | M        | T4, T5          | done    |
| T8  | Entry record and silent-failure allowlist        | app    | Frontend Lead | S        | T4              | done    |
| T9  | Grouped context switcher                         | ui     | Frontend Lead | L        | T1, T4          | done    |
| T10 | Context-selected sidebar                         | ui     | Frontend Lead | M        | T4, T6          | done    |
| T11 | Shell chrome wiring                              | ui     | Frontend Lead | S        | T9, T10         | done    |
| T12 | Warehouses-tab Enter action                      | ui     | Frontend Lead | M        | T1, T4          | done    |
| T13 | `effectiveWarehouseId` architecture check        | wiring | Frontend Lead | S        | T6, T8, T9      | done    |
| T14 | Route-integration coverage                       | tests  | Frontend Lead | M        | T6, T7, T8, T10 | done    |
| T15 | Responsive and entry-latency verification        | tests  | Frontend Lead | S        | T11, T12        | blocked |

## Review fix batch (from [`_review/review-2026-08-13.md`](../_review/review-2026-08-13.md))

| #   | Task                                             | Layer  | Blocked by    | Status  |
| --- | ------------------------------------------------ | ------ | ------------- | ------- |
| T16 | Entry write once per entered Warehouse + fixture | app    | —             | done    |
| T17 | Archived label on the entered Warehouse          | ui     | —             | done    |
| T18 | Suppress the empty Warehouses group              | ui     | —             | done    |
| T19 | Retained message out of the header + copy        | ui     | T18           | blocked |
| T20 | Undim the inert-row explanation                  | ui     | —             | done    |
| T21 | Route error retry re-runs the read               | app    | —             | done    |
| T22 | Landing pending state                            | ui     | —             | done    |
| T23 | Fail closed on an absent entry verdict           | app    | —             | done    |
| T24 | Computed-access hole in the architecture check   | wiring | —             | done    |
| T25 | Enter actions named per Warehouse                | ui     | —             | done    |
| T26 | Drop the orphaned locale keys                    | ui     | T19, T22, T25 | todo    |
| T27 | CR-AC-10 landing tests assert the destination    | tests  | —             | todo    |
| T28 | CR-AC-14 through the production router           | tests  | T16           | todo    |
| T29 | Planned shell/error cases + drop tautologies     | tests  | T19, T21, T23 | todo    |

**T19 is blocked on a design decision, not on effort.** Moving the three CR-RG-03 messages out of
the fixed-height shell header into the page-level state block makes the `selectionEnded` variant
unreachable: its `lastSelected` memory has to observe `effectiveWarehouseId` going non-null → null,
which only a component mounted on every page can see. The page block mounts only at `/`, where
CR-AC-08 rule (3) guarantees the value is already null. Moving the read also makes the block a
**fourth** reader of `effectiveWarehouseId`, which the spec §6 allowlist of exactly three named call
sites forbids — the automated check rejected it. Resolving this needs a decision on where that
memory lives and whether the allowlist's named sites change. See the review record.

**Total:** 15 original tasks + 14 review-fix tasks. T15 is partially complete: the ten entry-latency
figures are recorded and pass, the four 390px responsive checks still need a person at a real
narrow viewport — see [the task record](./responsive-and-entry-latency-verification.md). Per the
review resolution those checks run **after** the fix batch, because T19 and the recorded design
deviations all live in the surfaces they exercise.

Not tracked here: **CR-AC-15** (canonical reconciliation of the seven `change.md` §8 rows) is a
post-PASS `ship` action, not a task — see [`_epic.md`](./_epic.md) § Scope.
