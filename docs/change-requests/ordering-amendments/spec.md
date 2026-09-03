---
kind: change-request
status: Draft
owner: 'PM'
reviewers: ['Tech Lead']
updated_at: '2026-09-03'
feature_size: 'L'
change_record: './change.md'
---

# Change-request specification — ordering-amendments

## 1. Context

`ordering` settled four rules that `delivery-addresses` cannot honour: that a link claims nothing
and reconciles with nothing ([CH-01](./change.md#3-override-map)), that the release ends where the
goods arrive at the Warehouse ([CH-02](./change.md#3-override-map)), that one Arrival Confirmation
records a whole draft and closes it ([CH-03](./change.md#3-override-map)), and that the Demand
Snapshot carries a linked Customer Order's quantity, needed-by date and state
([CH-04](./change.md#3-override-map)). A fifth delta, the two fields the freeze gains
([CH-05](./change.md#3-override-map)), contradicts nothing and is specified here only so that its
acceptance is recorded. This request makes the amended rules authoritative and states precisely
which parts of `ordering` are untouched.

The actor throughout is the Warehouse Member of `ordering` and `workspaces`, authorized by the Role
they hold in the Warehouse the request names. No Permission changes here; the criteria below name
the existing keys so the authorization terms of each amended operation stay legible.

## 2. Goals

- A directly-shipped line is refused demand it physically cannot serve, while every other link stays
  the member's own planning decision.
- Goods that go from the supplier straight to the customer are recorded as that line's ending and
  reduce what that customer is waiting for.
- A draft whose lines land on different days is recorded as those days happen, and closes when the
  last of its lines has an ending.
- A frozen line can be compared against the address its demand now expects.

## 3. Non-goals

- Dispatching Via Warehouse goods onward to the customer, carriers, tracking, shipping cost, and any
  proof that a delivery happened stay excluded. CH-02 narrows `ordering`'s non-goal to the fact of
  the ending; the journey is still a capability with its own authorization surface.
- Suppliers as records, supplier pricing and electronic exchange stay excluded, unchanged by this
  request.
- Reversing an ending once recorded is not introduced. `delivery-addresses`
  [`spec.md`](../../features/delivery-addresses/spec.md) §8 records that as out of scope.
- No Permission is added, removed or re-scoped by this request.
- Reconciling `ordering`'s own artifacts is a shipping step, not part of this specification; see
  [`change.md`](./change.md) §8.

## 4. Changed user stories

### CR-US-01: Keep a directly-shipped line honest

**As a** Warehouse Member permitted to update Purchase Drafts
**I want** the system to refuse a link between a directly-shipped line and demand going to another
address
**So that** one pallet is never promised to two places

### CR-US-02: Record each line's own ending

**As a** Warehouse Member permitted to confirm arrivals
**I want** to record goods arriving at my dock and goods reaching the customer directly, each
against the lines that travelled that way and each on the day it happens
**So that** a draft whose lines land days apart is recorded as it actually happened

### CR-US-03: Compare a frozen line against the address the demand now expects

**As a** Warehouse Member permitted to watch Purchase Drafts
**I want** the freeze to capture where each linked Customer Order was going, alongside where the
line itself ships
**So that** a redirection afterwards is reported rather than silently diverging

## 5. Acceptance criteria

### CR-AC-01 (CR-US-01, CH-01) — domain invariant

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:UPDATE` and a Direct to Customer
Purchase Draft Line travelling to one Delivery Address
**When** the member attempts to link that line to a Customer Order going to any other Delivery
Address, whether of the same Customer or another
**Then** the system blocks the link, records nothing of it, and names the address each of the two is
bound for — and the same disagreement blocks a later revision of that line and blocks the draft's
move to Ready for Ordering, withdrawing no link on the member's behalf

### CR-AC-02 (CR-US-02, CH-02) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` and a frozen Direct to
Customer Purchase Draft Line linked to Customer Orders
**When** the member records that the customer received the goods and assigns the quantity across
those linked Customer Orders
**Then** the system records the ending with the acting member and the time, reduces the Outstanding
Quantity of each Customer Order assigned to, and records no movement of any kind between the
supplier and the customer

### CR-AC-03 (CR-US-02, CH-03) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` and a Purchase Draft in
Ready for Ordering holding more than one line
**When** the member records the ending of one line and, on a later day, the ending of the last
remaining line
**Then** the system records each ending with its own acting member and time, leaves the draft in
Ready for Ordering for as long as any line has no ending, and moves it to Closed when the last one
is recorded — and each ending writes its line's quantity, every Allocation made from it, and the
resulting Outstanding Quantity of every Customer Order assigned to, together or not at all

### CR-AC-04 (CR-US-02, CH-03) — error

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` and a Purchase Draft Line
whose ending has already been recorded
**When** the member attempts to record an ending against that line a second time, or an ending of
the wrong kind against a line that travelled the other way
**Then** the system blocks the record, changes nothing, assigns nothing further to any Customer
Order, and tells the member why

### CR-AC-05 (CR-US-02, CH-03) — domain invariant

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:CLOSE` and a Purchase Draft in
Ready for Ordering, some of whose lines have an ending recorded and some of whose have none
**When** the member closes the draft with a reason
**Then** the system moves the draft to Closed whatever lines remain unrecorded, records the reason
with the acting member and the time, keeps every ending already recorded exactly as it was, and
leaves the Outstanding Quantity of every linked Customer Order untouched by the closure itself

### CR-AC-06 (CR-US-03, CH-04) — cross-context

**Given** a Purchase Draft frozen while one of its linked Customer Orders was going to a stated
Delivery Address
**When** that Customer Order is afterwards redirected to another Delivery Address
**Then** the system reports Address Drift against that line, naming the Customer Order, the address
captured at the freeze and the address the demand now expects, and changes no frozen value of the
draft

### CR-AC-07 (CR-US-03, CH-05) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:READY` and a Purchase Draft in the
Draft state
**When** the member moves it to Ready for Ordering
**Then** the system freezes each line's delivery mode and Delivery Address alongside the lines,
quantities, links, Pre-receipt Requirements and Expected Arrival Date it already froze, and refuses
every later change to either

## 5.1 Regression boundaries

### CR-RG-01 — loose linking on a Via Warehouse line

**Given** a Via Warehouse Purchase Draft Line
**When** a member links it to Customer Orders bound for several different Delivery Addresses and
states link quantities that do not add up to the line quantity
**Then** the system records every link and adjusts no quantity, exactly as before this request,
because CH-01 narrows the boundary for one delivery mode only

### CR-RG-02 — the Drift Signal `ordering` already reports

**Given** a frozen Purchase Draft whose linked Customer Order is afterwards cancelled, reduced,
increased, re-dated, or becomes Fulfilled through another draft
**When** a member holding `PURCHASE_DRAFTS:WATCH` opens it
**Then** the system reports that drift against the Demand Snapshot exactly as before, a value
amended and put back as it was reports nothing, and no frozen value is rewritten

### CR-RG-03 — On-hand Quantity is untouched by any ending

**Given** a Purchase Draft on which both an arrival at the dock and a direct delivery have been
recorded
**When** a member opens the Items of that draft
**Then** the On-hand Quantity of each is unchanged, because it moves only through an adjustment that
states its reason

### CR-RG-04 — the frozen record and the discard rules

**Given** a Purchase Draft in Ready for Ordering
**When** any member attempts to change its lines, ordered quantities, links, Expected Arrival Date
or Pre-receipt Requirements, or to discard it
**Then** the system blocks each attempt exactly as before, and a draft still in the Draft state is
still discarded rather than closed

### CR-RG-05 — Allocation stays the only thing that reduces demand

**Given** a Customer Order linked to a Purchase Draft Line
**When** the line's ending is recorded with no Allocation to that Customer Order
**Then** its Outstanding Quantity is unchanged, because recording an ending reduces demand only
through the Allocations the member makes from it

## 6. Non-functional requirements

| Aspect                    | Previous target                                                                                                                                                                                                                                                                                     | New target                                                                                                                                                                                                                                                                                       | Measurement                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Ending atomicity          | `ordering` §6 "Arrival atomicity": "100% of Arrival Confirmations record the received quantity of every line, every Allocation, and the resulting Outstanding Quantity of every Customer Order assigned to together, or record none of them; a line where nothing arrived records nothing received" | The same guarantee, scoped to one line's ending: its quantity, every Allocation made from it, and the resulting Outstanding Quantity of every Customer Order assigned to, together or not at all. This supersedes the whole-draft statement, which the per-line model leaves no act to attach to | Integration checks                                   |
| Frozen-record integrity   | `ordering` §6: 0 recorded changes to a frozen draft's lines, ordered quantities, links, Expected Arrival Date or Pre-receipt Requirements                                                                                                                                                           | Unchanged, extended to the delivery mode and Delivery Address of every line; the recorded endings and the move to Closed are the only permitted additions and are not counted as changes                                                                                                         | Integration checks and automated architecture checks |
| Direct-line agreement     | N/A                                                                                                                                                                                                                                                                                                 | 100% of Direct to Customer lines linked only to Customer Orders naming the same Delivery Address, checked at the link, at a revision, and at the freeze; 0 frozen violations                                                                                                                     | Integration checks                                   |
| Address-drift freshness   | N/A                                                                                                                                                                                                                                                                                                 | A redirected Customer Order is reflected in the Address Drift of every linked frozen draft on the next read; 0 reads of a superseded Delivery Address                                                                                                                                            | Integration checks                                   |
| Read and mutation latency | `ordering` §6 read and mutation targets                                                                                                                                                                                                                                                             | Unchanged; no regression is accepted from the per-line model or the extended snapshot                                                                                                                                                                                                            | Structured server timing logs                        |

## 6.1 Security / privacy

- **Data classification:** confidential, and raised by CH-02 and CH-04, which put a customer's
  Delivery Address into a frozen record and into a drift report.
- **Personal data impact:** a Delivery Address is personal data whenever the customer is a sole
  trader or a private buyer. The classification and handling are owned by `delivery-addresses`
  [`spec.md`](../../features/delivery-addresses/spec.md) §6.1 and are not restated here.
- **Authorization impact:** none. Both endings are exercised under `PURCHASE_DRAFTS:RECEIVE`,
  closure under `PURCHASE_DRAFTS:CLOSE`, linking under `PURCHASE_DRAFTS:UPDATE`, and the freeze
  under `PURCHASE_DRAFTS:READY` — the keys `ordering` already defined.
- **Security review:** covered by the review `delivery-addresses` §6.1 already requires; this
  request adds no authorization surface of its own.

## 7. Metrics / KPIs

- **Frozen-address violations** — baseline: 0; target: 0 at all times, counted as Purchase Draft
  Lines whose delivery mode or Delivery Address differs from what was frozen, and frozen Direct to
  Customer lines linked to demand naming another address. Source: integration-check and automated
  architecture-check results.
- **Drafts closed with an unrecorded line** — baseline: not measurable before CH-03; target: 0
  Purchase Drafts reaching Closed through the per-line path while any line has no ending. Source:
  operator query and integration-check results.
- **Duplicate endings** — baseline: not measurable before CH-03; target: 0 lines carrying more than
  one recorded ending. Source: integration-check results.

## 8. Open questions

- [ ] Both of [`change.md`](./change.md) §9's questions apply to this specification unchanged and
      are not restated here. — owner: PM / Tech Lead, due: before `review`
