# Tracker — change-request: workspace-warehouse

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                             | Layer  | Owner         | Estimate | Blocked by      | Status |
| --- | ------------------------------------------------ | ------ | ------------- | -------- | --------------- | ------ |
| T1  | Locale keys and the two new icons                | ui     | Frontend Lead | S        | —               | done   |
| T2  | `WarehouseEntryRefusal` component                | ui     | Frontend Lead | S        | T1              | done   |
| T3  | `resolveWarehouseEntry` entry guard              | app    | Frontend Lead | M        | —               | done   |
| T4  | Warehouse layout route and `useEnteredWarehouse` | wiring | Frontend Lead | M        | T2, T3          | done   |
| T5  | `RouteErrorState` component                      | ui     | Frontend Lead | S        | T1              | done   |
| T6  | Access relocation and addressed permissions      | app    | Frontend Lead | M        | T4              | done   |
| T7  | Landing resolver and root not-found              | app    | Frontend Lead | M        | T4, T5          | done   |
| T8  | Entry record and silent-failure allowlist        | app    | Frontend Lead | S        | T4              | done   |
| T9  | Grouped context switcher                         | ui     | Frontend Lead | L        | T1, T4          | done   |
| T10 | Context-selected sidebar                         | ui     | Frontend Lead | M        | T4, T6          | done   |
| T11 | Shell chrome wiring                              | ui     | Frontend Lead | S        | T9, T10         | done   |
| T12 | Warehouses-tab Enter action                      | ui     | Frontend Lead | M        | T1, T4          | done   |
| T13 | `effectiveWarehouseId` architecture check        | wiring | Frontend Lead | S        | T6, T8, T9      | done   |
| T14 | Route-integration coverage                       | tests  | Frontend Lead | M        | T6, T7, T8, T10 | done   |
| T15 | Responsive and entry-latency verification        | tests  | Frontend Lead | S        | T11, T12        | todo   |

**Total:** 15 tasks, ~10 person-days.

Not tracked here: **CR-AC-15** (canonical reconciliation of the seven `change.md` §8 rows) is a
post-PASS `ship` action, not a task — see [`_epic.md`](./_epic.md) § Scope.
