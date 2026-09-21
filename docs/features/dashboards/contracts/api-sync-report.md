---
status: Draft
owner: 'Backend Lead'
reviewers: ['Tech Lead', 'Frontend Lead', 'Security Lead']
updated_at: '2026-09-21'
feature_size: 'L'
---

# API sync report — dashboards

The contract at [`openapi.yaml`](./openapi.yaml) is **derived**, not written: its typed fields and
constraints come from [`data-model.md`](../data-model.md), its error responses from the
[`sad.md`](../sad.md) §6 sequence `alt`-branches, and its endpoint list and outcomes from
[`spec.md`](../spec.md) §4/§5. This report is the evidence of that derivation and of the
bidirectional check run over it.

**Interface kind.** `sad.md` frontmatter declares `target_surfaces: ['web-frontend',
'backend-service']`, read here rather than re-derived. `backend-service` selects the REST/OpenAPI
boundary `docs/system` already establishes; `web-frontend` consumes it and produces no contract of
its own. **No `events.md` is written**, and that absence is a conclusion rather than an omission —
see [§ Async](#async-nothing-to-contract).

**Size.** `.size` reads `L`, `.route` reads `full`: full surface, every operation, every schema
`$ref`-ed.

**Gate.** `data-model.md` is present and was read in full — no fast-lane skip, no inferred schema.

---

## Section A — field origins

One row per `(operation, field)` pair. `high` means the field maps to a column `data-model.md`
records, with a matching type or constraint.

### Shared — parameters, security and the envelope

| schema_path            | origin                                                                                     | confidence |
| ---------------------- | ------------------------------------------------------------------------------------------ | ---------- |
| `*.warehouseId` (path) | `sad.md` §7 route table; `workspaces` ADR 0001 — the only thing authority is resolved from | high       |
| `SessionCookie`        | `apps/server/src/auth/rest/auth-cookie.ts` `AUTH_SESSION_COOKIE = 'warehouser_session'`    | high       |
| `Error.code`           | `packages/shared-types/src/enums/error-code.ts`; `request.invalid` from the global filter  | high       |
| `Error.message`        | `shared/errors/global-http-exception.filter.ts` — fixed per code, never assembled          | high       |
| `Error.details`        | envelope convention; populated by no operation in this document (no request body anywhere) | high       |

### `readWarehouseCoverageGap`

| schema_path                                  | origin                                                                                                              | confidence |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| `rows[].itemId`                              | `data-model.md` ER → `ITEMS.id` (uuid PK)                                                                           | high       |
| `rows[].sku`                                 | `data-model.md` ER → `ITEMS.sku`; `ItemEntity.sku` TEXT; `itemsProjections.sku` `min(1)`                            | high       |
| `rows[].totalOutstandingQuantity`            | `data-model.md` § read model → `customer_orders.outstanding_quantity`, `state='unfulfilled'`                        | high       |
| `rows[].onHandQuantity`                      | `data-model.md` ER → `ITEMS.on_hand_quantity`; `CHECK on_hand_quantity >= 0` (ordering mig.)                        | high       |
| `rows[].inboundQuantity`                     | `data-model.md` § read model → `purchase_draft_lines.ordered_quantity`, open draft states                           | high       |
| `rows[].uncoveredQuantity`                   | `sad.md` §6.3 → `GREATEST(outstanding − on_hand − inbound, 0)`; AC-05                                               | high       |
| `remainder.itemCount`                        | `spec.md` AC-03 "states how many Items it holds"; `CONTEXT.md` "Remainder Row"                                      | high       |
| `remainder.{total,onHand,inbound,uncovered}` | `design-handoff.md` § Panel specs + `previews/warehouse-desktop-v1.html` — the row draws the same three-segment bar | medium     |

### `readWarehouseArrivalTiming`

| schema_path                                                       | origin                                                                                                                                                                   | confidence |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `timezone`                                                        | `data-model.md` § Time — `APP_TIMEZONE`, IANA, bound parameter; `spec.md` §8 "stated wherever a week is labelled"                                                        | medium     |
| `buckets[].kind`                                                  | `spec.md` AC-07 — one Overdue bucket then eight weeks                                                                                                                    | high       |
| `buckets[].weekStart`                                             | `data-model.md` § Time — `date_trunc('week', …)`, ISO-8601 Monday                                                                                                        | high       |
| `buckets[].owedQuantity`                                          | `data-model.md` § read model → `customer_orders.outstanding_quantity` bucketed by `needed_by`                                                                            | high       |
| `buckets[].expectedQuantity`                                      | `data-model.md` § read model → `purchase_draft_lines.ordered_quantity`, draft `ready_for_ordering`, `delivery_mode='via_warehouse'`, bucketed by `expected_arrival_date` | high       |
| `exclusions.beyondHorizon.owedQuantity`                           | `spec.md` AC-07                                                                                                                                                          | high       |
| `exclusions.beyondHorizon.customerOrderCount`                     | `spec.md` AC-07 "how many Customer Orders it covers"                                                                                                                     | high       |
| `exclusions.undatedReadyDrafts.{draftCount,orderedQuantity}`      | `spec.md` AC-08a "how many drafts and what quantity it covers"                                                                                                           | high       |
| `exclusions.datedDraftsStillInDraft.{draftCount,orderedQuantity}` | `spec.md` AC-08a, same sentence                                                                                                                                          | high       |
| `exclusions.draftsSinceClosedOrDiscarded.draftCount`              | `spec.md` AC-07; `sad.md` §6.4 fourth exclusion; `design-handoff.md` footnote — count only                                                                               | medium     |

### `readWarehousePurchasingPipeline`

| schema_path                   | origin                                                                                           | confidence |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ---------- |
| `states[].state`              | `data-model.md` § read model → `purchase_drafts.state IN ('draft','ready_for_ordering')` (AC-11) | high       |
| `states[].bands[].ageBand`    | `CONTEXT.md` "Age Band" — four spans; derived from `created_at` / `readied_at` (AC-10)           | high       |
| `states[].bands[].draftCount` | `data-model.md` § read model → `COUNT(purchase_drafts)` "counts of drafts, never quantities"     | high       |

### `readWarehouseReasonConcentration`

| schema_path                                              | origin                                                                                                                                                                           | confidence |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `totalRefusedQuantity`                                   | `data-model.md` § read model → `SUM(purchase_draft_line_rejections.quantity)` under the Warehouse                                                                                | high       |
| `rows[].rejectionReasonId`                               | `data-model.md` ER → `PURCHASE_DRAFT_LINE_REJECTIONS.rejection_reason_id`; `rejectionReasonIdSchema`                                                                             | high       |
| `rows[].label`                                           | `rejection_reasons.label` VARCHAR(100) — the relation is in `data-model.md` § "Relations read", but the column is **absent from § The read model's column list** → **Finding 1** | medium     |
| `rows[].refusedQuantity`                                 | `data-model.md` § read model → `quantity`, grouped by `rejection_reason_id`                                                                                                      | high       |
| `rows[].sharePercent`                                    | `CONTEXT.md` "Reason Concentration" — "each Reason's share"                                                                                                                      | high       |
| `rows[].cumulativeSharePercent`                          | `sad.md` §6.5 — "the running share as a window over that order"; `design-handoff.md` `Cum.` column                                                                               | high       |
| `rows[].undecidedQuantity`                               | `data-model.md` § read model → `disposition` (AC-12)                                                                                                                             | high       |
| `rows[].customerReportedQuantity`                        | `data-model.md` § `purchase_draft_line_rejections` → `delivery_mode`, equivalent to `source` by `chk_…_source_matches_mode`                                                      | high       |
| `remainder.reasonCount`                                  | `spec.md` AC-12 "states how many Reasons it holds"                                                                                                                               | high       |
| `remainder.{refused,undecided,customerReported}Quantity` | `sad.md` §6.5 "Reasons beyond the tenth roll into one Remainder Row"; the design draws it as a bar                                                                               | medium     |

### `readWorkspaceDemandPressure`

| schema_path                                    | origin                                                                                          | confidence |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| `archivedWarehouseCount`                       | `data-model.md` § Workspace surface — "reports the archived count as a field of its own"        | high       |
| `warehouses[].warehouseId`                     | `data-model.md` ER → `WAREHOUSES.id`                                                            | high       |
| `warehouses[].warehouseName`                   | `data-model.md` ER → `WAREHOUSES.name` TEXT; `workspacesProjections` `min(1).max(100)`          | high       |
| `warehouses[].{overdue,dueSoon,later}Quantity` | `CONTEXT.md` "Urgency Band"; `data-model.md` § read model → `outstanding_quantity`, `needed_by` | high       |
| `warehouses[].totalOutstandingQuantity`        | the three bands summed; `design-handoff.md` prints it as its own column                         | high       |

### `readWorkspaceOrderFlow`

| schema_path                    | origin                                                                                                | confidence |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------- |
| `timezone`                     | `data-model.md` § Time — `date_trunc('week', created_at AT TIME ZONE $tz)`; `spec.md` §8              | medium     |
| `archivedWarehouseCount`       | `data-model.md` § Workspace surface                                                                   | high       |
| `weeks[].weekStart`            | `data-model.md` § read model → `customer_orders.created_at`, truncated to the ISO week                | high       |
| `weeks[].recordedQuantity`     | `data-model.md` § read model → `customer_orders.quantity`, **every** state (AC-16, AC-17a)            | high       |
| `weeks[].assignedQuantity`     | `data-model.md` ER → `ARRIVAL_ALLOCATIONS.allocated_quantity`, own CTE keyed by `customer_order_id`   | high       |
| `weeks[].cancelledQuantity`    | `data-model.md` § read model — the cancelled order's retained `outstanding_quantity`, stated outright | high       |
| `weeks[].stillAwaitedQuantity` | `recorded − assigned − cancelled`; `design-handoff.md` stacks three segments against the week's whole | medium     |

### `readWorkspacePurchasingSpread`

| schema_path                         | origin                                                                                                                       | confidence |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `archivedWarehouseCount`            | `data-model.md` § Workspace surface                                                                                          | high       |
| `warehouses[].warehouseId` / `Name` | `data-model.md` ER → `WAREHOUSES.id`, `.name`                                                                                | high       |
| `warehouses[].counts[].state`       | `data-model.md` § read model → `purchase_drafts.state`, "none — the one Panel counting `closed` and `discarded` too" (AC-18) | high       |
| `warehouses[].counts[].draftCount`  | `data-model.md` § read model → count per `(warehouse_id, state)`                                                             | high       |

### `readWorkspaceReceiptReliability`

| schema_path                                    | origin                                                                                              | confidence |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| `archivedWarehouseCount`                       | `data-model.md` § Workspace surface                                                                 | high       |
| `warehouses[].warehouseId` / `Name`            | `data-model.md` ER → `WAREHOUSES.id`, `.name`                                                       | high       |
| `warehouses[].onTimeArrivalRatePercent`        | `data-model.md` § read model → `ending_recorded_at` vs `expected_arrival_date`, `delivery_mode`     | high       |
| `warehouses[].conformanceRatePercent`          | `data-model.md` § read model → `pre_receipt_conformance`; **not** Delivery-Mode restricted          | high       |
| `warehouses[].receivedQuantity`                | `sad.md` §6 flags — `SUM(ending_quantity)` over Via Warehouse lines whose ending recorded something | high       |
| `exclusions.undatedLineCount`                  | `spec.md` AC-20; `purchase_drafts.expected_arrival_date IS NULL`                                    | high       |
| `exclusions.noEndingRecordedLineCount`         | `spec.md` AC-20b; `purchase_draft_lines.ending_recorded_at IS NULL`                                 | high       |
| `exclusions.nothingReceivedLineCount`          | `spec.md` AC-20b; `ending_quantity = 0`                                                             | high       |
| `exclusions.directToCustomerLineCount`         | `spec.md` AC-20b; `delivery_mode = 'direct_to_customer'`                                            | high       |
| `exclusions.unrecordedConformanceLineCount`    | `spec.md` AC-20; `pre_receipt_conformance IS NULL`                                                  | high       |
| `exclusions.notApplicableConformanceLineCount` | `spec.md` AC-20; `pre_receipt_conformance = 'not_applicable'`                                       | high       |

**No `low` row, and no invented field.** Every `medium` row traces to an approved artifact — the
design handoff and its committed previews, or a stated ruling in `sad.md`/`data-model.md` — rather
than to a column that does not exist. The three `medium` clusters are: figures the Remainder Rows
must carry because the design draws them as bars, the `timezone` disclosure `spec.md` §8 requires,
and `stillAwaitedQuantity`, which is arithmetic over three fields already in the response.

---

## Section B — drift findings

### Forward — is the contract derived correctly?

| #   | Point                             | Verdict | Diagnostic                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Endpoint ↔ data-model _(core)_    | ✓       | All eight read relations `data-model.md` records. Four read the Warehouse set (`customer_orders`, `items`, `purchase_drafts`, `purchase_draft_lines`, `purchase_draft_line_rejections`); four read the active-Warehouse scope plus `arrival_allocations`. None writes.                                                                                                                                                                                               |
| 2   | Error code ↔ repo _(core)_        | ✓       | `access.denied` = `ErrorCode.ACCESS_DENIED`, `workspace.denied` = `ErrorCode.WORKSPACE_DENIED`, `system.internal_error` = `ErrorCode.INTERNAL_ERROR`. `request.invalid` is the global filter's `httpExceptionMapping` literal, not an enum entry — the same shape `arrival-inspection` documents. **This feature adds no code.**                                                                                                                                     |
| 3   | Validation ↔ constraint _(core)_  | ✗ (1)   | Every bound matches its column — `rejection_reasons.label` VARCHAR(100), `warehouses.name` `min(1).max(100)`, `items.on_hand_quantity >= 0`, `rejectionReasonId` `max(32)` + pattern, the four state and band enums. The one exception is **Finding 1**: `label` is bounded correctly but is not in the read model's column list — resolved _fix the source first_, so this point stays ✗ until `data-model.md` is amended.                                          |
| 4   | OpenAPI ↔ sequence _(supporting)_ | ✓       | Every `alt`-branch of §6.2 (unauthenticated / required Permission absent / conjunction fails / admitted), §6.5a and §6.6 (Permission absent / held) has a response. §6.3, §6.4, §6.5 and §6.6's compute notes are internal to four operations already present. §6.1 is the client loader and issues no server branch this contract owns. §6.7's single write belongs to `workspaces`' shipped Role Editor — see [§ Orphan sequence](#orphan-sequence-67-deliberate). |

### Back-feed — coverage cross-check

**Every `spec.md` §5 AC maps to ≥1 operation or response.** Twenty-two of the twenty-six map to a
field, a response or a stated constraint in the contract. The four that do not are each accounted
for and none is a gap:

| AC             | Where it lands                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-02a         | The **absence** of a request. The loader dispatches only the Panels whose whole Permission set the projection reports (`sad.md` §6.1), so the withheld Panel produces no call and therefore no response. |
| AC-09          | Out of scope by `sad.md` §3 — already served by shipped code (`guards/landing.guard.ts`, `routes/warehouse.route.tsx`, `WarehouseEntryRefusal`). No endpoint here implements it.                         |
| AC-21 / AC-21a | `workspaces`' shipped Workspace Role Editor and the release migration (`sad.md` §6.7). The one stored-data change this feature makes reaches no path in this document.                                   |
| AC-26          | Client freshness — refetch on entry rather than tag invalidation (`sad.md` §8 "Freshness"). Every operation is already uncached and derived on read, so the contract carries no field for it.            |

**Every operation maps to a §4 user story and ≥1 AC.** `coverage-gap` → US-02 (AC-03, AC-04, AC-05,
AC-06, AC-06a, AC-08, AC-11, AC-25); `arrival-timing` → US-03 (AC-07, AC-08, AC-08a);
`purchasing-pipeline` → US-04 (AC-10, AC-11); `reason-concentration` → US-05 (AC-12, AC-13);
`demand-pressure` → US-07 (AC-14, AC-04); `order-flow` → US-08 (AC-16, AC-17, AC-17a, AC-04);
`purchasing-spread` → US-09 (AC-18); `receipt-reliability` → US-10 (AC-19, AC-20, AC-20a, AC-20b).
US-01, US-06 and US-12 are cross-cutting and land on all four Warehouse operations plus the denial
responses; **US-11 maps to no operation here** and is served by `workspaces`, which is what
`sad.md` §6.7 records.

**No sequence gap found.** Every error and authorization response this contract needs is shown by a
§6 `alt`-branch — a consequence of `/sequences` having been run over this SAD with the concrete
guards named rather than generic participants.

---

## Findings

Four flags, each resolved with the user. None changes the shape of the contract.

**Finding 1 is resolved _fix the source first_ and is the one thing standing between this contract
and `tasks`**: `data-model.md` § The read model must record `rejection_reasons.label` and the join
before the contract is final. Findings 2–4 are **Save-as-OQ with the upstream stage as owner**, per
the skill's back-feed rule — the fix belongs to the artifact that produces the rule, not to this
contract — and none of them blocks it.

| #   | Finding                                              | Resolution               | Owner                            | Due            |
| --- | ---------------------------------------------------- | ------------------------ | -------------------------------- | -------------- |
| 1   | `rejection_reasons.label` absent from the read model | **Fix the source first** | Backend Lead (`data-model`)      | before `tasks` |
| 2   | No bucket for a late Ready draft (AC-07)             | Save as OQ               | PM + Tech Lead (`specify`)       | before `tasks` |
| 3   | Fourth exclusion carries no quantity                 | Save as OQ               | PM (`specify`)                   | before `tasks` |
| 4   | `timezone` required by spec §8, rendered nowhere     | Save as OQ               | Frontend Lead + PM (`design-ui`) | before `tasks` |

### Finding 1 — `rejection_reasons.label` is read by the contract and absent from the read model _(core, point 3 — **unresolved: source fix owed**)_

`ReasonConcentrationRow.label` carries the Rejection Reason's human wording. The design requires it:
`design-handoff.md` § Panel specifications gives the Panel a 126 px `Reason` column, and
`previews/warehouse-desktop-v1.html` renders "Damaged in transit", not `damaged_in_transit`.

`data-model.md` lists `rejection_reasons` under **§ Relations read and not changed**, so the relation
is declared. But § The read model gives Reason Concentration exactly four columns —
`rejection_reason_id`, `quantity`, `disposition`, `delivery_mode` — and no `label`, and it says
outright that the table exists "so `/api` and `implement` do not re-derive it from prose". Two
consequences:

- The repository statement needs **one join to `rejection_reasons`** that the per-Panel column list
  does not record.
- § Indexes measured Reason Concentration's plan without that join (Bitmap Index Scan → Bitmap Heap
  Scan, 217 buffers, 0.54 ms). The catalogue is ten rows, so the added cost is a hash join over a
  table that fits in one page, after the top-ten is already taken — but it is unmeasured.

