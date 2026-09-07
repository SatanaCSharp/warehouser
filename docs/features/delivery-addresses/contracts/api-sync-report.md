---
status: Draft
owner: 'Backend Lead'
reviewers: ['Tech Lead', 'Frontend Lead', 'Security Lead']
updated_at: '2026-09-02'
feature_size: 'L'
---

# API sync report — delivery-addresses

`contracts/openapi.yaml` is a **derived** artifact, not a hand-written one. It is a function of
[`data-model.md`](../data-model.md) (typed fields and constraints), the [`sad.md`](../sad.md) §6
sequence diagrams (error branches, transition guards) and [`spec.md`](../spec.md) §4/§5 (the endpoint
list and the shape of each outcome), with the §7 route table fixing the shapes. This report is the
evidence that the derivation held, and the record of where it did not.

**Gate.** `docs/features/delivery-addresses/data-model.md` is present (40 KB, dated 2026-09-02) with
three staged migrations under `migrations/`. The conditional hard-refuse of step 1 does not apply and
no fast-lane skip was taken: every field origin below is a `data-model.md` column, and the staged DDL
in `migrations/02-add-delivery-destinations.ts` was read as corroboration, never as a substitute.

**Interface kind.** `sad.md` frontmatter declares `target_surfaces: ['web-frontend',
'backend-service']`, **read here rather than re-derived**. `backend-service` over the REST boundary
`docs/system` establishes gives an OpenAPI 3.1 contract; `web-frontend` consumes it and produces no
contract of its own. `sad.md` §6 opens by stating the feature introduces no queue, event, scheduled
job or third-party callback, no §6 diagram carries a `<message-bus>` or `<external-system>`
participant, and §7 closes with "No queue, event, CLI, SDK or worker interface is introduced" — so
**no `events.md` is written**, and no operation carries an `Idempotency-Key`. Both are correct rather
than missing.

**Shape.** 20 paths, 25 operations, 4 tags, 55 schemas, 25 responses, 6 parameters. No dangling
`$ref`, no unreferenced component, no duplicate `operationId`, and no method-and-path pair served
twice — which keeps `tests/refactor/route-table.spec.mjs` green (sad.md §7).

**Scope.** The document restates every operation this feature adds **and** every `ordering` operation
whose request, error set or declared Permissions this feature changes. `ordering` operations it does
not restate are unchanged and stay governed by
[`ordering/contracts/openapi.yaml`](../../ordering/contracts/openapi.yaml). The classification is in
the operation table at the end of Section A.

---

## Section A — field origins

Every field in the contract traces to a column, to a named derivation over columns, or to an explicit
input document. Because the contract `$ref`s every shared schema rather than inlining it, origins are
recorded **per schema** and the operations that use each schema are named alongside — the same
traceability as one row per `(operation, field)` without repeating an identical row twenty-five times.

### `Customer`, `CustomerDeliveryAddress`, `CustomerDetail`, `CustomerAwaitingOrder`

Used by `listCustomers`, `recordCustomer`, `readCustomer`, `correctCustomerName`,
`deactivateCustomer`, `reactivateCustomer`, `addCustomerDeliveryAddress`,
`correctCustomerDeliveryAddress`, `setMainCustomerDeliveryAddress`,
`deactivateCustomerDeliveryAddress`, `reactivateCustomerDeliveryAddress`.

| schema_path                                                             | origin                                                                                                         | confidence |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| `Customer.id`                                                           | data-model.md → `customers.id` (UUID PK, app-generated)                                                        | high       |
| `Customer.name`                                                         | data-model.md → `customers.name` (TEXT, collation `C`, trimmed non-empty) → `minLength: 1`, **no `maxLength`** | high       |
| `Customer.deactivatedAt`                                                | data-model.md → `customers.deactivated_at` (timestamptz NULL, `>= created_at`) → `[string, null]`              | high       |
| `Customer.mainDeliveryAddressId`                                        | derived — the `customer_delivery_addresses` row where `is_main`, held unique by the partial index              | high       |
| `Customer.deliveryAddresses`                                            | derived — `customer_delivery_addresses` by `customer_id` (`idx_customer_delivery_addresses_customer_active`)   | high       |
| `Customer.recordedByUserId`                                             | data-model.md → `customers.recorded_by_user_id` (FK → `users(id)` RESTRICT)                                    | high       |
| `Customer.createdAt` / `.updatedAt`                                     | data-model.md → `customers.created_at` / `.updated_at`                                                         | high       |
| `CustomerDeliveryAddress.id`                                            | data-model.md → `customer_delivery_addresses.id`                                                               | high       |
| `CustomerDeliveryAddress.customerId`                                    | data-model.md → `customer_delivery_addresses.customer_id` (composite FK with `warehouse_id`)                   | high       |
| `CustomerDeliveryAddress.addressText`                                   | data-model.md → `.address_text` (TEXT NOT NULL, trimmed non-empty) → `minLength: 1`, **no `maxLength`**        | high       |
| `CustomerDeliveryAddress.accessNotes`                                   | data-model.md → `.access_notes` (TEXT NULL, trimmed non-empty when present) → `[string, null], minLength: 1`   | high       |
| `CustomerDeliveryAddress.isMain`                                        | data-model.md → `.is_main` (BOOLEAN NOT NULL DEFAULT false; partial UNIQUE `(customer_id) WHERE is_main`)      | high       |
| `CustomerDeliveryAddress.deactivatedAt`                                 | data-model.md → `.deactivated_at`                                                                              | high       |
| `CustomerDetail.awaitingCustomerOrders`                                 | derived — one Customer's **Unfulfilled** orders (`idx_customer_orders_customer_unfulfilled`), spec.md AC-08    | high       |
| `CustomerAwaitingOrder.itemSku` / `.itemDescription` / `.unitOfMeasure` | joined from `items` (unchanged `ordering` columns)                                                             | high       |
| `CustomerAwaitingOrder.outstandingQuantity`                             | data-model.md → `customer_orders.outstanding_quantity` (`ordering`, unchanged)                                 | high       |
| `CustomerAwaitingOrder.neededBy`                                        | data-model.md → `customer_orders.needed_by` (DATE)                                                             | high       |
| `CustomerAwaitingOrder.destination`                                     | derived — join through `customer_orders.customer_delivery_address_id` (sad.md §6.6 read note)                  | high       |
| `CustomerCreate.*` / `CustomerUpdate.name`                              | the same columns; activation and attribution are **not** inputs (AC-01)                                        | high       |
| `CustomerDeliveryAddressCreate.main`                                    | derived — writes `is_main` and clears the previous flag in one transaction (sad.md §6.2 step 5)                | high       |

