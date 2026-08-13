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

| #   | Task                                             | Layer  | Blocked by    | Status      |
| --- | ------------------------------------------------ | ------ | ------------- | ----------- |
| T16 | Entry write once per entered Warehouse + fixture | app    | —             | done        |
| T17 | Archived label on the entered Warehouse          | ui     | —             | done        |
| T18 | Suppress the empty Warehouses group              | ui     | —             | done        |
| T19 | Retained messages to a shell main-region block   | ui     | —             | done        |
| T20 | Undim the inert-row explanation                  | ui     | —             | done        |
| T21 | Route error retry re-runs the read               | app    | —             | done        |
| T22 | Landing pending state                            | ui     | —             | done        |
| T23 | Fail closed on an absent entry verdict           | app    | —             | done        |
| T24 | Computed-access hole in the architecture check   | wiring | —             | done        |
| T25 | Enter actions named per Warehouse                | ui     | —             | done        |
| T26 | Drop the orphaned locale keys                    | ui     | —             | done        |
| T27 | CR-AC-10 landing tests assert the destination    | tests  | —             | done        |
| T28 | CR-AC-14 through the production router           | tests  | T16           | done        |
| T29 | Error-path case, tautologies, shell composition  | tests  | T19, T21, T23 | in_progress |
| T30 | No-context copy direction and action             | ui     | —             | done        |

Two of T29's three parts are committed (the failed-context-read case at a Warehouse address, and
the replacement of the tautological current-marker assertion). The third — the CR-AC-18 shell
composition case of [`test-plan.md`](../test-plan.md) — was held until T19 changed the layout it
asserts, and is being written against the shipped composition now.

### What T19 changed, and what it deliberately did not

The three CR-RG-03 messages now live in `shared/components/RetainedContextMessage.tsx`, mounted by
`RootLayout` in the main content region above the routed outlet. That placement is load-bearing, not
cosmetic: the `selectionEnded` variant's memory has to observe `effectiveWarehouseId` going
non-null → null, which only a component mounted on every page can see. An earlier attempt to put the
block on the `/` page was reverted for exactly that reason — at `/`, CR-AC-08 rule (3) guarantees the
value is already null, so that message would never have rendered in the running app.

The `effectiveWarehouseId` read moved with the message, so the spec §6 allowlist still names exactly
three call sites — `landing.guard.ts`, `RetainedContextMessage.tsx`, `useRecordWarehouseEntry.ts` —
and §6's wording was updated to match. `WarehouseSwitcher.tsx` no longer references the identifier at
all.

**Known, not fixed:** `/` still renders `HomePage`'s `h1` above the retained message's `h2`. The
defect finding 5 named is fixed — the block is out of the fixed-height header, no longer overflows
it, and renders once rather than twice — but collapsing the two headings into one would change
`HomePage`'s own block, which overlaps the deferred design deviation about that block's missing
icon. Both belong to the same follow-up.

**Total:** 15 original tasks + 15 review-fix tasks. T15 is partially complete: the ten entry-latency
figures are recorded and pass, the four 390px responsive checks still need a person at a real narrow
viewport — see [the task record](./responsive-and-entry-latency-verification.md). Per the review
resolution those checks run **after** the fix batch, because T19's relocation and the recorded design
deviations all live in the surfaces they exercise.

Not tracked here: **CR-AC-15** (canonical reconciliation of the seven `change.md` §8 rows) is a
post-PASS `ship` action, not a task — see [`_epic.md`](./_epic.md) § Scope.
