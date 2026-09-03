# Tracker — delivery-addresses

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                                                                                                                                                                       | Layer       | Owner         | Estimate | Blocked by    | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------- | -------- | ------------- | ------ |
| T1  | [Promote the customer-schema migration: two relations, their checks, keys and the partial unique Main-address index](./create-customer-schema-migration.md)                                | `migration` | Backend Lead  | S        | —             | done   |
| T2  | [Promote the delivery-destinations migration: 14 columns across five shipped relations, with the Via Warehouse and ending-attribution backfills](./add-delivery-destinations-migration.md) | `migration` | Backend Lead  | L        | T1            | done   |
| T3  | [Promote the Permission grant migration and add the feature's PermissionId, WorkspacePermissionId and ErrorCode members](./grant-delivery-address-permissions-migration.md)                | `migration` | Backend Lead  | S        | T2            | done   |
| T4  | [Add the two new shared persistence entities and extend the four shipped ones, registered on DomainModule](./delivery-persistence-entities.md)                                             | `infra`     | Backend Lead  | M        | T1, T2        | todo   |
| T5  | [Add @ObservedPermission, resolve it in WarehouseAccessGuard, and carry observedPermissionIds on AccessCurrentUser](./observed-permission-stage.md)                                        | `infra`     | Tech Lead     | M        | T3            | todo   |
| T6  | [Build the customers domain: value objects, predicates, error factories, mappers and CustomerAddressBookService](./customers-domain.md)                                                    | `domain`    | Backend Lead  | M        | T4            | todo   |
| T7  | [Add the three customers specialized repositories: directory, address book and awaiting demand](./customers-repositories.md)                                                               | `infra`     | Backend Lead  | M        | T4            | todo   |
| T8  | [Add the Customer lifecycle commands: record, correct the name, deactivate and reactivate](./customer-lifecycle-commands.md)                                                               | `app`       | Backend Lead  | M        | T6, T7        | todo   |
| T9  | [Add the Delivery Address book commands: add, revise, mark Main, deactivate and reactivate](./delivery-address-book-commands.md)                                                           | `app`       | Backend Lead  | M        | T6, T7        | todo   |
| T10 | [Serve the customers REST surface with its queries and the new @warehouser/contracts/customers subpath](./customers-rest-surface.md)                                                       | `ports`     | Backend Lead  | L        | T5, T8, T9    | todo   |
| T11 | [Record the Warehouse's own Delivery Address end to end: Workspace-guarded command, route, contract and detail-pane section](./warehouse-delivery-address.md)                              | `ports`     | Tech Lead     | M        | T3, T4        | todo   |
| T12 | [Give a Customer Order its destination and add the redirection command](./customer-order-destination.md)                                                                                   | `app`       | Backend Lead  | M        | T4, T7        | todo   |
| T13 | [Redact customer identity in the demand and Customer Order projections and serve their REST surface](./demand-identity-redaction.md)                                                       | `ports`     | Security Lead | L        | T5, T12       | todo   |
| T14 | [Extend the purchase-drafts domain with Delivery Mode, the ending rules and the closure predicate](./purchase-draft-delivery-domain.md)                                                    | `domain`    | Backend Lead  | M        | T4            | todo   |
| T15 | [Set a line's Delivery Mode and Delivery Address, and enforce the direct-line agreement at the link and the revision](./line-delivery-and-agreement.md)                                    | `app`       | Backend Lead  | L        | T12, T14      | todo   |
| T16 | [Freeze the delivery statement by value and refuse the two conditions that make a freeze unsound](./purchase-draft-freeze-capture.md)                                                      | `app`       | Backend Lead  | L        | T11, T15      | todo   |
| T17 | [Replace the whole-draft arrival with per-line endings and withdraw POST /purchase-drafts/{id}/arrival](./per-line-endings.md)                                                             | `app`       | Backend Lead  | L        | T14, T16      | todo   |
| T18 | [Report Address Drift and serve the by-line split from the read repository](./address-drift-and-by-line-read.md)                                                                           | `app`       | Backend Lead  | M        | T13, T16      | todo   |
| T19 | [Serve the purchase-drafts REST surface: line delivery, readiness, the by-line read and the redacted draft reads](./purchase-drafts-rest-surface.md)                                       | `ports`     | Backend Lead  | L        | T15, T16, T18 | todo   |
| T20 | [Add the architecture check that ties an identity-bearing response schema to its observed-Permission declaration](./authorization-coverage-checks.md)                                      | `tests`     | Security Lead | M        | T10, T13, T19 | todo   |
| T21 | [Build the Customers web destination with its address book, awaiting list, dialogs and the shared customer picker](./customers-destination-ui.md)                                          | `ui`        | Frontend Lead | L        | T10           | todo   |
| T22 | [Carry the destination onto the Demand surface and add the redirect dialog](./demand-destination-ui.md)                                                                                    | `ui`        | Frontend Lead | M        | T13, T21      | todo   |
| T23 | [Add the per-line DELIVERY block, the drift presentation split by mode, and the By-line view](./purchase-draft-delivery-ui.md)                                                             | `ui`        | Frontend Lead | L        | T19, T21      | todo   |
| T24 | [Replace the whole-draft arrival modal with the two 720px per-line ending dialogs](./line-ending-dialogs-ui.md)                                                                            | `ui`        | Frontend Lead | M        | T17, T23      | todo   |
| T25 | [Raise the ordering change request and promote @ObservedPermission into docs/system](./ordering-change-request-and-system-docs.md)                                                         | `docs`      | Tech Lead     | M        | T5            | todo   |

**Total:** 25 tasks, ~24 person-days (S = ½ day, M/L = 1 day; every task is capped at one working day by design).

**By owner:** Backend Lead 16 · Frontend Lead 4 · Tech Lead 3 · Security Lead 2. T11 spans server
and web as one AC-10 slice; T13 and T20 sit with the Security Lead because they are the two
mechanical defences [sad.md §11](../sad.md) puts in place of a review pass.

**Critical path:** 11 tasks, ~10.5 person-days —
T1 → T2 → T4 → T7 → T12 → T15 → T16 → T18 → T19 → T23 → T24.
Running alongside it: the redaction chain T3 → T5 → T13 → T20, the customers chain
T6/T8/T9 → T10 → T21/T22, and T25, which blocks nothing.
