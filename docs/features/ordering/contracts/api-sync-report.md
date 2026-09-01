---
status: Draft
owner: 'Backend Lead'
reviewers: ['Tech Lead', 'Frontend Lead', 'Security Lead']
updated_at: '2026-08-25'
feature_size: 'XL'
---

# API sync report — ordering

`contracts/openapi.yaml` is a **derived** artifact, not a hand-written one. It is a function of
[`data-model.md`](../data-model.md) (typed fields and constraints), the
[`sad.md`](../sad.md) §6 sequence diagrams (error branches, transition guards) and
[`spec.md`](../spec.md) §4/§5 (the endpoint list and the shape of each outcome). This report is the
evidence that the derivation held, and the record of where it did not.

**Interface kind.** `sad.md` frontmatter declares `target_surfaces: ['web-frontend',
'backend-service']`, read here rather than re-derived. `backend-service` over the REST boundary
`docs/system` establishes gives an OpenAPI 3.1 contract; `web-frontend` consumes it and produces no
contract of its own. `sad.md` §6 states the feature introduces no queue, event, scheduled job or
third-party callback, and no §6 diagram carries a `<message-bus>` or `<external-system>`
participant — so **no `events.md` is written**, which is correct rather than missing.

**Shape.** 18 paths, 26 operations, 3 tags. No dangling `$ref`, no unreferenced component, no
duplicate `operationId`, and no method-and-path pair served twice — which keeps
`tests/refactor/route-table.spec.mjs` green (sad.md §7).

---

## Section A — field origins

