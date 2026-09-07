---
kind: change-request
slug: 'ordering-amendments'
status: Draft
owner: 'PM'
reviewers: ['Product Owner', 'Tech Lead', 'Security Lead']
updated_at: '2026-09-03'
baseline_revision: 'a87f190e6c884ba671156bee673830e1cb0ea67a'
compatibility: 'breaking'
affected_sources:
  - docs/features/ordering/spec.md (§1 fourth boundary, §3 fourth non-goal, §6 "Arrival atomicity", AC-15, AC-16, AC-17, AC-17b, AC-21a — behavior amended or replaced; see CH-01 … CH-05)
  - docs/features/ordering/CONTEXT.md (glossary "Arrival Confirmation", "Demand Snapshot", "Ready for Ordering"; Invariants 5, 8, 9; Out of scope, third bullet — see CH-01 … CH-05)
  - docs/features/ordering/data-model.md (`purchase_draft_demand_snapshots`, `purchase_draft_lines`, `purchase_drafts` — see CH-03, CH-04, CH-05)
  - docs/features/ordering/contracts/openapi.yaml (`POST /purchase-drafts/{id}/arrival` withdrawn; see CH-03)
  - apps/server/src/purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command.ts
  - apps/server/src/purchase-drafts/rest/controllers
  - apps/web/src/modules/purchase-draft (the shipped arrival dialog; see CH-03)
  - packages/contracts (purchase-drafts request and response shapes; see CH-03, CH-04, CH-05)
---

# Change request — ordering-amendments

## 1. Behavioral delta

When a Warehouse Member assembles, freezes and closes a Purchase Draft, current behavior is that
every link claims nothing and reconciles with nothing, that the release ends where the goods reach
the Warehouse's own Transit Zone, that one Arrival Confirmation records the whole draft at once and
closes it, and that the Demand Snapshot captures a linked Customer Order's quantity, needed-by date
and state; approved behavior will be that a Direct to Customer line is refused a link to demand
going to another address, that goods reaching the end customer directly are recorded as that line's
ending, that each line's ending is recorded on its own day and the draft closes once every line has
one, and that the Demand Snapshot also captures the Delivery Address each linked Customer Order was
going to.

## 2. Motivation

`delivery-addresses` makes the Delivery Address a first-class property of both demand and supply.
Three of its acceptance criteria and one of its data requirements cannot hold while `ordering`'s
approved wording stands, and `delivery-addresses`
[`spec.md`](../../features/delivery-addresses/spec.md) §8 (eighth question, due **before `design`**)
already recorded the decision to raise them here rather than assert them in a downstream feature.
[`sad.md`](../../features/delivery-addresses/sad.md) §11 carries the same item as an **outstanding
gate**, because a reviewer opening `ordering` alone still finds it contradicted, and because the
third amendment reaches **every** Purchase Draft rather than only those holding a directly-shipped
line.

This request exists to make that contradiction explicit and reviewable. It changes no behavior on
its own: `delivery-addresses` is the delivery vehicle, and this record is the old-to-new trace its
implementation is judged against.

## 3. Override map

The four amendments `delivery-addresses` names are **CH-01 to CH-04**. **CH-05 is not one of those
four.** It is recorded here as an `ADD` because the Ready-for-Ordering freeze demonstrably gains two
fields and the override map would otherwise be incomplete; it contradicts no approved rule, which is
why the feature does not count it among its amendments.

