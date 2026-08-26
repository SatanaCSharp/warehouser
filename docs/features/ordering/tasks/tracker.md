# Tracker — ordering

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.
>
> Estimates: **S** ≈ half a day · **M** ≈ three-quarters of a day · **L** ≈ one day. No task exceeds one day.

| #   | Task                                                                                                                                                                            | Layer       | Owner         | Estimate | Blocked by     | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------- | -------- | -------------- | ------ |
| T1  | [Stage the ordering schema migration: nine relations, their constraints and indexes, and the Packaging Type seed](./create-ordering-schema-migration.md)                        | `migration` | Backend Lead  | M        | —              | done   |
| T2  | [Stage the Permission catalogue migration and add the feature's PermissionId and ErrorCode members](./grant-ordering-permissions-migration.md)                                  | `migration` | Backend Lead  | S        | T1             | done   |
| T3  | [Add the nine shared persistence entities and register them on DomainModule](./ordering-persistence-entities.md)                                                                | `infra`     | Backend Lead  | M        | T1             | done   |
| T4  | [Add WriteRateLimitGuard and the @WriteRateLimited() decorator to shared/guards](./write-rate-limit-guard.md)                                                                   | `infra`     | Security Lead | S        | —              | done   |
| T5  | [Build the items domain and the Item catalogue: value objects, SKU rules, activation, repository and use cases](./item-catalogue-domain.md)                                     | `app`       | Backend Lead  | M        | T2, T3         | done   |
| T6  | [Build the On-hand Quantity adjustment: mandatory reason, current figure and append-only history in one transaction](./on-hand-adjustment.md)                                   | `app`       | Backend Lead  | S        | T5             | done   |
| T7  | [Expose the items REST surface: contracts subpath, controllers, DTOs and module wiring](./items-rest-surface.md)                                                                | `ports`     | Backend Lead  | M        | T5, T6, T4     | done   |
| T8  | [Build the customer-orders domain and lifecycle: record, amend and cancel under the locked allocated-total read](./customer-order-lifecycle.md)                                 | `app`       | Backend Lead  | M        | T2, T3, T5     | done   |
| T9  | [Build DemandAllocationService and its repository, exported for Arrival Confirmation](./demand-allocation-service.md)                                                           | `app`       | Backend Lead  | M        | T8             | done   |
| T10 | [Build ConsolidatedDemandRepository as one non-fan-out query and the demand queries over it](./consolidated-demand-read.md)                                                     | `app`       | Backend Lead  | M        | T3, T8         | done   |
| T11 | [Expose the customer-orders and demand REST surface: contracts subpath, controllers, DTOs and module wiring](./customer-orders-rest-surface.md)                                 | `ports`     | Backend Lead  | M        | T10, T9, T4    | done   |
| T12 | [Build the purchase-drafts domain and draft assembly: lines, links, Pre-receipt Requirements and the state-guarded write path](./purchase-draft-assembly.md)                    | `app`       | Backend Lead  | L        | T2, T3, T5, T8 | done   |
| T13 | [Build the freeze with its Demand Snapshot capture, and closure and discard as guarded transitions](./purchase-draft-freeze-and-closure.md)                                     | `app`       | Backend Lead  | L        | T12            | done   |
| T14 | [Build PurchaseDraftReadRepository and the drift queries comparing the snapshot against current demand](./purchase-draft-drift-read.md)                                         | `app`       | Backend Lead  | M        | T13, T10       | done   |
| T15 | [Build Arrival Confirmation: received quantities, delegated Allocations and the move to Closed in one transaction](./arrival-confirmation.md)                                   | `app`       | Backend Lead  | L        | T13, T9        | done   |
| T16 | [Expose the purchase-drafts REST surface: contracts subpath, transition sub-resources, controllers and module wiring](./purchase-drafts-rest-surface.md)                        | `ports`     | Backend Lead  | L        | T14, T15, T4   | todo   |
| T17 | [Add the ordering web shell: three routes, router children, permission-gated sidebar entries, eight icons and three i18n namespaces](./ordering-web-shell.md)                   | `ui`        | Frontend Lead | M        | T2             | done   |
| T18 | [Build the Items destination: table with on-hand and its reason, the create/correct/deactivate dialogs and the Item picker](./item-destination-ui.md)                           | `ui`        | Frontend Lead | M        | T17, T7        | done   |
| T19 | [Build the Demand destination: consolidated table, expandable Customer Order sub-rows, record/amend/cancel and the Customer Order picker](./demand-destination-ui.md)           | `ui`        | Frontend Lead | L        | T17, T11       | todo   |
| T20 | [Build the Purchase drafts destination: list and detail, the three tabs, line and link editing, the frozen treatment and the Drift Signal](./purchase-drafts-destination-ui.md) | `ui`        | Frontend Lead | L        | T17, T16       | todo   |
| T21 | [Build the Purchase draft transition dialogs: ready, close, discard and the 720px arrival modal](./purchase-draft-transitions-ui.md)                                            | `ui`        | Frontend Lead | M        | T20            | todo   |
| T22 | [Add the ordering load smoke and the structured timing assertions for the section 6 latency targets](./ordering-performance-gate.md)                                            | `tests`     | Tech Lead     | S        | T7, T11, T16   | todo   |

**Total:** 22 tasks, ~17 person-days.

## Dependency phases

The topological levels `implement` will sort the DAG into. Tasks in one phase may run in parallel
unless a shared `files_hint` puts them in the same lane (see [_epic.md](./_epic.md) § Task map).

| Phase | Tasks            | Count |
| ----- | ---------------- | ----- |
| 1     | T1, T4           | 2     |
| 2     | T2, T3           | 2     |
| 3     | T5, T17          | 2     |
| 4     | T6, T8           | 2     |
| 5     | T7, T9, T10, T12 | 4     |
| 6     | T11, T13, T18    | 3     |
| 7     | T14, T15, T19    | 3     |
| 8     | T16              | 1     |
| 9     | T20, T22         | 2     |
| 10    | T21              | 1     |