**The alternative is worse.** The client could read the catalogue from
`GET /api/v1/warehouses/{warehouseId}/rejection-reasons`, but that is a second round trip for one
chart against `spec.md` §6's "≤ 1 round trip per chart", and it would make the Panel's rows
unreadable until an unrelated request returned.

**Resolved — fix the source first.** `label` stays in the contract, carrying a `# unresolved` note,
and **this contract is not final until `data-model.md` § The read model records the column and the
join** in its Reason Concentration row. This skill does not edit its sources, so the edit is owed
before `/tasks`. Re-run `/api dashboards --reconcile` afterwards to lift the note and raise the
field's confidence to `high`. — owner: Backend Lead, due: **before `tasks`**.

### Finding 2 — a late Ready draft has no bucket in `spec.md`, and the contract encodes a design ruling

`ArrivalTimingBucket.expectedQuantity` on the `overdue` bucket carries the Purchase Drafts standing
in Ready for Ordering whose Expected Arrival Date has already passed.

`spec.md` AC-07 names no bucket for one, and `CONTEXT.md` "Overdue" says the word means **nothing**
for a draft — "a draft whose Expected Arrival Date has passed is simply late and is named so".
`sad.md` §6.4 rules it into the first bucket beside the Overdue demand and carries the ruling in §11
as owed to PM + Tech Lead before `tasks`.