| ID    | Target/source                                                                                                                                                                                                                                   | Existing behavior                                                                                                                                                                                                                                                                                          | Operation | New behavior                                                                                                                                                                                                                                                                                                                                  | Compatibility                                                                                                                                           | CR acceptance criteria       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| CH-01 | [`ordering/spec.md`](../../features/ordering/spec.md) §1 fourth boundary; [`ordering/CONTEXT.md`](../../features/ordering/CONTEXT.md) Invariants, fifth bullet                                                                                  | "linking is deliberately loose: a link carries a quantity the member states — how much of that line they intend for that customer — but that quantity is never forced to reconcile with the line quantity, with the Customer Order, or with any other link, and it claims no demand against another draft" | AMEND     | Unchanged for a Via Warehouse line. A Direct to Customer line is linked only to Customer Orders going to the Delivery Address that line ships to; a link to demand bound anywhere else is refused, and the agreement is re-checked when the line is revised and when the draft enters Ready for Ordering.                                     | Backward-compatible in data: every line that exists at `baseline_revision` is Via Warehouse and keeps loose linking.                                    | CR-AC-01                     |
| CH-02 | [`ordering/spec.md`](../../features/ordering/spec.md) §3 fourth non-goal; [`ordering/CONTEXT.md`](../../features/ordering/CONTEXT.md) Out of scope, third bullet                                                                                | "Shipping or dispatching goods to the end customer is excluded because this release ends where the goods arrive; what leaves the Transit Zone is a separate capability with its own authorization surface."                                                                                                | AMEND     | Recording that a Direct to Customer line's goods reached the customer is in scope and reduces what each named customer is still waiting for. The journey itself — dispatch of Via Warehouse goods, carriers, tracking, shipping cost, and any proof of delivery — stays excluded.                                                             | Backward-compatible: nothing that was recordable stops being recordable.                                                                                | CR-AC-02                     |
| CH-03 | [`ordering/CONTEXT.md`](../../features/ordering/CONTEXT.md) Invariants, ninth bullet, and glossary "Arrival Confirmation"; [`ordering/spec.md`](../../features/ordering/spec.md) AC-17, AC-17b, §6 "Arrival atomicity"                          | "A Purchase Draft reaches Closed only through Arrival Confirmation or through a member closing it with a reason, and Arrival Confirmation happens at most once for a draft."                                                                                                                               | REPLACE   | Each line's ending is recorded on its own — an arrival at the dock for a Via Warehouse line, a direct delivery for a Direct to Customer line. A second ending on one line is refused. The draft stays in Ready for Ordering until every line has an ending and moves to Closed when the last one does. Atomicity is stated per line's ending. | **Breaking.** `POST /purchase-drafts/{id}/arrival` is withdrawn and replaced by two per-line sub-resources; the shipped arrival dialog changes with it. | CR-AC-03, CR-AC-04, CR-AC-05 |
| CH-04 | [`ordering/CONTEXT.md`](../../features/ordering/CONTEXT.md) glossary "Demand Snapshot"; [`ordering/data-model.md`](../../features/ordering/data-model.md) `purchase_draft_demand_snapshots`; [`spec.md`](../../features/ordering/spec.md) AC-16 | "The quantity, needed-by date, and state of every Customer Order a Purchase Draft's lines link to, captured at the moment the draft entered Ready for Ordering."                                                                                                                                           | AMEND     | The snapshot additionally captures the Delivery Address each linked Customer Order was going to at that moment, and the comparison against it reports Address Drift alongside the existing Drift Signal.                                                                                                                                      | Transitional: snapshot rows written before this change carry no captured address and report no Address Drift.                                           | CR-AC-06                     |
| CH-05 | [`ordering/spec.md`](../../features/ordering/spec.md) AC-15; [`ordering/CONTEXT.md`](../../features/ordering/CONTEXT.md) glossary "Ready for Ordering"                                                                                          | "Entering it freezes the draft's lines, quantities, links, Pre-receipt Requirements, and Expected Arrival Date, captures the Demand Snapshot, and starts Drift Signal reporting against it."                                                                                                               | ADD       | The freeze additionally captures each line's delivery mode and Delivery Address, which are frozen on exactly the terms the existing fields are and are never edited afterwards.                                                                                                                                                               | Transitional: existing lines are backfilled to Via Warehouse, the mode every one of them was ordered under, before the column is made non-nullable.     | CR-AC-07                     |

## 4. Impact analysis