### `WarehouseDeliveryAddress`, `WarehouseDeliveryAddressWrite`

Used by `setWarehouseDeliveryAddress`.

| schema_path                            | origin                                                                                                       | confidence |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| `WarehouseDeliveryAddress.warehouseId` | data-model.md → `warehouses.id`                                                                              | high       |
| `WarehouseDeliveryAddress.addressText` | data-model.md → `warehouses.delivery_address_text` (TEXT NULL, trimmed non-empty when present)               | high       |
| `WarehouseDeliveryAddress.accessNotes` | data-model.md → `warehouses.delivery_access_notes` (same, + `chk_warehouses_delivery_notes_require_address`) | high       |

No `isMain`, no `deactivatedAt`: the model deliberately gives the Warehouse two columns rather than a
row in the Customer address relation, because a Warehouse has exactly one address, corrects it in
place, and never makes it Inactive.

### `CustomerOrder` (identified / redacted), `CustomerOrderDestination`, `CustomerRef`, request schemas

Used by `listCustomerOrders`, `recordCustomerOrder`, `amendCustomerOrder`, `redirectCustomerOrder`.

| schema_path                                          | origin                                                                                                              | confidence |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| `CustomerOrderIdentified.customer`                   | data-model.md → `customer_orders.customer_id` (**new**, NULL, composite FK → `customers(id, warehouse_id)`)         | high       |
| `CustomerOrderIdentified.customer.name`              | joined live from `customers.name` — never denormalized, which is what makes AC-03b hold                             | high       |
| `CustomerOrderIdentified.customerName`               | data-model.md → `customer_orders.customer_name` (**NOT NULL dropped**; typed-name column only)                      | high       |
| `CustomerOrderIdentified.destination`                | data-model.md → `customer_orders.customer_delivery_address_id` (**new**, composite FK → `(id, customer_id)`)        | high       |
| `CustomerOrderDestination.isMain` / `.deactivatedAt` | joined from `customer_delivery_addresses.is_main` / `.deactivated_at` (sad.md §6.6 step 6 "why it is that address") | high       |
| `CustomerOrder` `oneOf` identified/redacted          | sad.md §7 "models both forms in its schema … omits the fields rather than nulling them"; ADR 0001                   | high       |
| `CustomerOrderCreate` `oneOf` of two variants        | data-model.md → `chk_customer_orders_customer_identity` expressed as a payload rule                                 | high       |
| every other `CustomerOrder*` property                | `ordering` columns, unchanged                                                                                       | high       |

### `PurchaseDraftSummary`, `PurchaseDraftDetail`

Used by `listPurchaseDrafts`, `readPurchaseDraft`, `readyPurchaseDraft`,
`recordPurchaseDraftLineArrival`, `recordPurchaseDraftLineDirectDelivery`.

| schema_path                                            | origin                                                                                                                                                                         | confidence |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `PurchaseDraftSummary.hasDriftSignal`                  | `ordering` derivation, now also raised by an address disagreement of either mode                                                                                               | high       |
| `PurchaseDraftSummary.hasDirectToCustomerAddressDrift` | **derived** — `purchase_draft_demand_snapshots.captured_customer_delivery_address_id` ≠ `customer_orders.customer_delivery_address_id` on a `direct_to_customer` line (AC-18a) | **medium** |
| `PurchaseDraftSummary.arrivalConfirmed*`               | data-model.md → `purchase_drafts.arrival_confirmed_*` (**retained, not dropped**; no new write path names them)                                                                | high       |
| every other summary property                           | `ordering` columns, unchanged                                                                                                                                                  | high       |

`hasDirectToCustomerAddressDrift` is `medium` because the **field** is this stage's derivation:
AC-18a and sad.md §6.9 step 3 separate the two reporting surfaces but name no field. See Finding 2.

### `PurchaseDraftLine` (identified / redacted), destinations, ending

Used by `readPurchaseDraft`, `listPurchaseDraftLines`, `revisePurchaseDraftLine`,
`readyPurchaseDraft`, both ending operations.

| schema_path                                                           | origin                                                                                                                               | confidence |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `PurchaseDraftLineIdentified.deliveryMode`                            | data-model.md → `purchase_draft_lines.delivery_mode` (**new**, VARCHAR(24) NOT NULL DEFAULT `'via_warehouse'`, `IN (…)`) → `enum`    | high       |
| `LineCustomerDestination.customerDeliveryAddressId`                   | data-model.md → `.customer_delivery_address_id` (**new**, NULL, composite FK → `(id, warehouse_id)`)                                 | high       |
| `LineCustomerDestination.addressText`                                 | live `customer_delivery_addresses.address_text`, then `.frozen_delivery_address_text` (**new**) after the freeze                     | high       |
| `LineCustomerDestination.accessNotes`                                 | live `.access_notes`, then `purchase_draft_lines.frozen_access_notes` (**new**)                                                      | high       |
| `LineCustomerDestination.customerName`                                | live `customers.name`, then `purchase_draft_lines.frozen_customer_name` (**new**, direct-to-customer only)                           | high       |
| `LineWarehouseDestination.addressText`                                | live `warehouses.delivery_address_text`, then `purchase_draft_lines.frozen_delivery_address_text`                                    | high       |
| `Line*Destination.frozen`                                             | derived — `frozen_delivery_address_text IS NOT NULL`                                                                                 | high       |
| **the two-property destination split**                                | sad.md §7 "read from the Warehouse-scoped draft and line projections under `PURCHASE_DRAFTS:WATCH` … not gated on `CUSTOMERS:WATCH`" | high       |
| `PurchaseDraftLineEnding.quantity`                                    | data-model.md → `.ending_quantity` (**renamed** from `received_quantity`; NULL, `>= 0`) → `minimum: 0`, no maximum                   | high       |
| `PurchaseDraftLineEnding.kind`                                        | data-model.md → `.ending_kind` (**new**, VARCHAR(24), `IN ('arrival','direct_delivery')`) → `enum`                                   | high       |
| `PurchaseDraftLineEnding.recordedByUserId` / `.recordedAt`            | data-model.md → `.ending_recorded_by_user_id` / `.ending_recorded_at` (**new**)                                                      | high       |
| `PurchaseDraftLineUpdate.deliveryMode` + `.customerDeliveryAddressId` | the same two columns; `dependentRequired` mirrors `chk_purchase_draft_lines_delivery_mode_address`                                   | high       |

