# Tracker — delivery-addresses

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| #   | Task                                                                                                                                                                                       | Layer       | Owner         | Estimate | Blocked by    | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------- | -------- | ------------- | ------ |
| T1  | [Promote the customer-schema migration: two relations, their checks, keys and the partial unique Main-address index](./create-customer-schema-migration.md)                                | `migration` | Backend Lead  | S        | —             | done   |
| T2  | [Promote the delivery-destinations migration: 14 columns across five shipped relations, with the Via Warehouse and ending-attribution backfills](./add-delivery-destinations-migration.md) | `migration` | Backend Lead  | L        | T1            | done   |
| T3  | [Promote the Permission grant migration and add the feature's PermissionId, WorkspacePermissionId and ErrorCode members](./grant-delivery-address-permissions-migration.md)                | `migration` | Backend Lead  | S        | T2            | done   |
| T4  | [Add the two new shared persistence entities and extend the four shipped ones, registered on DomainModule](./delivery-persistence-entities.md)                                             | `infra`     | Backend Lead  | M        | T1, T2        | done   |
| T5  | [Add @ObservedPermission, resolve it in WarehouseAccessGuard, and carry observedPermissionIds on AccessCurrentUser](./observed-permission-stage.md)                                        | `infra`     | Tech Lead     | M        | T3            | done   |
| T6  | [Build the customers domain: value objects, predicates, error factories, mappers and CustomerAddressBookService](./customers-domain.md)                                                    | `domain`    | Backend Lead  | M        | T4, T7        | done   |
| T7  | [Add the three customers specialized repositories: directory, address book and awaiting demand](./customers-repositories.md)                                                               | `infra`     | Backend Lead  | M        | T4            | done   |
| T8  | [Add the Customer lifecycle commands: record, correct the name, deactivate and reactivate](./customer-lifecycle-commands.md)                                                               | `app`       | Backend Lead  | M        | T6, T7        | done   |
| T9  | [Add the Delivery Address book commands: add, revise, mark Main, deactivate and reactivate](./delivery-address-book-commands.md)                                                           | `app`       | Backend Lead  | M        | T6, T7        | done   |
| T10 | [Serve the customers REST surface with its queries and the new @warehouser/contracts/customers subpath](./customers-rest-surface.md)                                                       | `ports`     | Backend Lead  | L        | T5, T8, T9    | done   |
| T11 | [Record the Warehouse's own Delivery Address end to end: Workspace-guarded command, route, contract and detail-pane section](./warehouse-delivery-address.md)                              | `ports`     | Tech Lead     | M        | T3, T4        | done   |
| T12 | [Give a Customer Order its destination and add the redirection command](./customer-order-destination.md)                                                                                   | `app`       | Backend Lead  | M        | T4, T7        | done   |
| T13 | [Redact customer identity in the demand and Customer Order projections and serve their REST surface](./demand-identity-redaction.md)                                                       | `ports`     | Security Lead | L        | T5, T12       | done   |
| T14 | [Extend the purchase-drafts domain with Delivery Mode, the ending rules and the closure predicate](./purchase-draft-delivery-domain.md)                                                    | `domain`    | Backend Lead  | M        | T4            | done   |
| T15 | [Set a line's Delivery Mode and Delivery Address, and enforce the direct-line agreement at the link and the revision](./line-delivery-and-agreement.md)                                    | `app`       | Backend Lead  | L        | T12, T14      | done   |
| T16 | [Freeze the delivery statement by value and refuse the two conditions that make a freeze unsound](./purchase-draft-freeze-capture.md)                                                      | `app`       | Backend Lead  | L        | T11, T15      | done   |
| T17 | [Replace the whole-draft arrival with per-line endings and withdraw POST /purchase-drafts/{id}/arrival](./per-line-endings.md)                                                             | `app`       | Backend Lead  | L        | T14, T16      | done   |
| T18 | [Report Address Drift and serve the by-line split from the read repository](./address-drift-and-by-line-read.md)                                                                           | `app`       | Backend Lead  | M        | T13, T16      | done   |
| T19 | [Serve the purchase-drafts REST surface: line delivery, readiness, the by-line read and the redacted draft reads](./purchase-drafts-rest-surface.md)                                       | `ports`     | Backend Lead  | L        | T15, T16, T18 | done   |
| T20 | [Add the architecture check that ties an identity-bearing response schema to its observed-Permission declaration](./authorization-coverage-checks.md)                                      | `tests`     | Security Lead | M        | T10, T13, T19 | done   |
| T21 | [Build the Customers web destination with its address book, awaiting list, dialogs and the shared customer picker](./customers-destination-ui.md)                                          | `ui`        | Frontend Lead | L        | T10           | done   |
| T22 | [Carry the destination onto the Demand surface and add the redirect dialog](./demand-destination-ui.md)                                                                                    | `ui`        | Frontend Lead | M        | T13, T21      | done   |
| T23 | [Add the per-line DELIVERY block, the drift presentation split by mode, and the By-line view](./purchase-draft-delivery-ui.md)                                                             | `ui`        | Frontend Lead | L        | T19, T21      | done   |
| T24 | [Replace the whole-draft arrival modal with the two 720px per-line ending dialogs](./line-ending-dialogs-ui.md)                                                                            | `ui`        | Frontend Lead | M        | T17, T23      | done   |
| T25 | [Raise the ordering change request and promote @ObservedPermission into docs/system](./ordering-change-request-and-system-docs.md)                                                         | `docs`      | Tech Lead     | M        | T5            | done   |

**Total:** 25 tasks, ~24 person-days (S = ½ day, M/L = 1 day; every task is capped at one working day by design).

**By owner:** Backend Lead 16 · Frontend Lead 4 · Tech Lead 3 · Security Lead 2. T11 spans server
and web as one AC-10 slice; T13 and T20 sit with the Security Lead because they are the two
mechanical defences [sad.md §11](../sad.md) puts in place of a review pass.

**Critical path:** 11 tasks, ~10.5 person-days —
T1 → T2 → T4 → T7 → T12 → T15 → T16 → T18 → T19 → T23 → T24.
Running alongside it: the redaction chain T3 → T5 → T13 → T20, the customers chain
T6/T8/T9 → T10 → T21/T22, and T25, which blocks nothing.

## Review remediation — 2026-09-04

The independent review returned `CHANGES REQUESTED` with 19 stage-1 findings. R1-R19 close the
Fix-now items resolved with the user; R20 fixes a defect found while writing R8's specs rather than
by the review itself. Deferred findings are recorded in [`spec.md`](../spec.md) §8 with owner and due.

| #   | Task                                                                                                                       | Layer   | Blocked by | Raised by            | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- | -------------------- | ------ |
| R1  | Complete the per-line ending contract: promote migration 04, drop receivedQuantity, delete the withdrawn-arrival dead code | `infra` | —          | review 2026-09-04    | done   |
| R2  | Lock the draft row for a line ending so two concurrent last endings cannot both fail to close it                           | `infra` | R1         | review 2026-09-04    | done   |
| R3  | Replace the self-comparing frozen-line assertions with real frozen-line coverage                                           | `tests` | —          | review 2026-09-04    | done   |
| R4  | Seed an Unfulfilled Customer Order in AC-07's last-active-address refusal                                                  | `tests` | R3         | review 2026-09-04    | done   |
| R5  | Prove AC-15's link refusal over HTTP for both address kinds                                                                | `tests` | —          | review 2026-09-04    | done   |
| R6  | Prove AC-14's 409 over HTTP and remove the contradictory 400 clause                                                        | `tests` | R5         | review 2026-09-04    | done   |
| R7  | Give the three purchase-draft refusals member-facing copy that names what the spec requires                                | `ui`    | —          | review 2026-09-04    | done   |
| R8  | Cover the seven Customers write dialogs with component specs                                                               | `ui`    | —          | review 2026-09-04    | done   |
| R9  | Name the promoted Main address in the deactivation toast                                                                   | `ui`    | R8         | review 2026-09-04    | done   |
| R10 | Prove the Customers directory renders read-only in an archived Warehouse                                                   | `ui`    | R8         | review 2026-09-04    | done   |
| R11 | Restore the By-line EXPECTED and ENDING columns with their per-line ending action                                          | `ui`    | —          | review 2026-09-04    | done   |
| R12 | Give LineEndingAction's permission negatives a positive control                                                            | `tests` | —          | review 2026-09-04    | done   |
| R13 | Delete the unbacked field-binding claim from DirectDestinationPickers                                                      | `ui`    | —          | review 2026-09-04    | done   |
| R14 | Mark the e2e-through-UI tier Blocked and move AC-01/AC-04 into the component tier                                          | `docs`  | —          | review 2026-09-04    | done   |
| R15 | Repair the task-layer manifests so layer stays a usable coverage index                                                     | `docs`  | —          | review 2026-09-04    | done   |
| R16 | Give the one-component-per-file gate teeth and a non-empty-corpus guard                                                    | `tests` | —          | review 2026-09-04    | done   |
| R17 | Report unresolved handler return types and assert the companion corpora are non-empty                                      | `tests` | —          | review 2026-09-04    | done   |
| R18 | Match relative specifiers in the controller-persistence boundary rule                                                      | `tests` | —          | review 2026-09-04    | done   |
| R19 | Restore MOVED_ROUTE_COUNT to a frozen moved-route set                                                                      | `tests` | —          | review 2026-09-04    | done   |
| R20 | Pre-fill the two correction dialogs, which opened blank                                                                    | `ui`    | R8         | implement 2026-09-04 | done   |