Every field in the contract traces to a column, to a named derivation over columns, or to an
explicit input document. Because the contract `$ref`s every shared schema rather than inlining it
(the DoD's requirement), origins are recorded **per schema** and the operations that use each schema
are named alongside — the same traceability as one row per `(operation, field)`, without repeating
an identical row twenty-six times. Operation → schema is the table at the end of this section.

### `Item`, `ItemLatestAdjustment`, `ItemCreate`, `ItemUpdate`

Used by `listItems`, `createItem`, `updateItem`, `deactivateItem`, `reactivateItem`.

| schema_path                            | origin                                                                                                                                     | confidence |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `Item.id`                              | data-model.md → `items.id` (UUID PK, app-generated)                                                                                        | high       |
| `Item.sku`                             | data-model.md → `items.sku` (TEXT, collation `C`, trimmed non-empty)                                                                       | high       |
| `Item.description`                     | data-model.md → `items.description` (TEXT, trimmed non-empty)                                                                              | high       |
| `Item.unitOfMeasure`                   | data-model.md → `items.unit_of_measure` (VARCHAR(32)) → `maxLength: 32`                                                                    | high       |
| `Item.onHandQuantity`                  | data-model.md → `items.on_hand_quantity` (INTEGER, `>= 0`) → `minimum: 0`                                                                  | high       |
| `Item.deactivatedAt`                   | data-model.md → `items.deactivated_at` (timestamptz NULL) → `[string, null]`                                                               | high       |
| `Item.latestAdjustment`                | derived — latest `item_stock_adjustments` row per Item (`idx_item_stock_adjustments_item_created`), required by sad.md §5 `items/usecases` | high       |
| `Item.createdAt`                       | data-model.md → `items.created_at`                                                                                                         | high       |
| `ItemLatestAdjustment.countedQuantity` | data-model.md → `item_stock_adjustments.counted_quantity` (`>= 0`)                                                                         | high       |
| `ItemLatestAdjustment.reason`          | data-model.md → `item_stock_adjustments.reason` (TEXT, trimmed non-empty)                                                                  | high       |
| `ItemLatestAdjustment.adjustedAt`      | data-model.md → `item_stock_adjustments.created_at`                                                                                        | high       |
| `ItemCreate.*`                         | same three columns; state and on-hand are **not** inputs (AC-06, column default `0`)                                                       | high       |
| `ItemUpdate.*`                         | same three columns, all optional (AC-06b, AC-06c)                                                                                          | high       |

### `OnHandAdjustment`, `OnHandAdjustmentCreate`

Used by `adjustItemOnHandQuantity`.

| schema_path                         | origin                                                                    | confidence |
| ----------------------------------- | ------------------------------------------------------------------------- | ---------- |
| `OnHandAdjustment.id`               | data-model.md → `item_stock_adjustments.id`                               | high       |
| `OnHandAdjustment.itemId`           | data-model.md → `item_stock_adjustments.item_id` (composite FK)           | high       |
| `OnHandAdjustment.countedQuantity`  | data-model.md → `item_stock_adjustments.counted_quantity` (`>= 0`, AC-09) | high       |
| `OnHandAdjustment.reason`           | data-model.md → `item_stock_adjustments.reason` (never optional, AC-09a)  | high       |
| `OnHandAdjustment.adjustedByUserId` | data-model.md → `item_stock_adjustments.adjusted_by_user_id`              | high       |
| `OnHandAdjustment.createdAt`        | data-model.md → `item_stock_adjustments.created_at`                       | high       |
| `OnHandAdjustmentCreate.*`          | the two submitted columns; no `updatedAt` — the row is append-only        | high       |

### `CustomerOrder`, `CustomerOrderCreate`, `CustomerOrderAmend`, `CustomerOrderCancellation`

Used by `listCustomerOrders`, `recordCustomerOrder`, `amendCustomerOrder`, `cancelCustomerOrder`.

| schema_path                                    | origin                                                                                        | confidence |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| `CustomerOrder.id`                             | data-model.md → `customer_orders.id`                                                          | high       |
| `CustomerOrder.itemId`                         | data-model.md → `customer_orders.item_id` (composite FK → `items(id, warehouse_id)`)          | high       |
| `CustomerOrder.customerName`                   | data-model.md → `customer_orders.customer_name` (TEXT, collation `C`, trimmed non-empty)      | high       |
| `CustomerOrder.quantity`                       | data-model.md → `customer_orders.quantity` (`> 0`) → `minimum: 1`                             | high       |
| `CustomerOrder.outstandingQuantity`            | data-model.md → `customer_orders.outstanding_quantity` (`>= 0`, `<= quantity`)                | high       |
| `CustomerOrder.neededBy`                       | data-model.md → `customer_orders.needed_by` (DATE) → `format: date`                           | high       |
| `CustomerOrder.state`                          | data-model.md → `customer_orders.state` `IN ('unfulfilled','fulfilled','cancelled')` → `enum` | high       |
| `CustomerOrder.cancellationReason`             | data-model.md → `customer_orders.cancellation_reason` (NULL, trimmed non-empty when present)  | high       |
| `CustomerOrder.recordedByUserId`               | data-model.md → `customer_orders.recorded_by_user_id`                                         | high       |
| `CustomerOrder.cancelledByUserId`              | data-model.md → `customer_orders.cancelled_by_user_id`                                        | high       |
| `CustomerOrder.cancelledAt`                    | data-model.md → `customer_orders.cancelled_at`                                                | high       |
| `CustomerOrder.createdAt` / `.updatedAt`       | data-model.md → `customer_orders.created_at` / `updated_at`                                   | high       |
| `CustomerOrderCreate.*`                        | the four submitted columns; state and outstanding are derived at write (AC-01)                | high       |
| `CustomerOrderAmend.*`                         | `quantity`, `needed_by`; outstanding and state recalculated (AC-19)                           | high       |
| `CustomerOrderCancellation.cancellationReason` | data-model.md → `customer_orders.cancellation_reason` (AC-19a)                                | high       |

### `DemandLine`, `DemandCoverage` — derived, never stored

Used by `readConsolidatedDemand`. `CONTEXT.md` §Invariants forbids storing any of these; sad.md §6.5
fixes the single non-fan-out query they come from.

| schema_path                                                      | origin                                                                                                                                                                                                      | confidence                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `DemandLine.itemId` / `.sku` / `.description` / `.unitOfMeasure` | data-model.md → `items` columns, joined                                                                                                                                                                     | high                       |
| `DemandLine.totalOutstandingQuantity`                            | derived — `SUM(customer_orders.outstanding_quantity)` grouped by Item where `state = 'unfulfilled'` (sad.md §6.5, AC-04)                                                                                    | high                       |
| `DemandLine.earliestNeededBy`                                    | derived — `MIN(customer_orders.needed_by)` over the same group (AC-04)                                                                                                                                      | high                       |
| `DemandLine.onHandQuantity`                                      | data-model.md → `items.on_hand_quantity`, attached per Item (AC-04, AC-08)                                                                                                                                  | high                       |
| `DemandLine.unfulfilledCustomerOrderCount`                       | derived — `COUNT(*)` over the same group. **No acceptance criterion names it**; it exists for the design's expandable sub-rows and for sad.md §5's "the Unfulfilled Customer Orders behind one Demand Line" | **medium** — see Finding 3 |
| `DemandLine.coverage[]`                                          | derived — `purchase_draft_line_links` joined to `purchase_drafts` restricted to open states (AC-20, AC-21a)                                                                                                 | high                       |
| `DemandCoverage.purchaseDraftId`                                 | data-model.md → `purchase_draft_line_links.purchase_draft_id` (denormalized precisely so this join reaches draft state in one hop)                                                                          | high                       |
| `DemandCoverage.purchaseDraftLineId`                             | data-model.md → `purchase_draft_line_links.purchase_draft_line_id`                                                                                                                                          | high                       |
| `DemandCoverage.purchaseDraftState`                              | data-model.md → `purchase_drafts.state`, narrowed to `draft` / `ready_for_ordering` (AC-21a)                                                                                                                | high                       |
| `DemandCoverage.statedQuantity`                                  | data-model.md → `purchase_draft_line_links.stated_quantity` (`> 0`)                                                                                                                                         | high                       |

### `PackagingType`

Used by `listPackagingTypes`.

| schema_path           | origin                                                                                                                                                                       | confidence |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `PackagingType.id`    | data-model.md → `packaging_types.id` (VARCHAR(32), `~ '^[a-z][a-z0-9_]*$'`) — pattern, **not** an enum, so a later migration extends the catalogue without a contract change | high       |
| `PackagingType.label` | data-model.md → `packaging_types.label` (VARCHAR(100)) → `maxLength: 100`                                                                                                    | high       |

### `PurchaseDraftSummary`, `PurchaseDraftDetail`

Used by `listPurchaseDrafts`, `readPurchaseDraft`, `createPurchaseDraft`, `revisePurchaseDraft`,
`discardPurchaseDraft`, every line/link operation, `readyPurchaseDraft`,
`confirmPurchaseDraftArrival`, `closePurchaseDraft`.

| schema_path                                                             | origin                                                                                                                          | confidence |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `PurchaseDraftSummary.id`                                               | data-model.md → `purchase_drafts.id`                                                                                            | high       |
| `PurchaseDraftSummary.state`                                            | data-model.md → `purchase_drafts.state` `IN ('draft','ready_for_ordering','closed','discarded')` → `enum`                       | high       |
| `PurchaseDraftSummary.expectedArrivalDate`                              | data-model.md → `purchase_drafts.expected_arrival_date` (DATE NULL, AC-10)                                                      | high       |
| `PurchaseDraftSummary.lineCount`                                        | derived — `COUNT(*)` over `purchase_draft_lines` for the draft                                                                  | high       |
| `PurchaseDraftSummary.hasDriftSignal`                                   | derived — any `purchase_draft_demand_snapshots` row differing in value from its `customer_orders` row now (sad.md §6.8, AC-16a) | high       |
| `PurchaseDraftSummary.closureReason`                                    | data-model.md → `purchase_drafts.closure_reason` (AC-21)                                                                        | high       |
| `PurchaseDraftSummary.createdByUserId` / `.createdAt`                   | data-model.md → `purchase_drafts.created_by_user_id` / `created_at`                                                             | high       |
| `PurchaseDraftSummary.readiedByUserId` / `.readiedAt`                   | data-model.md → `purchase_drafts.readied_by_user_id` / `readied_at` (AC-14)                                                     | high       |
| `PurchaseDraftSummary.closedByUserId` / `.closedAt`                     | data-model.md → `purchase_drafts.closed_by_user_id` / `closed_at`                                                               | high       |
| `PurchaseDraftSummary.arrivalConfirmedByUserId` / `.arrivalConfirmedAt` | data-model.md → `purchase_drafts.arrival_confirmed_by_user_id` / `arrival_confirmed_at` (AC-17, AC-17b)                         | high       |
| `PurchaseDraftSummary.discardedByUserId` / `.discardedAt`               | data-model.md → `purchase_drafts.discarded_by_user_id` / `discarded_at` (AC-24)                                                 | high       |
| `PurchaseDraftDetail.lines[]`                                           | `allOf` the summary plus `purchase_draft_lines`                                                                                 | high       |

### `PurchaseDraftLine`, `PurchaseDraftLineLink`, `DemandSnapshotEntry`, `LinkedCustomerOrderState`, `ArrivalAllocation`

| schema_path                                                                     | origin                                                                                                                      | confidence |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `PurchaseDraftLine.id`                                                          | data-model.md → `purchase_draft_lines.id`                                                                                   | high       |
| `PurchaseDraftLine.itemId`                                                      | data-model.md → `purchase_draft_lines.item_id` (composite FK, AC-11)                                                        | high       |
| `PurchaseDraftLine.itemSku` / `.itemDescription` / `.unitOfMeasure`             | data-model.md → `items` columns, joined so a line reads without a second request                                            | high       |
| `PurchaseDraftLine.orderedQuantity`                                             | data-model.md → `purchase_draft_lines.ordered_quantity` (`> 0`) → `minimum: 1`                                              | high       |
| `PurchaseDraftLine.packagingTypeId`                                             | data-model.md → `purchase_draft_lines.packaging_type_id` (NULL, FK, AC-12, AC-13)                                           | high       |
| `PurchaseDraftLine.valueAddingNote`                                             | data-model.md → `purchase_draft_lines.value_adding_note` (NULL, trimmed non-empty when present)                             | high       |
| `PurchaseDraftLine.receivedQuantity`                                            | data-model.md → `purchase_draft_lines.received_quantity` (NULL, `>= 0` when present; **unbounded above** by design — AC-17) | high       |
| `PurchaseDraftLineLink.id`                                                      | data-model.md → `purchase_draft_line_links.id`                                                                              | high       |
| `PurchaseDraftLineLink.customerOrderId`                                         | data-model.md → `purchase_draft_line_links.customer_order_id` (composite FK, AC-11)                                         | high       |
| `PurchaseDraftLineLink.customerName`                                            | data-model.md → `customer_orders.customer_name`, joined (AC-17 names the customers the goods cover)                         | high       |
| `PurchaseDraftLineLink.statedQuantity`                                          | data-model.md → `purchase_draft_line_links.stated_quantity` (`> 0`, reconciled with nothing — AC-11a)                       | high       |
| `PurchaseDraftLineLink.snapshot`                                                | data-model.md → `purchase_draft_demand_snapshots` (`null` before the freeze)                                                | high       |
| `PurchaseDraftLineLink.current`                                                 | data-model.md → the linked `customer_orders` row as it stands at this read                                                  | high       |
| `PurchaseDraftLineLink.driftSignals[]`                                          | derived — value comparison of the two above (sad.md §6.8, AC-16); the four kinds are AC-16's four named changes             | high       |
| `PurchaseDraftLineLink.allocation`                                              | data-model.md → `arrival_allocations` (`null` before arrival, and for a link with no demand left — AC-17b)                  | high       |
| `DemandSnapshotEntry.capturedQuantity` / `.capturedNeededBy` / `.capturedState` | data-model.md → `purchase_draft_demand_snapshots.captured_*`                                                                | high       |
| `LinkedCustomerOrderState.*`                                                    | data-model.md → `customer_orders.quantity` / `needed_by` / `state` / `outstanding_quantity`                                 | high       |
| `ArrivalAllocation.allocatedQuantity`                                           | data-model.md → `arrival_allocations.allocated_quantity` (`> 0`) → `minimum: 1`                                             | high       |
| `ArrivalAllocation.allocatedByUserId` / `.createdAt`                            | data-model.md → `arrival_allocations.allocated_by_user_id` / `created_at` (AC-17)                                           | high       |

### Request schemas for the draft flows

| schema_path                                                      | origin                                                                                                                                                                                                                                                                       | confidence |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `PurchaseDraftCreate.*`, `PurchaseDraftRevise.*`                 | `purchase_drafts.expected_arrival_date` + the line/link create schemas                                                                                                                                                                                                       | high       |
| `PurchaseDraftLineCreate.*`, `PurchaseDraftLineUpdate.*`         | the `purchase_draft_lines` columns above                                                                                                                                                                                                                                     | high       |
| `PurchaseDraftLineLinkCreate.*`, `PurchaseDraftLineLinkUpdate.*` | the `purchase_draft_line_links` columns above                                                                                                                                                                                                                                | high       |
| `ArrivalConfirmation.lines[].purchaseDraftLineId`                | data-model.md → `purchase_draft_lines.id`                                                                                                                                                                                                                                    | high       |
| `ArrivalConfirmation.lines[].receivedQuantity`                   | data-model.md → `purchase_draft_lines.received_quantity` (`>= 0`, AC-17b)                                                                                                                                                                                                    | high       |
| `ArrivalAllocationCreate.purchaseDraftLineLinkId`                | data-model.md → `arrival_allocations.purchase_draft_line_link_id` (**PK**) — the Allocation is addressed _through the link_, which is what makes AC-18's "names a Customer Order its line is actually linked to" provable by the composite FK rather than re-checked in code | high       |
| `ArrivalAllocationCreate.allocatedQuantity`                      | data-model.md → `arrival_allocations.allocated_quantity` (`> 0`)                                                                                                                                                                                                             | high       |
| `PurchaseDraftClosure.closureReason`                             | data-model.md → `purchase_drafts.closure_reason` (AC-21)                                                                                                                                                                                                                     | high       |

### Operation → user story → acceptance criteria → Permission

| Operation                                                                               | US           | AC                                          | Permission                | Class    |
| --------------------------------------------------------------------------------------- | ------------ | ------------------------------------------- | ------------------------- | -------- |
| `listItems`                                                                             | US-03        | AC-06a, AC-06d                              | `ITEMS:WATCH`             | read     |
| `createItem`                                                                            | US-03        | AC-06, AC-07, AC-07a                        | `ITEMS:CREATE`            | mutating |
| `updateItem`                                                                            | US-03        | AC-06b, AC-06c                              | `ITEMS:UPDATE`            | mutating |
| `deactivateItem` / `reactivateItem`                                                     | US-13        | AC-06d                                      | `ITEMS:DEACTIVATE`        | mutating |
| `adjustItemOnHandQuantity`                                                              | US-04        | AC-08, AC-09, AC-09a, AC-18a                | `ITEM_STOCK:ADJUST`       | mutating |
| `readConsolidatedDemand`                                                                | US-02, US-11 | AC-04, AC-05, AC-17a, AC-20, AC-21a         | `CUSTOMER_ORDERS:WATCH`   | read     |
| `listCustomerOrders`                                                                    | US-02, US-05 | AC-04, AC-17a                               | `CUSTOMER_ORDERS:WATCH`   | read     |
| `recordCustomerOrder`                                                                   | US-01        | AC-01, AC-02, AC-02a, AC-03                 | `CUSTOMER_ORDERS:CREATE`  | mutating |
| `amendCustomerOrder`                                                                    | US-10        | AC-19, AC-19b                               | `CUSTOMER_ORDERS:UPDATE`  | mutating |
| `cancelCustomerOrder`                                                                   | US-10        | AC-19a                                      | `CUSTOMER_ORDERS:CANCEL`  | mutating |
| `listPackagingTypes`                                                                    | US-06        | AC-12, AC-13                                | `PURCHASE_DRAFTS:WATCH`   | read     |
| `listPurchaseDrafts`                                                                    | US-08        | AC-16a, AC-22                               | `PURCHASE_DRAFTS:WATCH`   | read     |
| `readPurchaseDraft`                                                                     | US-08        | AC-16, AC-21                                | `PURCHASE_DRAFTS:WATCH`   | read     |
| `createPurchaseDraft`                                                                   | US-05        | AC-10, AC-11, AC-11a, AC-22                 | `PURCHASE_DRAFTS:CREATE`  | mutating |
| `revisePurchaseDraft`                                                                   | US-05        | AC-10a, AC-15                               | `PURCHASE_DRAFTS:UPDATE`  | mutating |
| `addPurchaseDraftLine` / `revisePurchaseDraftLine` / `removePurchaseDraftLine`          | US-05, US-06 | AC-10a, AC-12, AC-13, AC-15                 | `PURCHASE_DRAFTS:UPDATE`  | mutating |
| `linkPurchaseDraftLine` / `requantifyPurchaseDraftLineLink` / `unlinkPurchaseDraftLine` | US-05        | AC-10a, AC-11, AC-11a, AC-15                | `PURCHASE_DRAFTS:UPDATE`  | mutating |
| `readyPurchaseDraft`                                                                    | US-07        | AC-14, AC-14a, AC-15, AC-22                 | `PURCHASE_DRAFTS:READY`   | mutating |
| `confirmPurchaseDraftArrival`                                                           | US-09        | AC-17, AC-17a, AC-17b, AC-18, AC-18a, AC-22 | `PURCHASE_DRAFTS:RECEIVE` | mutating |
| `closePurchaseDraft`                                                                    | US-12        | AC-21, AC-21a                               | `PURCHASE_DRAFTS:CLOSE`   | mutating |
| `discardPurchaseDraft`                                                                  | US-14        | AC-24, AC-24a                               | `PURCHASE_DRAFTS:DISCARD` | mutating |

Every one of the sixteen Permissions in `spec.md` §6.1 is exercised by at least one operation, and
every operation declares exactly one. AC-23 applies to all of them: the eight read operations are
archived-tolerant, the eighteen mutating ones are refused while the Warehouse is archived.

---

## Section B — drift findings

### 1. Endpoint ↔ data-model — ✓ (core)

Every operation reads or writes at least one relation in `data-model.md`.

| Relation                          | Read by                                                             | Written by                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`                           | `listItems`, `readConsolidatedDemand`, `readPurchaseDraft`          | `createItem`, `updateItem`, `deactivateItem`, `reactivateItem`, `adjustItemOnHandQuantity`                                                      |
| `item_stock_adjustments`          | `listItems`                                                         | `adjustItemOnHandQuantity`                                                                                                                      |
| `customer_orders`                 | `listCustomerOrders`, `readConsolidatedDemand`, `readPurchaseDraft` | `recordCustomerOrder`, `amendCustomerOrder`, `cancelCustomerOrder`, `confirmPurchaseDraftArrival`                                               |
| `packaging_types`                 | `listPackagingTypes`                                                | none — seeded by migration only (CONTEXT.md §Invariants)                                                                                        |
| `purchase_drafts`                 | `listPurchaseDrafts`, `readPurchaseDraft`, `readConsolidatedDemand` | `createPurchaseDraft`, `revisePurchaseDraft`, `readyPurchaseDraft`, `confirmPurchaseDraftArrival`, `closePurchaseDraft`, `discardPurchaseDraft` |
| `purchase_draft_lines`            | `readPurchaseDraft`, `listPurchaseDrafts`                           | the three line operations, `confirmPurchaseDraftArrival`                                                                                        |
| `purchase_draft_line_links`       | `readPurchaseDraft`, `readConsolidatedDemand`                       | the three link operations, `createPurchaseDraft`, `addPurchaseDraftLine`                                                                        |
| `purchase_draft_demand_snapshots` | `readPurchaseDraft`, `listPurchaseDrafts`                           | `readyPurchaseDraft` only — written once, never updated                                                                                         |
| `arrival_allocations`             | `readPurchaseDraft`, `amendCustomerOrder` (the locked AC-19b total) | `confirmPurchaseDraftArrival` only                                                                                                              |

No relation is unreachable, and no operation touches a relation the model does not define. The
write column is deliberately narrow where the model requires it: `purchase_draft_demand_snapshots`
and `arrival_allocations` each have exactly one writer, which is the schema-level expression of
"the snapshot is frozen with the draft" and "arrival happens once".

`packaging_types` is read-only through the API by design, not by omission — the catalogue is
system-managed and extended only through migrations. That is the "field in the model with no
mutating story" case in the conflict table, and it is **accepted as is** with its authority named.

### 2. Error code ↔ repo error definition — ✓ with a recorded pending addition (core)

The repository's error definitions live in `packages/shared-types/src/enums/error-code.ts` as a
`const` object of `module.error_name` strings, mapped to HTTP status by
`apps/server/src/shared/errors/global-http-exception.filter.ts`. That is the form checked against.

**Already defined and reused unchanged** — 3 codes: `access.denied` (403),
`access.membership_required` (403), `access.warehouse_archived` (409), plus `system.internal_error`
(500). `request.invalid` is emitted as a literal by the global filter for schema-validation and
unauthenticated failures and carries no `ErrorCode` member today; the contract reuses it exactly as
the shipped `workspaces` contract does, and proposes no change to it.

**Proposed by this feature** — 22 codes namespaced `items.*`, `customer_orders.*` and
`purchase_drafts.*`. These are **not inventions**: `sad.md` §5 assigns "stable `ErrorCode` members
namespaced `items.*`, `customer_orders.*` and `purchase_drafts.*`" to `packages/shared-types` as part
of this feature's scope, and `sad.md` §7 enumerates the fifteen failure classes the contract must
cover. Each proposed code below names the §7 class it satisfies.

| Proposed code                               | HTTP | sad.md §7 failure class               | AC            |
| ------------------------------------------- | ---- | ------------------------------------- | ------------- |
| `items.invalid_input`                       | 400  | validation                            | AC-06         |
| `items.invalid_on_hand_quantity`            | 400  | validation                            | AC-09         |
| `items.adjustment_reason_required`          | 400  | validation                            | AC-09a        |
| `items.target_unavailable`                  | 404  | unavailable or cross-Warehouse target | AC-03, AC-06d |
| `items.sku_taken`                           | 409  | a taken SKU                           | AC-07         |
| `items.sku_fixed`                           | 409  | a fixed SKU                           | AC-06c        |
| `customer_orders.invalid_input`             | 400  | validation                            | AC-02, AC-19a |
| `customer_orders.needed_by_in_past`         | 400  | a past needed-by date                 | AC-02a, AC-19 |
| `customer_orders.target_unavailable`        | 404  | unavailable or cross-Warehouse target | AC-11         |
| `customer_orders.quantity_below_allocated`  | 409  | a quantity below what is allocated    | AC-19b        |
| `customer_orders.invalid_state`             | 409  | (state guard on the demand side)      | AC-19         |
| `purchase_drafts.invalid_input`             | 400  | validation                            | AC-10         |
| `purchase_drafts.unknown_packaging_type`    | 400  | an unknown Packaging Type             | AC-13         |
| `purchase_drafts.target_unavailable`        | 404  | unavailable or cross-Warehouse target | AC-11         |
| `purchase_drafts.draft_frozen`              | 409  | a frozen draft                        | AC-15         |
| `purchase_drafts.draft_empty`               | 409  | an empty draft                        | AC-14a        |
| `purchase_drafts.discard_unavailable`       | 409  | a discard after ready                 | AC-24a        |
| `purchase_drafts.arrival_already_confirmed` | 409  | a second confirmation                 | AC-17b        |
| `purchase_drafts.allocation_out_of_bounds`  | 409  | a failing assignment bound            | AC-18         |
| `purchase_drafts.concurrent_change`         | 409  | a concurrent transition               | sad.md §8     |
| `purchase_drafts.invalid_state`             | 409  | a concurrent transition (guard)       | sad.md §8     |
| `purchase_drafts.link_exists`               | 409  | (schema `UNIQUE (line, order)`)       | AC-11a        |

Status mapping follows the filter's existing classes exactly: validation → 400, non-enumerating
missing target → 404, invariant or state conflict → 409 — the same shape
`access.role_name_conflict` and `workspace.concurrent_change` already use.

**One code is outside all three declared namespaces — see Finding 1.**

### 3. Validation ↔ constraint — ✓ with one gap (core)

Every bounded value in the contract carries the model's constraint, not an invented one:

- `VARCHAR(32)` → `maxLength: 32` (`unitOfMeasure`, `PackagingTypeId`); `VARCHAR(100)` →
  `maxLength: 100` (`PackagingType.label`).
- `> 0` → `minimum: 1` (`quantity`, `orderedQuantity`, `statedQuantity`, `allocatedQuantity`,
  `capturedQuantity`); `>= 0` → `minimum: 0` (`onHandQuantity`, `outstandingQuantity`,
  `countedQuantity`, `receivedQuantity`).
- `IN (…)` → `enum` (`CustomerOrderState`, `PurchaseDraftState`); `~ '^[a-z][a-z0-9_]*$'` →
  `pattern`, deliberately **not** an enum, mirroring the model's stated reason.
- `DATE` → `format: date`; `timestamptz` → `format: date-time`; every `NULL` column →
  `type: [x, "null"]` (3.1 style), never `nullable: true`.
- Constraints the model **deliberately does not express** are not expressed here either:
  `statedQuantity` is reconciled with nothing (AC-11a), `receivedQuantity` is unbounded above
  (AC-17), and the AC-19b floor is documented as a locked-row check rather than a schema bound, so
  nothing in the contract invites a client to clamp it.

**Gap: the free-text columns carry no upper bound — see Finding 2.**

### 4. OpenAPI ↔ sequence — ✓ (supporting)

Matched on flows and `alt`-branches rather than on the generic participant names, as the reference
requires. Every branch of every §6 diagram resolves to a response:

| sad.md §6 flow             | `alt` branch                                                                      | Contract response                                                                   |
| -------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| §6.1 authorization spine   | unauthenticated                                                                   | `401 Unauthenticated`                                                               |
| §6.1                       | membership / Role / Permission missing                                            | `403 WarehouseDenied`                                                               |
| §6.1                       | no Warehouse named, or two that disagree                                          | no route matches — refused before resolution; documented on `WarehouseIdPath`       |
| §6.1                       | archived + no read tolerance                                                      | `409 WarehouseArchived`                                                             |
| §6.2 Item catalogue        | SKU already taken in this Warehouse                                               | `409 ItemWriteConflict` → `items.sku_taken`                                         |
| §6.2                       | SKU changed while the Item is named                                               | `409 ItemWriteConflict` → `items.sku_fixed`                                         |
| §6.3 On-hand adjustment    | negative or non-whole figure                                                      | `400` → `items.invalid_on_hand_quantity`                                            |
| §6.3                       | reason missing                                                                    | `400` → `items.adjustment_reason_required`                                          |
| §6.4 record demand         | quantity or customer name invalid                                                 | `400` → `customer_orders.invalid_input`                                             |
| §6.4                       | needed-by date already past                                                       | `400` → `customer_orders.needed_by_in_past`                                         |
| §6.4                       | Item of another Warehouse, or none                                                | `404 ItemUnavailable`                                                               |
| §6.5 consolidated demand   | (no error branch — read)                                                          | 200 only, plus the spine's 401/403                                                  |
| §6.6 assemble / revise     | Item or Customer Order of another Warehouse                                       | `404 PurchaseDraftTargetUnavailable`                                                |
| §6.6                       | Packaging Type outside the catalogue                                              | `400` → `purchase_drafts.unknown_packaging_type`                                    |
| §6.6                       | draft no longer resolves in the `draft` state                                     | `409` → `purchase_drafts.draft_frozen`                                              |
| §6.7 freeze                | draft holds no line                                                               | `409` → `purchase_drafts.draft_empty`                                               |
| §6.7                       | a concurrent attempt already moved it                                             | `409` → `purchase_drafts.concurrent_change`                                         |
| §6.8 read drafts and drift | (no error branch — read)                                                          | 200 only, plus the spine's 401/403                                                  |
| §6.9 arrival               | draft not in Ready for Ordering                                                   | `409` → `purchase_drafts.arrival_already_confirmed`                                 |
| §6.9                       | assignments exceed received / outstanding, or name a cancelled or Fulfilled order | `409` → `purchase_drafts.allocation_out_of_bounds`, each failing bound in `details` |
| §6.10 amend / cancel       | quantity below what is already allocated                                          | `409` → `customer_orders.quantity_below_allocated`                                  |
| §6.10                      | needed-by date already past                                                       | `400` → `customer_orders.needed_by_in_past`                                         |
| §6.11 close / discard      | discarding a draft that has been made ready                                       | `409` → `purchase_drafts.discard_unavailable`                                       |
| §6.12 web destinations     | (client-side; no server response)                                                 | n/a                                                                                 |

No orphan sequence, and no error response in the contract lacks a §6 branch or an AC behind it.

### Back-feed — coverage cross-check

- **Every `spec.md` §5 acceptance criterion maps to ≥1 operation or response.** All **42 of 42** are
  cited in the contract, verified mechanically against the `### AC-…` headings in `spec.md`.
- **Every operation maps to a §4 user story and ≥1 AC.** All 26, in the table in Section A. All 14
  user stories are covered.
- **Every §6 `alt`-branch has a response.** Table above; no sequence gap was found, so no
  Save-as-OQ with an upstream owner was needed for a missing branch or a missing AC.

---

## Findings requiring your decision

Three flags. None is a core-point failure; the contract is written and internally consistent with
all three left as they are, but each is a real question about a source rather than about the
contract.

### Finding 1 — `request.rate_limited` falls outside the three declared namespaces

`spec.md` §6.1 requires the limit, and ADR 0003 puts enforcement in `shared/guards/
WriteRateLimitGuard`, composed after the access guards. `sad.md` §5 assigns this feature's new
`ErrorCode` members to `items.*`, `customer_orders.*` and `purchase_drafts.*` — none of which fits a
refusal raised by a shared guard that no feature module owns.

The contract proposes `request.rate_limited` at 429, siblinged to the global filter's existing
non-module `request.invalid` literal. That is a consistent choice, but it is **the contract naming a
code the SAD did not plan**, and ADR 0003 itself says the guard must be promoted to `docs/system`
the moment a second feature declares `@WriteRateLimited()`.

**Owner:** Backend Lead (the `sad.md` §5 building-block table). **Due:** before the contract is
finalized.

### Finding 2 — seven free-text columns carry no upper bound

`data-model.md` types `items.sku`, `items.description`, `customer_orders.customer_name`,
`item_stock_adjustments.reason`, `purchase_draft_lines.value_adding_note`,
`customer_orders.cancellation_reason` and `purchase_drafts.closure_reason` as `TEXT` with "trimmed
non-empty" and no length constraint. The contract therefore carries `minLength: 1` and **no
`maxLength`** — inventing one would be a fabricated constraint, which this skill's anti-patterns
forbid.

Two reasons this is worth a decision rather than acceptance:

- The repository's own precedent bounds member-typed names: the shipped `workspaces` contract
  constrains Workspace Role and Warehouse names to 100 user-perceived characters, and refuses
  control or format characters. Nothing bounds these seven.
- `spec.md` §6.1 names "draft and demand spam" as an abuse case and mitigates it with a request-rate
  limit. A rate limit bounds how _often_ a member writes, not how _large_ each write is; sixty
  megabyte-long Value-adding Notes a minute pass every check the contract and the schema currently
  express.

This is an upstream question — the bound belongs in `data-model.md` as a `CHECK`, then flows into
the contract — so it routes to `data-model ordering`, not to a contract edit.

**Owner:** Backend Lead (`data-model`). **Due:** before the contract is finalized.

### Finding 3 — `DemandLine.unfulfilledCustomerOrderCount` has no acceptance criterion

The only **medium**-confidence field in the contract. AC-04 fixes what a Demand Line shows: total
Outstanding Quantity, earliest needed-by date, On-hand Quantity. AC-20 adds Coverage. Neither names
a count of the Customer Orders behind the line. The field exists because `sad.md` §5 lists "the
Unfulfilled Customer Orders behind one Demand Line" as a separate query and the approved design
renders them as expandable sub-rows — so the count is what tells the web whether a row expands and
into how many.

The options are to keep it (a derived convenience with no cost, since the aggregation already groups
those rows), to drop it and let the web infer expandability from a second request, or to add an AC
covering it. Keeping it is the recommendation; the flag exists so the decision is recorded rather
than absorbed.

**Owner:** PM (`specify`, for an AC) or Frontend Lead (to confirm the web needs it). **Due:** before
`tasks`.

---

## Recorded deviations from the skill's defaults

Each is source-backed, not a preference.

| Default                              | This contract                                                              | Authority                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cursor pagination on every list      | **No pagination.** Lists are returned whole and deterministically ordered. | `sad.md` §3 puts paging explicitly out of scope; `spec.md` §1 fixes the scale (~2 000 Items, 5 000 Unfulfilled Customer Orders, 250 open drafts per Warehouse) and §6 sets a 400 ms p95 on the whole demand read. `sad.md` §6.5 states "the Demand Lines whole, nothing paged at this scale". Outgrowing that scale is the stated trigger to revisit `sad.md` §6. The shipped `workspaces` contract already returns catalogues and small collections as bare arrays, so this is the repository's existing shape, not a new one. |
| `BearerAuth` global                  | **`SessionCookie`** (`warehouser_session`, `apiKey` in cookie).            | The repository ships session-cookie authentication; the `auth`, `access`, `users-management` and `workspaces` contracts all declare it. No public endpoint exists here, so no operation overrides with `security: []`.                                                                                                                                                                                                                                                                                                          |
| snake_case JSON fields               | **camelCase.**                                                             | House style across all four shipped contracts. Column names stay snake_case and are the origin recorded in Section A.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `{code, message, details?}` envelope | unchanged                                                                  | Matches the global filter's `SafeErrorEnvelope` exactly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| URL versioning `/api/v1/...`         | unchanged                                                                  | Every route sits under `/api/v1/warehouses/{warehouseId}/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Two derivations also worth naming, since neither appears verbatim in the `sad.md` §7 route table:

- **`GET /items?active=true`** serves `sad.md` §5's second Items query ("list active Items for a
  picker", AC-06a) from §7's single declared `GET /items` path, rather than adding a route the SAD
  did not name.
- **`GET /customer-orders?itemId=&state=`** likewise serves §5's "the Unfulfilled Customer Orders
  behind one Demand Line" and "the linkable Customer Orders a draft line may name" from §7's single
  declared `GET /customer-orders`.

---

## Structural self-check

| Check                                                | Result                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Document parses as YAML, `openapi: 3.1.0`            | ✓                                                                                                 |
| Paths / operations / tags                            | 18 / 26 / 3                                                                                       |
| Duplicate `operationId`                              | none                                                                                              |
| Duplicate method-and-path pair                       | none — `tests/refactor/route-table.spec.mjs` stays green                                          |
| Dangling `$ref`                                      | none                                                                                              |
| Unreferenced component (schema, response, parameter) | none                                                                                              |
| Shared types inlined instead of `$ref`               | none                                                                                              |
| `nullable: true` (3.0 style)                         | none — every nullable is `type: [x, "null"]`                                                      |
| Every operation has request and/or response examples | ✓                                                                                                 |
| Real PII in any example                              | none — placeholder names (`Test Customer North`) and `00000000-0000-4000-8000-…` identifiers only |
| `spec.md` §5 AC coverage                             | 42 / 42                                                                                           |
| `spec.md` §4 user-story coverage                     | 14 / 14                                                                                           |
| `spec.md` §6.1 Permission coverage                   | 16 / 16, one per operation                                                                        |
| `sad.md` §6 `alt`-branch coverage                    | every branch resolves to a response                                                               |
| `events.md`                                          | correctly absent — the feature has no async flow                                                  |

Not yet run: `spectral lint`. No Spectral ruleset is wired into this repository's check target; the
structural checks above were run instead. Wiring one is proposed in the handoff.