### `PurchaseDraftLineLink` (identified / redacted), snapshot, current state, allocation

| schema_path                                                 | origin                                                                                                    | confidence |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| `DemandSnapshotEntryIdentified.capturedDeliveryAddressId`   | data-model.md → `purchase_draft_demand_snapshots.captured_customer_delivery_address_id` (**new**)         | high       |
| `DemandSnapshotEntryIdentified.capturedDeliveryAddressText` | data-model.md → `.captured_delivery_address_text` (**new**); paired by `chk_…_captured_address_pairing`   | high       |
| both nullable together                                      | data-model.md — the legitimate case of a link to a **typed-name** order (AC-11a, AC-15b)                  | high       |
| `LinkedCustomerOrderStateIdentified.deliveryAddress`        | derived — the linked order's **current** `customer_delivery_address_id`, read at the instant of the read  | high       |
| `DriftSignalKind.delivery_address_changed`                  | derived — the identity comparison of the two above (CONTEXT.md "Address Drift", AC-18)                    | high       |
| `EndingAllocation.*`                                        | `ordering`'s `arrival_allocations` columns; the schema is **renamed** from `ArrivalAllocation` (ADR 0002) | high       |
| `PurchaseDraftLineLinkRedacted.driftSignals`                | derived — the signal is kept, the two addresses it compares are omitted (AC-09a)                          | **medium** |

`PurchaseDraftLineLinkRedacted.driftSignals` is `medium`: AC-09a requires withholding names,
addresses and counts and requires showing "everything their own Permissions do admit". Keeping the
signal while withholding both addresses is this stage's reading of that pair. See Finding 4.

### Fields with **no** column, recorded explicitly

| schema_path                                            | origin                                                                                        | confidence |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------- |
| `listCustomers?active`                                 | derived — the picker read AC-06 implies; mirrors `ordering`'s `GET /items?active=true`        | high       |
| `listCustomerOrders?customerId` / `?deliveryAddressId` | derived — the linkable-order read AC-15 needs (sad.md §6.7 step 7)                            | **medium** |
| `listPurchaseDraftLines?deliveryMode` / `?state`       | derived — the by-line split AC-22 describes (sad.md §6.9 step 6)                              | high       |
| `CustomerFilterDenied` (400)                           | derived — spec.md §6.1 "Customer disclosure through a count" applied to the two filters above | **medium** |

See Finding 5 for the two `medium` rows.

### Operation → user story → acceptance criteria → Permission → change class

| Operation                               | Story        | Acceptance criteria          | Required Permission                     | Observed          | Class   |
| --------------------------------------- | ------------ | ---------------------------- | --------------------------------------- | ----------------- | ------- |
| `listCustomers`                         | US-01, US-03 | AC-06, AC-09                 | `CUSTOMERS:WATCH`                       | —                 | new     |
| `recordCustomer`                        | US-01        | AC-01, AC-02, AC-03, AC-03a  | `CUSTOMERS:CREATE`                      | —                 | new     |
| `readCustomer`                          | US-04        | AC-08, AC-09                 | `CUSTOMERS:WATCH`                       | —                 | new     |
| `correctCustomerName`                   | US-01        | AC-03b, AC-03c               | `CUSTOMERS:UPDATE`                      | —                 | new     |
| `deactivateCustomer`                    | US-03        | AC-06, AC-23                 | `CUSTOMERS:DEACTIVATE`                  | —                 | new     |
| `reactivateCustomer`                    | US-03        | AC-06                        | `CUSTOMERS:DEACTIVATE`                  | —                 | new     |
| `addCustomerDeliveryAddress`            | US-02        | AC-04, AC-05                 | `CUSTOMERS:UPDATE`                      | —                 | new     |
| `correctCustomerDeliveryAddress`        | US-02        | AC-04                        | `CUSTOMERS:UPDATE`                      | —                 | new     |
| `setMainCustomerDeliveryAddress`        | US-02        | AC-04, AC-05                 | `CUSTOMERS:UPDATE`                      | —                 | new     |
| `deactivateCustomerDeliveryAddress`     | US-03        | AC-06a, AC-06b, AC-07        | `CUSTOMERS:UPDATE`                      | —                 | new     |
| `reactivateCustomerDeliveryAddress`     | US-03        | AC-06a                       | `CUSTOMERS:UPDATE`                      | —                 | new     |
| `setWarehouseDeliveryAddress`           | US-05        | AC-10, AC-16a                | `WAREHOUSES:ADDRESS_UPDATE` (Workspace) | —                 | new     |
| `readConsolidatedDemand`                | US-06        | AC-11, AC-24, AC-09a         | `CUSTOMER_ORDERS:WATCH`                 | `CUSTOMERS:WATCH` | changed |
| `listCustomerOrders`                    | US-06        | AC-09a, AC-11a, AC-24        | `CUSTOMER_ORDERS:WATCH`                 | `CUSTOMERS:WATCH` | changed |
| `recordCustomerOrder`                   | US-06        | AC-11, AC-11a, AC-12, AC-24  | `CUSTOMER_ORDERS:CREATE`                | `CUSTOMERS:WATCH` | changed |
| `amendCustomerOrder`                    | US-06        | AC-09a                       | `CUSTOMER_ORDERS:UPDATE`                | `CUSTOMERS:WATCH` | changed |
| `redirectCustomerOrder`                 | US-06        | AC-11b, AC-11c, AC-18, AC-23 | `CUSTOMER_ORDERS:UPDATE`                | `CUSTOMERS:WATCH` | new     |
| `listPurchaseDrafts`                    | US-10        | AC-18a, AC-09a               | `PURCHASE_DRAFTS:WATCH`                 | `CUSTOMERS:WATCH` | changed |
| `readPurchaseDraft`                     | US-09, US-10 | AC-16, AC-18, AC-18a, AC-09a | `PURCHASE_DRAFTS:WATCH`                 | `CUSTOMERS:WATCH` | changed |
| `listPurchaseDraftLines`                | US-12        | AC-22                        | `PURCHASE_DRAFTS:WATCH`                 | `CUSTOMERS:WATCH` | new     |
| `revisePurchaseDraftLine`               | US-07, US-08 | AC-13, AC-14, AC-15a, AC-17  | `PURCHASE_DRAFTS:UPDATE`                | `CUSTOMERS:WATCH` | changed |
| `linkPurchaseDraftLine`                 | US-08        | AC-15, AC-15b                | `PURCHASE_DRAFTS:UPDATE`                | `CUSTOMERS:WATCH` | changed |
| `readyPurchaseDraft`                    | US-09        | AC-15a, AC-16, AC-16a, AC-17 | `PURCHASE_DRAFTS:READY`                 | —                 | changed |
| `recordPurchaseDraftLineArrival`        | US-11        | AC-19, AC-20, AC-20a, AC-21  | `PURCHASE_DRAFTS:RECEIVE`               | —                 | new     |
| `recordPurchaseDraftLineDirectDelivery` | US-11        | AC-19, AC-20, AC-20a, AC-21  | `PURCHASE_DRAFTS:RECEIVE`               | —                 | new     |