The contract had to take a position: a bucketed axis with nine positions has nowhere else to put it,
and dropping it silently would be an unstated exclusion against `spec.md` §6's 100% target.

**Resolved — saved as Open Question**, against the already-open `sad.md` §11 item. `spec.md` AC-07
gains the ruling, or the contract gains a fifth exclusion count instead. The contract ships with the
`sad.md` §6.4 ruling encoded in the meantime. — owner: PM + Tech Lead (stage: `specify`), due:
**before `tasks`**.

### Finding 3 — the fourth Arrival Timing exclusion carries a count and no quantity

`exclusions.undatedReadyDrafts` and `exclusions.datedDraftsStillInDraft` each carry `draftCount`
**and** `orderedQuantity`, because AC-08a asks for both in as many words. `draftsSinceClosedOrDiscarded`
carries `draftCount` only: AC-07 asks that such a draft count toward no week and says nothing about
its size, and `design-handoff.md` carries it as one of four footnote **counts**.

The asymmetry is faithful to the criteria and looks like an omission. Adding the quantity would cost
one `SUM` in a statement already reading those rows.

**Resolved — saved as Open Question.** `spec.md` AC-07 either asks for the quantity too, making the
four exclusions symmetric, or states that the count alone is what the reader needs. The contract
ships faithful to the criteria as written. — owner: PM (stage: `specify`), due: **before `tasks`**.

