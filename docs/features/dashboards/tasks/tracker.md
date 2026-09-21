# Tracker — dashboards

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                                                                                            | Layer       | Owner         | Estimate | Blocked by         | Status |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------- | ------------- | -------- | ------------------ | ------ |
| T1  | [Promote the Reason Concentration index migration](./reason-concentration-index-migration.md)                   | `migration` | Backend Lead  | S        | —                  | done   |
| T2  | [Promote the Permission grant migration + catalogue enum](./dashboard-permission-catalogue-migration.md)        | `migration` | Backend Lead  | M        | T1                 | done   |
| T3  | [Add the contracts/dashboards subpath and both Vite aliases](./dashboards-contracts-subpath.md)                 | `ports`     | Tech Lead     | M        | —                  | done   |
| T4  | [Introduce APP_TIMEZONE as one bound parameter](./app-timezone-configuration.md)                                | `wiring`    | Backend Lead  | S        | —                  | todo   |
| T5  | [Coverage Gap statement — four CTEs joined on item_id](./coverage-gap-repository.md)                            | `infra`     | Backend Lead  | L        | T4                 | todo   |
| T6  | [Arrival Timing statement — two series, four exclusions](./arrival-timing-repository.md)                        | `infra`     | Backend Lead  | L        | T4, T5             | todo   |
| T7  | [Purchasing Pipeline + Reason Concentration repositories](./warehouse-purchasing-and-rejection-repositories.md) | `infra`     | Backend Lead  | M        | T1, T4             | todo   |
| T8  | [Workspace scope + Demand Pressure + Purchasing Spread](./workspace-performance-repository-foundation.md)       | `infra`     | Backend Lead  | M        | T4                 | todo   |
| T9  | [Order Flow read — twelve weeks on the recording week](./order-flow-repository-read.md)                         | `infra`     | Backend Lead  | M        | T8                 | todo   |
| T10 | [Receipt Reliability read — two rates, five exclusions](./receipt-reliability-repository-read.md)               | `infra`     | Backend Lead  | L        | T8                 | todo   |
| T11 | [Panel-access predicates + four Warehouse queries](./warehouse-panel-queries.md)                                | `app`       | Backend Lead  | L        | T3, T5, T6, T7     | todo   |
| T12 | [Warehouse Dashboard REST surface](./warehouse-dashboard-rest-surface.md)                                       | `ports`     | Backend Lead  | M        | T11                | todo   |
| T13 | [Four Workspace Panel queries](./workspace-panel-queries.md)                                                    | `app`       | Backend Lead  | M        | T3, T8, T9, T10    | todo   |
| T14 | [Workspace Dashboard REST surface](./workspace-dashboard-rest-surface.md)                                       | `ports`     | Backend Lead  | S        | T2, T13            | todo   |
| T15 | [Chart primitives, tokens, scales and locales](./chart-primitives-and-tokens.md)                                | `ui`        | Frontend Lead | L        | —                  | done   |
| T16 | [Warehouse Dashboard shell — loader, grid, reflow, denial](./warehouse-dashboard-shell-ui.md)                   | `ui`        | Frontend Lead | L        | T3, T12, T15       | todo   |
| T17 | [Coverage Gap + Reason Concentration Panels](./coverage-gap-and-reason-concentration-panels-ui.md)              | `ui`        | Frontend Lead | M        | T16                | todo   |
| T18 | [Arrival Timing + Purchasing Pipeline Panels](./arrival-timing-and-purchasing-pipeline-panels-ui.md)            | `ui`        | Frontend Lead | M        | T16                | todo   |
| T19 | [workspace-dashboard module, route and gated rail entry](./workspace-dashboard-module-ui.md)                    | `ui`        | Frontend Lead | M        | T3, T14, T15       | todo   |
| T20 | [Demand Pressure + Purchasing Spread Panels](./demand-pressure-and-purchasing-spread-panels-ui.md)              | `ui`        | Frontend Lead | M        | T19                | todo   |
| T21 | [Order Flow + Receipt Reliability Panels](./order-flow-and-receipt-reliability-panels-ui.md)                    | `ui`        | Frontend Lead | L        | T19                | todo   |
| T22 | [Extend the four hand-enumerated structural gates](./hand-enumerated-gate-extensions.md)                        | `tests`     | Tech Lead     | M        | T12, T14, T16, T19 | todo   |
| T23 | [Amend the four upstream rules this feature rests on](./cross-feature-invariant-amendments.md)                  | `docs`      | Tech Lead     | M        | —                  | done   |

**Total:** 23 tasks, ~21.5 person-days.

Estimates are S ≈ half a day, M ≈ one day, L ≈ one full day at the upper bound of the ≤1-day rule.
Three owners carry the set: **Backend Lead** (T1, T2, T4–T14 — 13 tasks), **Frontend Lead** (T15–T21 — 7),
**Tech Lead** (T3, T22, T23 — 3).