14 new, 11 changed. One `ordering` operation is **withdrawn**:
`POST /api/v1/warehouses/{warehouseId}/purchase-drafts/{purchaseDraftId}/arrival`
(`confirmPurchaseDraftArrival`), replaced by the two per-line sub-resources (sad.md §7, ADR 0002).
`closePurchaseDraft` and `cancelCustomerOrder` are **unchanged** and are not restated.

---

## Section B — drift findings

### 1. Endpoint ↔ data-model — ✓ (core)

Every operation reads or writes at least one entity in `data-model.md`, and every entity the model
adds or changes is reachable through at least one operation.

| Entity (data-model.md)                                              | Written by                                                                                                                                                                                   | Read by                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `customers` (new)                                                   | `recordCustomer`, `correctCustomerName`, `deactivateCustomer`, `reactivateCustomer`                                                                                                          | `listCustomers`, `readCustomer`, every identified projection               |
| `customer_delivery_addresses` (new)                                 | `recordCustomer`, `addCustomerDeliveryAddress`, `correctCustomerDeliveryAddress`, `setMainCustomerDeliveryAddress`, `deactivateCustomerDeliveryAddress`, `reactivateCustomerDeliveryAddress` | `listCustomers`, `readCustomer`, every destination                         |
| `customer_orders.customer_id` (new)                                 | `recordCustomerOrder`                                                                                                                                                                        | `listCustomerOrders`, `readCustomer`, link projections                     |
| `customer_orders.customer_delivery_address_id` (new)                | `recordCustomerOrder`, `redirectCustomerOrder`                                                                                                                                               | `listCustomerOrders`, `readCustomer`, `readPurchaseDraft`                  |
| `customer_orders.customer_name` (NOT NULL dropped)                  | `recordCustomerOrder` (typed-name variant only)                                                                                                                                              | `listCustomerOrders`                                                       |
| `purchase_draft_lines.delivery_mode` (new)                          | `revisePurchaseDraftLine`                                                                                                                                                                    | `readPurchaseDraft`, `listPurchaseDraftLines`                              |
| `purchase_draft_lines.customer_delivery_address_id` (new)           | `revisePurchaseDraftLine`                                                                                                                                                                    | `readPurchaseDraft`, `listPurchaseDraftLines`                              |
| `purchase_draft_lines.frozen_*` (3 new)                             | `readyPurchaseDraft`                                                                                                                                                                         | `readPurchaseDraft`, `listPurchaseDraftLines`                              |
| `purchase_draft_lines.ending_*` (4 new/renamed)                     | `recordPurchaseDraftLineArrival`, `recordPurchaseDraftLineDirectDelivery`                                                                                                                    | `readPurchaseDraft`, `listPurchaseDraftLines`                              |
| `purchase_draft_demand_snapshots.captured_*` (2 new)                | `readyPurchaseDraft`                                                                                                                                                                         | `readPurchaseDraft` (the drift comparison)                                 |
| `purchase_drafts.state` → `closed` (relaxed check)                  | both ending operations, conditionally on the last line                                                                                                                                       | `listPurchaseDrafts`, `readPurchaseDraft`                                  |
| `warehouses.delivery_address_text` / `.delivery_access_notes` (new) | `setWarehouseDeliveryAddress`                                                                                                                                                                | `readPurchaseDraft`, `listPurchaseDraftLines` (via `warehouseDestination`) |

No entity in the model is unreachable, and no operation writes a column the model does not define.

`purchase_drafts.arrival_confirmed_by_user_id` / `.arrival_confirmed_at` are **read but never
written** by this contract, which is exactly what `data-model.md` decides — retained as the record of
drafts closed before this release, with no new write path naming them. Recorded as intended, not as a
gap.

### 2. Error code ↔ repo error definition — ✓ with a recorded pending addition (core)

The repository keeps a central registry: `packages/shared-types/src/enums/error-code.ts`, a
`const` object of `module.error_name` strings consumed by `ApplicationError` and mapped once by
`apps/server/src/shared/errors/global-http-exception.filter.ts`. Every code in the contract was
checked against it.