### Finding 4 — `timezone` is required by `spec.md` §8 and rendered nowhere in the approved design

`ArrivalTimingPanel.timezone` and `OrderFlowPanel.timezone` carry the deployment zone, because
`spec.md` §8's accepted default is "one timezone for the whole deployment, with weeks beginning on
Monday, **stated wherever a week is labelled**", and `data-model.md` § Time repeats it. The client
cannot know the value: it is `APP_TIMEZONE`, a server configuration read through `ConfigService`.

Neither committed preview states it. `previews/workspace-desktop-v1.html` labels twelve weeks and
carries only AC-17a's retroactive-figure footnote; `warehouse-desktop-v1.html` labels eight and
carries the four exclusion counts.

**Resolved — saved as Open Question.** `design-handoff.md` gains the disclosure on both
week-labelled Panels, or `spec.md` §8's default is narrowed to say the zone need not be shown while
it is `UTC`. The field stays in the contract either way: a client that is not given the value cannot
state it later. — owner: Frontend Lead + PM (stage: `design-ui`), due: **before `tasks`**.

---

## Notes

### Note 1 — the Coverage Gap's three quantities need not sum to the outstanding total

`onHandQuantity` is `items.on_hand_quantity` read directly and `inboundQuantity` is a raw `SUM` of
ordered quantities; neither is clamped to the Item's outstanding demand. For an Item covered beyond
what is promised, `onHandQuantity + inboundQuantity > totalOutstandingQuantity` while
`uncoveredQuantity` is `0` (AC-05).