| Area                         | State     | Evidence and consequence                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain invariants            | affected  | Four `ordering` invariants change: loose linking (CH-01), at-most-one Arrival Confirmation per draft (CH-03), the Demand Snapshot's contents (CH-04), and the frozen field list (CH-05). Every other invariant in [`ordering/CONTEXT.md`](../../features/ordering/CONTEXT.md) is unchanged, including that Allocation is the only operation reducing Outstanding Quantity and that a frozen draft is never Discarded. |
| Permissions                  | unchanged | Both endings are exercised under the existing `PURCHASE_DRAFTS:RECEIVE`, and closure with a reason under `PURCHASE_DRAFTS:CLOSE`. No Permission key in this request is added, removed or re-scoped; the keys `delivery-addresses` introduces are that feature's, not this request's.                                                                                                                                  |
| Workflows and state          | affected  | The Purchase Draft state machine keeps its states — Draft, Ready for Ordering, Closed, Discarded — and changes only what moves it from Ready for Ordering to Closed: the last line's ending rather than one whole-draft act (CH-03).                                                                                                                                                                                  |
| API and events               | affected  | `POST /purchase-drafts/{id}/arrival` is withdrawn (CH-03). Purchase Draft read shapes gain the per-line ending, the delivery mode, the Delivery Address and Address Drift (CH-03, CH-04, CH-05). This repository publishes no events.                                                                                                                                                                                 |
| Persisted data               | affected  | `purchase_draft_lines` gains its mode, address and ending columns; `purchase_draft_demand_snapshots` gains the captured address; `purchase_drafts` no longer carries a whole-draft confirmation. Existing lines are backfilled to Via Warehouse before the mode is made non-nullable.                                                                                                                                 |
| UI behavior                  | affected  | The shipped whole-draft arrival dialog is replaced by per-line recording, and the draft list separates lines landing at the dock from lines shipping direct. The client half and the server half of CH-03 must land together.                                                                                                                                                                                         |
| Cross-feature behavior       | affected  | `customer-orders` is reached through the exported allocation service, which is now called once per line's ending rather than once per draft. `items` is untouched.                                                                                                                                                                                                                                                    |
| Security and privacy         | affected  | Only through CH-02 and CH-04, which put a customer's Delivery Address into a frozen record and into a drift report. `delivery-addresses` [`spec.md`](../../features/delivery-addresses/spec.md) §6.1 classifies that data and owns the required security review; this request adds no authorization surface of its own.                                                                                               |
| Operations and observability | unchanged | This repository adds no telemetry. The structured logs the shipped commands already emit follow the ending they record.                                                                                                                                                                                                                                                                                               |
| Tests                        | affected  | Every `ordering` test asserting one-arrival-per-draft, whole-draft atomicity, or the withdrawn route is replaced by its per-line form. The tests asserting loose linking stay, restricted to Via Warehouse lines (CR-RG-01).                                                                                                                                                                                          |
| Canonical documentation      | affected  | See §8. `ordering`'s `spec.md`, `CONTEXT.md`, `data-model.md` and `contracts/openapi.yaml` are reconciled after PASS, not during this request.                                                                                                                                                                                                                                                                        |

## 5. Compatibility and transition

- **Compatibility:** breaking. CH-03 withdraws a shipped REST route and changes the closure model of
  every Purchase Draft, including those already frozen. CH-01, CH-02, CH-04 and CH-05 are additive
  or transitional on their own.
- **Affected consumers:** `apps/web`'s purchase-draft surfaces, the `purchase-drafts` shapes in
  `packages/contracts`, and every automated check written against the withdrawn route. There is no
  third-party API consumer.
- **Transition window and exit condition:** none. The server and web halves of CH-03 land in one
  change, and no coexistence period is offered — a route that answers "confirm the whole draft"
  while per-line endings exist would let one draft close two ways. The exit condition is that
  `POST /purchase-drafts/{id}/arrival` no longer exists in the contract or in the client.
- **Existing-data treatment:** every existing Purchase Draft Line is backfilled to Via Warehouse
  travelling to the Warehouse's own Delivery Address, which is the mode every one of them was
  ordered under; the backfill runs before the column is made non-nullable. A draft already Closed
  stays Closed and is not reinterpreted. Demand Snapshot rows written before CH-04 carry no captured
  address and therefore report no Address Drift; this is a gap in history, not a defect.