**18 codes already exist** and are used unchanged: `access.denied`, `access.membership_required`,
`access.warehouse_archived`, `access.write_rate_limited`, `customer_orders.invalid_input`,
`customer_orders.invalid_state`, `customer_orders.target_unavailable`,
`purchase_drafts.allocation_out_of_bounds`, `purchase_drafts.concurrent_change`,
`purchase_drafts.draft_frozen`, `purchase_drafts.invalid_input`,
`purchase_drafts.target_unavailable`, `system.internal_error`, `workspace.denied`,
`workspace.invalid_input`, `workspace.target_unavailable`, plus `request.invalid`, which is a
literal produced by the global filter (`global-http-exception.filter.ts:602`) rather than a registry
entry — the same treatment `ordering`'s contract gives it.

**10 codes do not exist yet** and are this contract's proposal. `tasks` must add each to
`ErrorCode` and to the filter's status map in the same change that implements its operation:

| Proposed code                                         | Status | Raised by                                                                | Criterion     |
| ----------------------------------------------------- | -----: | ------------------------------------------------------------------------ | ------------- |
| `customers.invalid_input`                             |    400 | `recordCustomer`, `correctCustomerName`, address writes                  | AC-02         |
| `customers.name_taken`                                |    409 | `recordCustomer`, `correctCustomerName`                                  | AC-03, AC-03c |
| `customers.target_unavailable`                        |    404 | every Customer- or address-addressing operation                          | AC-12, AC-23  |
| `customers.last_active_delivery_address`              |    409 | `deactivateCustomerDeliveryAddress`                                      | AC-07         |
| `customers.invalid_delivery_address`                  |    409 | `setMainCustomerDeliveryAddress`                                         | AC-06b        |
| `customer_orders.invalid_delivery_address`            |    409 | `recordCustomerOrder`, `redirectCustomerOrder`                           | AC-11c        |
| `purchase_drafts.invalid_delivery_destination`        |    409 | `revisePurchaseDraftLine`                                                | AC-14         |
| `purchase_drafts.delivery_address_disagreement`       |    409 | `revisePurchaseDraftLine`, `linkPurchaseDraftLine`, `readyPurchaseDraft` | AC-15, AC-15a |
| `purchase_drafts.warehouse_delivery_address_required` |    409 | `readyPurchaseDraft`                                                     | AC-16a        |
| `purchase_drafts.ending_already_recorded`             |    409 | both ending operations                                                   | AC-20a        |
| `purchase_drafts.ending_mode_mismatch`                |    409 | both ending operations                                                   | AC-20         |

Every proposed code follows the registry's existing namespaces (`customers` is new and matches the
`items` / `customer_orders` / `purchase_drafts` pattern) and the neutral `module.error_name`
convention. None is a driver error type or a framework idiom.

**One discrepancy in a shipped contract, not in this one.**
`ordering/contracts/openapi.yaml` uses `request.rate_limited` in its `WriteRateLimited` example, but
`WriteRateLimitGuard` raises `ErrorCode.ACCESS_WRITE_RATE_LIMITED` — `access.write_rate_limited`
(`apps/server/src/shared/guards/write-rate-limit.guard.ts:18`). This contract uses the code the guard
actually raises. Correcting `ordering`'s example is out of this stage's scope; recorded here so it is
not lost.

### 3. Validation ↔ constraint — ✓ (core)

Every bound in the contract was taken from the model, and no bound was invented.

| Contract validation                                                    | Model constraint                                                                  | Match |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----- |
| `DeliveryMode` `enum [via_warehouse, direct_to_customer]`              | `delivery_mode varchar(24)`, `chk_purchase_draft_lines_delivery_mode`             | ✓     |
| `EndingKind` `enum [arrival, direct_delivery]`                         | `ending_kind varchar(24)` `IN ('arrival','direct_delivery')`                      | ✓     |
| `CustomerOrderState`, `PurchaseDraftState` enums                       | unchanged `ordering` checks; `chk_purchase_drafts_closure_path` **relaxed**       | ✓     |
| `AddressText` `minLength: 1`, no `maxLength`                           | `TEXT NOT NULL`, trimmed non-empty, **no upper bound**                            | ✓     |
| `AccessNotes` `[string, null]`, `minLength: 1`                         | `TEXT NULL`, trimmed non-empty when present                                       | ✓     |
| `Customer.name` `minLength: 1`, no `maxLength`                         | `TEXT NOT NULL`, collation `C`, trimmed non-empty                                 | ✓     |
| `PurchaseDraftLineEnding.quantity` `minimum: 0`, no maximum            | `ending_quantity INTEGER NULL`, `>= 0` when present, deliberately unbounded above | ✓     |
| `EndingAllocationCreate.allocatedQuantity` `minimum: 1`                | `arrival_allocations` positive-quantity check (`ordering`, unchanged)             | ✓     |
| `CustomerOrderCreate` `oneOf` two variants                             | `chk_customer_orders_customer_identity`                                           | ✓     |
| `PurchaseDraftLineUpdate.dependentRequired`                            | `chk_purchase_draft_lines_delivery_mode_address`                                  | ✓     |
| `DemandSnapshotEntryIdentified` both captured fields nullable together | `chk_purchase_draft_demand_snapshots_captured_address_pairing`                    | ✓     |
| `PurchaseDraftLineEnding` all four properties required together        | `chk_purchase_draft_lines_ending_attribution`                                     | ✓     |
| `Customer.mainDeliveryAddressId` nullable                              | **no row constraint** — the model states this deliberately                        | ✓     |
| `uuid` formats on every identifier                                     | `UUID` PKs and FKs throughout                                                     | ✓     |

Three model rules are deliberately **not** contract validations, and the contract says so where they
apply rather than pretending otherwise:

- **"A Customer always keeps at least one active Delivery Address"** (AC-07) is a transition rule
  evaluated under lock, not a row rule (`data-model.md` § "Deliberately not constraints"). It appears
  as the `customers.last_active_delivery_address` refusal, never as a schema bound.
- **"A Direct to Customer line agrees with its links"** (AC-15a) is likewise a transition rule
  evaluated at three moments. It appears as `purchase_drafts.delivery_address_disagreement` on all
  three operations, never as a schema bound.
- **"A frozen line's Delivery Mode and Delivery Address never change"** (AC-17) is a state-guarded
  transition inside the owning command. It appears as the `draft`-state-only resolution of
  `revisePurchaseDraftLine` and as `purchase_drafts.draft_frozen`, never as a `readOnly` flag.