The contract reports the four raw figures because each is a figure the records actually hold.
Clamping the two covering quantities to fit a bar would report a number no record holds, and
`spec.md` §7's "figures disputed" target is 0. Fitting the segments to the track is the client's,
and `design-handoff.md` owns it.

### Note 2 — Receipt Reliability's six exclusion counts are not a partition

They overlap by construction: a line may be undated **and** carry no conformance verdict, and a
Direct to Customer line is excluded from the on-time rate whatever else is true of it. The schema
says so and nothing should sum them. `data-model.md` § The read model is the source of each
predicate.

### Async — nothing to contract

`sad.md` §3 states the feature adds no asynchronous work and that BullMQ remains uninstalled; §6's
closing note says no diagram carries an idempotency key, a retry note or a dead-letter branch and
that none should be read as missing one. No §6 participant is a message bus or an external system.

So **no operation carries an `Idempotency-Key`** — all eight are `GET` — and **`events.md` is not
written**. Both are conclusions, not omissions.

### Orphan sequence — §6.7, deliberate

`sad.md` §6.7 draws the Workspace Owner granting the observation Permission to a Workspace Role. It
maps to no operation in this document, and correctly: the write belongs to `workspaces`' shipped
Workspace Role Editor, which gains one row and no code, and the release migration inserts the
catalogue row with no person acting (AC-21a). The diagram exists to show that AC-21 needs nothing
built, which is the opposite of a forgotten endpoint.