## 6. Rollout

CH-01, CH-02, CH-04 and CH-05 are delivered by `delivery-addresses` in its own task order. CH-03 is
delivered as one indivisible change spanning the migration, the contract, the server commands and
the web dialog; `tasks` must not land the server half first. The signal watched after release is
`delivery-addresses` [`spec.md`](../../features/delivery-addresses/spec.md) §7 "Frozen-address
violations", which must stay at zero, together with the integration checks for per-line ending
atomicity. The abort threshold is any recorded second ending on one line, or any Purchase Draft that
reaches Closed with a line whose ending was never recorded.

## 7. Rollback

CH-01, CH-02, CH-04 and CH-05 roll back by reverting the code and reverting their migrations; the
backfilled Via Warehouse mode is the value every affected row already had in fact, so reverting
loses nothing. CH-03 does not roll back cleanly once drafts have closed line by line: a whole-draft
confirmation record for those drafts was never written and cannot be reconstructed from the per-line
endings, because the endings carry their own acting member and time. Restoring the old model would
therefore leave the closed drafts of the transition period without a confirmation record. This is
the reason CH-03 alone escalates the size of this request.

## 8. Canonical reconciliation after PASS

| Canonical owner                                                                                   | Required edit                                                                                                                                                                                                                                           | Backlink                                             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`docs/features/ordering/spec.md`](../../features/ordering/spec.md)                               | Amend §1 fourth boundary (CH-01), §3 fourth non-goal (CH-02), §6 "Arrival atomicity" and "Frozen-record integrity" (CH-03, CH-05); replace AC-17 and AC-17b, and amend AC-15, AC-16 and AC-21a. Record each amendment against this request's CR-AC ids. | `docs/change-requests/ordering-amendments/change.md` |
| [`docs/features/ordering/CONTEXT.md`](../../features/ordering/CONTEXT.md)                         | Amend the glossary entries "Arrival Confirmation", "Demand Snapshot" and "Ready for Ordering", Invariants 5, 8 and 9, and the third Out-of-scope bullet.                                                                                                | `docs/change-requests/ordering-amendments/change.md` |
| [`docs/features/ordering/data-model.md`](../../features/ordering/data-model.md)                   | Amend `purchase_draft_demand_snapshots`, `purchase_draft_lines` and `purchase_drafts` to the shapes `delivery-addresses` ships.                                                                                                                         | `docs/change-requests/ordering-amendments/change.md` |
| [`docs/features/ordering/contracts/openapi.yaml`](../../features/ordering/contracts/openapi.yaml) | Withdraw `POST /purchase-drafts/{id}/arrival` and record the two per-line sub-resources that replace it.                                                                                                                                                | `docs/change-requests/ordering-amendments/change.md` |

## 9. Open questions

- [ ] Is this request implemented by `delivery-addresses` or re-planned as its own work item? It is
      raised after that feature's `design` stage and every override is already designed there, so
      running the full pipeline again would duplicate it. Default now: `delivery-addresses` remains
      the delivery vehicle, its commits keep carrying `SDD-Change: ordering-amendments` alongside
      their feature trailers, and this record is what `review` compares them against. — owner: PM,
      due: before `review`
- [ ] Does closing a draft with a reason keep the endings already recorded on some of its lines?
      `ordering` never had the case, because closure with a reason and Arrival Confirmation were
      mutually exclusive — a draft that had been confirmed was already Closed. Under CH-03 a draft
      can carry recorded endings and still be closable with a reason, and nothing approved says what
      happens to them. Default now: the recorded endings stand and the closure reason is recorded
      beside them, consistent with `delivery-addresses`
      [ADR 0002](../../features/delivery-addresses/adr/0002-per-line-purchase-draft-endings.md) and
      with CR-AC-05. — owner: Tech Lead, due: before `review`