**AC-14 needs no clause of its own, and the contract does not invent one.** The Warehouse's own
address is columns on `warehouses` with no identifier `customerDeliveryAddressId` could hold, so a
direct line naming it is structurally impossible; the refusal is about the member's submitted intent,
which is why it is a 409 bound to the destination field rather than a schema constraint.

### 4. OpenAPI ↔ sequence — ✓ (supporting)

Matched on the **flow and its `alt`-branches**, not on participant names, since §6 participants are
generic.

| sad.md §6 flow | `alt`-branches                                                                                                                                         | Contract resolution                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| §6.1           | unauthenticated / no or ambiguous Warehouse / no membership or required Permission / archived + not read-tolerant / holds `CUSTOMERS:WATCH` / does not | 401 · **structurally impossible** (see below) · 403 `WarehouseDenied` · 409 `WarehouseArchived` · every identity-bearing schema's `oneOf` |
| §6.2           | blank name or address / name held / name free · address added · name collides / name free                                                              | 400 · 409 `customers.name_taken` · 201 · 409 · 200                                                                                        |
| §6.3           | Customer deactivated · one active address remains / more + this is Main / more + not Main                                                              | 200 · 409 `customers.last_active_delivery_address` · 200 naming the new Main · 200                                                        |
| §6.4           | no Workspace membership or grant / blank address / accepted                                                                                            | 403 `WorkspaceDenied` · 400 `workspace.invalid_input` · 200                                                                               |
| §6.5           | Customer or address elsewhere / no address stated / address stated · typed name · redirect invalid / valid                                             | 404 · 201 (Main) · 201 (stated) · 201 · 409 `CustomerOrderRedirectConflict` · 200                                                         |
| §6.6           | holds `CUSTOMERS:WATCH` / absent · actor lacks it (UI) / holds it                                                                                      | `CustomerOrder` `oneOf` · 403 on `readCustomer` (the **server** denial, which is the guarantee)                                           |
| §6.7           | Warehouse's own address / a Customer's · links disagree / agree · link to another address / same                                                       | 409 `invalid_delivery_destination` · 409 `delivery_address_disagreement` · 200 · 409 · 201                                                |
| §6.8           | Via Warehouse line + no Warehouse address / a direct line disagrees / every line agrees                                                                | 409 `warehouse_delivery_address_required` · 409 `delivery_address_disagreement` · 200                                                     |
| §6.9           | direct line disagrees / via line disagrees / nothing disagrees · by-line view                                                                          | `hasDirectToCustomerAddressDrift: true` · detail-read `driftSignals` · both `false` · `listPurchaseDraftLines`                            |
| §6.10          | ending already recorded / wrong mode / matches · closure conditional · On-hand read                                                                    | 409 `ending_already_recorded` · 409 `ending_mode_mismatch` · 200 · `state` in the response · **no operation writes `onHandQuantity`**     |

**The §6.1 "path and body disagree" branch is structurally eliminated, not skipped.** Every route
carries `warehouseId` as a required path parameter and **no request schema anywhere in this contract
carries a `warehouseId` property** — `additionalProperties: false` on every request body makes
submitting one a validation failure. The branch cannot arise, which is stronger than answering it.

**AC-21 has no operation of its own, and correctly so.** "No Item's On-hand Quantity changes" is
satisfied by the absence of any write: neither ending payload carries an on-hand field, and
`onHandQuantity` appears in this contract only on `DemandLine`, as a read. Recorded as
covered-by-omission rather than claimed as covered by an endpoint.

### Back-feed — coverage cross-check

| Direction                                              | Result                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Every `spec.md` §5 AC maps to ≥1 operation or response | **38 / 38** — see the operation table in Section A                                |
| Every operation maps to a §4 user story **and** ≥1 AC  | **25 / 25**                                                                       |
| Every `spec.md` §4 user story has ≥1 operation         | **12 / 12**                                                                       |
| Every `sad.md` §6 `alt`-branch has a response          | every branch resolves; one is structurally eliminated (§6.1, above)               |
| Every `sad.md` §7 route-table row has an operation     | **20 / 20**, plus the withdrawn whole-draft arrival, recorded as withdrawn        |
| Every §7 declared failure code has a response          | **16 / 16** — the list in §7's penultimate bullet                                 |
| Every `spec.md` §6.1 Permission is exercised           | **5 / 5** new keys, plus the 6 existing `ordering` keys the feature reuses        |
| Contract fields with no origin in any input            | **none** — four derivations are recorded as `medium` above and raised as findings |

No **sequence gap** was found: no error or authorization response the contract needs is missing a §6
flow. Two coverage observations, neither a gap:

- §6 draws no flow for the Customer **list** itself (`listCustomers`); it is derived from AC-06's
  "stops being offered when demand is recorded" and AC-09's denial, and mirrors `ordering`'s
  `GET /items`. Recorded, not raised.
- `correctCustomerDeliveryAddress` (`PATCH …/delivery-addresses/{id}`) appears in the §7 route table
  but in no §6 flow. Its semantics — a live reference follows the correction, a frozen capture does
  not, and a typo correction is **not** Address Drift — are derived from `data-model.md`
  (`purchase_draft_demand_snapshots`, the two-column decision) and stated in the operation
  description. Recorded, not raised.

---

## Findings requiring your decision

All three **core** drift points pass. Five flags were raised; because there were ≥3, the run paused
and the two that change what `tasks` builds were put to the owner. **Findings 1 and 4 are resolved —
both defaults accepted, 2026-09-02** — and the contract needed no change for either. Findings 2, 3
and 5 stand at their recorded defaults; none blocks the next stage.

### Finding 1 — `GET /demand` declares an observed Permission but has no field to redact — **resolved**

`sad.md` §7's route table gives `GET /demand` the observed `CUSTOMERS:WATCH`. But §6.6 step 2's read
note says the destination columns join in **"leaving the aggregation shape `ordering` established
unchanged"**, and `ordering`'s `DemandLine` carries no customer name and no per-order row — it
carries `unfulfilledCustomerOrderCount`, described there as "the count behind the expandable
sub-rows", which are fetched separately.

The two statements fork:

- **(a)** the demand _surface_ is the Demand Lines plus `GET /customer-orders?itemId=&state=`, and
  the redaction of AC-09a/AC-24 lands entirely on `CustomerOrder`. `GET /demand` then declares an
  observed Permission that redacts nothing — defensible as coverage-check hygiene (sad.md §8 requires
  every read on the identity-bearing surface to declare it), but it is a declaration with no effect;
- **(b)** `DemandLine` gains the orders behind it, each with its Customer and destination. This
  matches §6.6 step 3's "each order with its customer name and destination" literally, but
  contradicts "the aggregation shape … unchanged" and puts up to 5 000 Unfulfilled orders into a read
  the spec holds to a 400 ms p95 with **no regression** against `ordering`.

**Resolved — Accept as is (owner, 2026-09-02): (a).** `DemandLine` is restated unchanged, the
observed Permission is declared, and the operation description states that it redacts nothing under
this shape. The demand screen composes the Demand Lines with
`GET /customer-orders?itemId=&state=unfulfilled`, which is where AC-09a's and AC-24's redaction
lands. `design` and `tasks` build against that composition; the §6 400 ms p95 no-regression target is
unaffected.

The residual, recorded rather than glossed: `GET /demand`'s observed Permission has no field to
redact today. It is declared so the architecture check sad.md §8 requires — every read on the
identity-bearing draft-and-demand surface declares the observed Permission — has no exception to
carve out, and so that adding an identity field to `DemandLine` later cannot silently skip it.

### Finding 2 — `hasDirectToCustomerAddressDrift` is a field this stage derived

AC-18a and §6.9 step 3 separate two reporting surfaces: drift on a **Direct to Customer** line is
seen on the draft list without opening anything; the same drift on a **Via Warehouse** line is seen
when the draft is opened. Neither source names a field.

`ordering` already ships `hasDriftSignal` on the list summary, meaning "any drift on this draft". If
address drift on a Via Warehouse line raised only that flag, it would appear on the list too and
AC-18a's distinction would be lost.

**Default taken:** keep `hasDriftSignal` with its `ordering` meaning (any drift, address drift of
either mode included) and add `hasDirectToCustomerAddressDrift` as the distinct, stronger list
signal. **Alternative:** narrow `hasDriftSignal` to exclude via-warehouse address drift — which would
change a shipped field's meaning and is the more disruptive of the two.

### Finding 3 — `allOf` over a schema that closes itself with `additionalProperties: false`

`CustomerDetail`, `PurchaseDraftDetail` and `CustomerDeliveryAddressCreate` were first written as
`allOf` over a closed base. Under a strict validator that composition **rejects the very property it
adds**: the base's `additionalProperties: false` applies to the whole instance, so
`awaitingCustomerOrders`, `lines` and `main` all fail validation.

**Resolved in this contract:** all three are written flat, and `@redocly/cli lint` now reports zero
example-conformance warnings against them.

**Surfaced, not fixed:** `ordering/contracts/openapi.yaml` carries the same defect on its own
`PurchaseDraftDetail`; linting that file reports two `no-invalid-media-type-examples` warnings from
it today. Fixing a shipped contract is outside this stage's scope — recorded so it is not lost.

### Finding 4 — the redacted link keeps `delivery_address_changed` — **resolved**

`PurchaseDraftLineLinkRedacted` withholds the customer, the captured address and the current address,
but **keeps the `delivery_address_changed` Drift Signal** and keeps `hasDirectToCustomerAddressDrift`
on the summary.

AC-09a requires withholding "every customer name … together with the Delivery Addresses and access
notes … no count from which the member could infer them", _and_ requires continuing to show that
member "everything their own Permissions do admit". A member holding `PURCHASE_DRAFTS:WATCH` is
entitled to know that a draft carries drift — that is a fact about the draft, and `ordering` already
shows them `hasDriftSignal`.

**Resolved — Accept as is (owner, 2026-09-02):** keep the signal, withhold both addresses and the
customer.

**The residual inference, stated plainly and accepted:** a member without `CUSTOMERS:WATCH` learns
that _some_ Customer Order behind this line was redirected. They learn no name, no address and no
count, and cannot tell which order or where it now goes. This is the accepted boundary; the
alternative — dropping `delivery_address_changed` from the redacted `driftSignals` and forcing
`hasDirectToCustomerAddressDrift: false` — would cost a member preparing the dock the AC-18a signal
that a directly-shipped line is now going to the wrong place, which the owner judged the worse trade.

`spec.md` §6.1 requires a security review of this feature. This decision is a named item for it: it
is a deliberate accepted inference, not an oversight, and the reviewer should confirm rather than
rediscover it.

### Finding 5 — `?customerId` / `?deliveryAddressId` and their 400 refusal are derived, not specified

`listCustomerOrders` gains two filters and a `CustomerFilterDenied` (400) refusal for an actor without
`CUSTOMERS:WATCH`. Neither appears in `spec.md` or the §7 route table.

The origin is real but indirect: AC-15 requires a member assembling a Direct to Customer line to find
the demand going to one address, and §6.7 step 7 has them link exactly those orders; spec.md §6.1
"Customer disclosure through a count" then forbids serving that filter to an actor who may not read
the records, since the resulting count answers "does this Customer exist".

**Default taken:** both filters exist and both are refused without `CUSTOMERS:WATCH` — refused rather
than silently ignored, because silently returning an unfiltered list would be a correctness bug on
the picker. **Alternative:** drop the filters and have the browser narrow client-side, which would
ship every Unfulfilled order of the Item to the client and is worse on both counts.

### Two free-text columns carry no upper bound (recorded, not a finding)

`customers.name`, `customer_delivery_addresses.address_text`, `.access_notes`,
`warehouses.delivery_address_text` and `.delivery_access_notes` are all `TEXT` with a trimmed-non-empty
check and no length limit, so the contract states `minLength: 1` and no `maxLength`. This is the same
condition `ordering`'s report records for its seven free-text columns; the contract reflects the model
faithfully rather than inventing a bound the database would not enforce.

---

## Recorded deviations from the skill's defaults

Each is source-backed, not a preference, and each matches the four shipped contracts in this
repository.