---

## Recorded deviations

Each is a departure from the `api` skill's stated defaults, taken because a `docs/system` rule, an
Accepted ADR, or an established contract in this repository decides otherwise.

| Default                                     | What this contract does                                   | Why                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BearerAuth` global                         | `SessionCookie` — `apiKey` in cookie `warehouser_session` | The application issues an opaque session cookie and has no bearer token. Every prior contract in this repository declares the same scheme; `auth/rest/auth-cookie.ts` is the source.                                                                                                                          |
| Cursor pagination on lists                  | Nothing is paged                                          | `spec.md` §6 "Row bounding" makes the server bound each Panel — ten rows plus a Remainder Row where the population is unbounded, every Warehouse where §1 bounds it at 20. `spec.md` §3 gives the surface no controls, and a cursor is a control. `ordering` and `arrival-inspection` set the same precedent. |
| `snake_case` response fields                | `camelCase`                                               | `packages/contracts` is Zod, and every shipped schema is camelCase (`receivedQuantity`, `totalOutstandingQuantity`). [Adding and using contracts](../../system/guides/adding-and-using-contracts.md) governs the boundary shape.                                                                              |
| `module.error_name` codes added per feature | No code added                                             | Every refusal is produced by a shipped guard or by the global filter. Adding a `dashboards.*` code would put a second word on a denial whose whole value is that it is indistinguishable (AC-02, AC-15, AC-24).                                                                                               |
| One example per operation                   | Two named examples on `WarehousePanelDenied`              | The two denial origins (guard vs. conjunction assertion) are deliberately identical on the wire; showing both is how the contract records that they are not distinguishable.                                                                                                                                  |

---

## Structural self-check

- **Contract parses as OpenAPI 3.1.0**, all 36 internal `$ref`s resolve, 8 paths / 8 operations / 31
  schemas / 5 shared responses.
- **Every example validates against its own schema** — required fields present, no property outside
  `additionalProperties: false`, every `enum` value legal, every `minItems`/`maxItems` honoured, every
  `minimum` respected. Checked mechanically over all ten example bodies.
- **Example arithmetic holds**: the Urgency Bands sum to each Warehouse's total; each Order Flow week
  satisfies `recorded − assigned − cancelled = stillAwaited`; Reason Concentration's rows plus its
  Remainder Row sum to `totalRefusedQuantity`, and the shares and running shares agree with them.
- **Placeholder data only** — `TEST-SKU-0001`, `Test Warehouse North`, `00000000-0000-4000-8000-…`.
  No customer name, no address, no real identifier appears anywhere, which is also `spec.md` §6.1's
  rule for the surfaces themselves.
- **`spectral` is not wired into this repository** and no ruleset exists under any package. The
  checks above were run in its place; adding `spectral` to a check target remains open work, and it
  is not this feature's to take.