| Default                                  | This contract                                                              | Authority                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cursor pagination on every list          | **No pagination.** Lists are returned whole and deterministically ordered. | `sad.md` §7: "List responses are returned whole and deterministically ordered at the `spec.md` §1 scale." `spec.md` §1 fixes that scale (~500 Customers and ~1 500 Delivery Addresses per Warehouse). `ordering` and `workspaces` already return collections as bare arrays.    |
| `BearerAuth` global                      | **`SessionCookie`** (`warehouser_session`, `apiKey` in cookie).            | The repository ships session-cookie authentication; `auth`, `access`, `users-management`, `workspaces` and `ordering` all declare it. No public endpoint exists here, so no operation overrides with `security: []`.                                                            |
| snake_case JSON fields                   | **camelCase.**                                                             | House style across all five shipped contracts. Column names stay snake_case and are the origin recorded in Section A.                                                                                                                                                           |
| `{code, message, details?}` envelope     | unchanged                                                                  | Matches the global filter's envelope exactly.                                                                                                                                                                                                                                   |
| URL versioning `/api/v1/...`             | unchanged                                                                  | Warehouse-scoped routes under `/api/v1/warehouses/{warehouseId}/`; the one Workspace-scoped route under `/api/v1/workspace/warehouses/{warehouseId}/`.                                                                                                                          |
| `Idempotency-Key` on retriable mutations | **none.**                                                                  | `sad.md` §6 states the feature introduces no asynchronous work, so "every flow is a synchronous request → response and none of them carries an idempotency key, a retry note or a dead-letter branch". Introducing one here would be inventing a mechanism the design excludes. |
| `contracts/events.md`                    | **absent.**                                                                | Correctly absent: no async flow, no `<message-bus>` or `<external-system>` participant in any §6 diagram, and §7's "No queue, event, CLI, SDK or worker interface is introduced".                                                                                               |

Three shape decisions also worth naming, since none is a skill default:

- **Two destination properties per line**, `warehouseDestination` and `customerDestination`, rather
  than one polymorphic `destination`. This is what makes "the Warehouse's own address is read under
  `PURCHASE_DRAFTS:WATCH` and is not gated on `CUSTOMERS:WATCH`" (sad.md §7) expressible: the
  redacted line omits one property and keeps the other. One polymorphic property could only be nulled
  or omitted whole, which would either leak the customer address or withhold the Warehouse's own.
- **`oneOf` identified/redacted on every identity-bearing schema**, with the redacted form **omitting**
  properties rather than nulling them — sad.md §7's requirement, so that a redaction failure fails
  contract validation on the way out instead of reaching a screen.
- **Two ending routes with differently-named quantities** (`receivedQuantity` / `deliveredQuantity`)
  over one column, `ending_quantity`. ADR 0002 makes the ending kind a routing fact; naming the
  quantity for what actually happened follows the same reasoning as the column's rename.

---

## Structural self-check

| Check                                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document parses as YAML, `openapi: 3.1.0`                   | ✓                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@redocly/cli lint`                                         | ✓ valid — 2 warnings, both stylistic (`info-license`, `no-server-example.com`), identical to the shipped `ordering` contract                                                                                                                                                                                                                                                                                                                                   |
| Every `example` conforms to its schema                      | ✓ — `no-invalid-media-type-examples` clean after Finding 3 was fixed                                                                                                                                                                                                                                                                                                                                                                                           |
| Paths / operations / tags / schemas                         | 20 / 25 / 4 / 55                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Duplicate `operationId`                                     | none                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Duplicate method-and-path pair                              | none — `tests/refactor/route-table.spec.mjs` stays green                                                                                                                                                                                                                                                                                                                                                                                                       |
| Dangling `$ref`                                             | none                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Unreferenced component (schema, response, parameter)        | none                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Shared types inlined instead of `$ref`                      | none                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `nullable: true` (3.0 style)                                | none — every nullable is `type: [x, "null"]` or a `oneOf` with `type: "null"`                                                                                                                                                                                                                                                                                                                                                                                  |
| Every operation declares 401, 403 and 500                   | ✓ 25 / 25                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mutating operations declaring 429                           | 17 / 18. `setWarehouseDeliveryAddress` is the exception and correctly so: `@WriteRateLimited()` is applied today only by the `items`, `customer-orders` and `purchase-drafts` controllers, and `spec.md` §6.1 scopes the limit to recording Customers and Delivery Addresses "on the same terms as the ordering mutations" — the Warehouse-scoped set. The Workspace-level write inherits the shipped `WarehouseController`'s shape, which carries no limiter. |
| Every operation has a request and/or response example       | ✓ 25 / 25                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Real PII in any example                                     | none — placeholder names (`Test Customer North`), placeholder addresses (`Test Address 1, Test City`) and `00000000-0000-4000-8000-…` identifiers only                                                                                                                                                                                                                                                                                                         |
| A customer name, address or access note in an error example | none — every `details` block carries identifiers and field names only                                                                                                                                                                                                                                                                                                                                                                                          |
| `spec.md` §5 AC coverage                                    | 38 / 38                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `spec.md` §4 user-story coverage                            | 12 / 12                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `spec.md` §6.1 Permission coverage                          | 5 / 5 new keys exercised; every read that can carry customer identity declares the observed one                                                                                                                                                                                                                                                                                                                                                                |
| `sad.md` §7 route-table coverage                            | 20 / 20, plus the withdrawn whole-draft arrival recorded as withdrawn                                                                                                                                                                                                                                                                                                                                                                                          |
| `sad.md` §6 `alt`-branch coverage                           | every branch resolves to a response; one is structurally eliminated                                                                                                                                                                                                                                                                                                                                                                                            |
| `events.md`                                                 | correctly absent — the feature has no async flow                                                                                                                                                                                                                                                                                                                                                                                                               |

**Not run: `spectral lint`.** No Spectral ruleset is wired into this repository's check target and
none of the five shipped contracts is linted by CI. `@redocly/cli lint` was run instead (via `npx`,
not added as a dependency) because it validates examples against their schemas, which is what caught
Finding 3. Wiring one of the two into the repository's check target is proposed in the handoff.
