---
status: Draft
owner: 'PM + Tech Lead'
reviewers: ['Tech Lead', 'Security Lead']
updated_at: '2026-08-25'
feature_size: 'XL'
---

# Spec — ordering

> **Glossary:** [CONTEXT](./CONTEXT.md), [workspaces CONTEXT](../workspaces/CONTEXT.md), [access CONTEXT](../access/CONTEXT.md), [auth CONTEXT](../auth/CONTEXT.md)
> **Reference module / docs / channels used:** `docs/features/access/spec.md`, `docs/features/workspaces/spec.md`, `docs/features/workspaces/CONTEXT.md`, `docs/features/users-management/spec.md`, `docs/local/warehouse-feature-candidates.md`, `docs/local/warehouse-mvp-features.md`, `docs/system/architecture-map.md`, `docs/system/sad.md`, `docs/roadmap.md`, and the `apps/server/src` module inventory.

## 1. Context

Warehouser treats a Warehouse as a cross-docking point rather than a store: goods are meant to arrive and leave again, and what rests in the Transit Zone at any moment is near zero by design. The decision that governs such an operation is therefore not "what has fallen below its reorder level" but "what are my customers waiting for, and what must I phone my supplier about today". That decision currently happens entirely outside the product. Warehouser knows who its members are and what each of them is permitted to do, but it holds no record of a single customer waiting for a single good, so a Warehouse Member reconstructs demand every morning from notes, a spreadsheet, and a messaging thread, and the resulting order exists only as a phone call. Nothing afterwards can say which customers that call was for.

This is the right release to correct that, because the ownership and authorization boundaries are finished and the Warehouse is about to start holding real business data. Every capability the roadmap parks under Later — Items, Locations, Stock balances, Stock Movements — assumes a Warehouse that already knows what goods it deals in and who is waiting for them. Introducing demand before the movement ledger keeps the first business feature small and reversible: a mistake here costs a schema that no operational history depends on yet. Introducing it after would mean fitting customer demand around a ledger that was designed without it.

The committed approach is a manual, human-decided order-formation loop that no existing product serves. Mainstream small-business inventory tools drive purchasing from reorder-point arithmetic over stock levels, and the concept of instructing a supplier on how goods must physically arrive exists only at enterprise scale, as a company-wide vendor-compliance guide enforced by chargebacks. Neither combination fits an operator who screens named customer back orders by hand and then picks up the phone. This feature therefore consolidates Unfulfilled Customer Orders into a per-Item Demand Line, shows it beside a manager-maintained On-hand Quantity so the Transit Zone leftovers are visible, and lets a member assemble a Purchase Draft whose lines carry both the demand they are meant to serve and the Pre-receipt Requirement — a Packaging Type and a Value-adding Note — that lets the goods be cross-docked straight back out. Moving the draft to Ready for Ordering freezes it as the record of what the member told the supplier, and Arrival Confirmation closes the loop: the member records what actually arrived and assigns it across the linked Customer Orders, which reduces what each of those customers is still waiting for. To make any of this possible the release also introduces the two entities the product lacks — a minimal Item identified by a SKU, and a minimal Customer Order — which is why it is sized XL.

Six boundaries are stated here so they are not re-derived downstream. First, this release depends on `workspaces`: every operation it introduces names the Warehouse it applies to and is authorized by the Role the actor holds in that Warehouse, and an archived Warehouse authorizes none of the operations that change what it holds, while the watch capabilities continue to authorize reads of it on the same Permission terms as before, as `workspaces` already settles. Second, Items, Customer Orders, and Purchase Drafts are Warehouse-scoped without exception, so an organization running two sites for the same end customer records that customer's demand at each site separately; consolidating demand across a Workspace is an explicit non-goal, and the duplicate-ordering risk it leaves open is accepted rather than overlooked. Third, a Purchase Draft is a frozen record from Ready for Ordering onward, never a live projection of current demand — freezing captures the linked demand as it stood at that moment, so that when the demand afterwards changes the system reports a Drift Signal by comparing the two and leaves the draft alone, because the draft's value is that it says what was actually ordered; the single exception is Arrival Confirmation, which writes what arrived and to whom it was assigned onto the frozen draft and closes it. Fourth, linking is deliberately loose: a link carries a quantity the member states — how much of that line they intend for that customer — but that quantity is never forced to reconcile with the line quantity, with the Customer Order, or with any other link, and it claims no demand against another draft, because a human is making the coverage decision and the system's job is to show them what they are deciding against, not to arbitrate it. Allocation at arrival is the one place a quantity does bind, because by then the goods exist. Fifth, On-hand Quantity is a maintained figure with a reason attached, not a derived balance; this release provides no Stock Movement that could reconstruct or contradict it, and how the two are reconciled when the Stock feature lands is an open question in §8 rather than a settled one. Sixth, the §6 targets assume an order of magnitude of roughly 2 000 Items, 5 000 Unfulfilled Customer Orders, and 250 open Purchase Drafts per Warehouse, at which the demand and draft lists this feature presents are returned whole rather than in pages; outgrowing that scale is the explicit trigger to revisit §6 and introduce paging, not a silent regression against these targets.

## 2. Goals

- Make Unfulfilled end-customer demand answerable inside the product, consolidated per Item and visible beside what the Transit Zone already holds, so the decision to order is made from one place instead of reconstructed each morning.
- Make the order a member places by phone or email exist as a record that also carries how the goods must physically arrive, so the supplier is told the packaging and processing that cross-docking depends on.
- Close the loop from arrival back to the customer, so goods that reach the Transit Zone are attributed to the named customers waiting for them and the demand they satisfy stops counting as outstanding.

## 3. Non-goals

- Suppliers as records, supplier pricing, purchase-order transmission, and any electronic exchange are excluded because the operator's supplier relationship is a conversation, and modelling one side of it in software would add a maintenance burden with no decision attached to it.
- Stock Movements, Stock balances, Locations, and put-away are excluded because this release needs only enough visibility for the buffer check, and a movement ledger is a feature with its own invariants that deserves its own specification.
- Automatic reorder points, suggested quantities, and demand forecasting are excluded because the product's premise is that a human decides what to buy from what they can see, and a suggested number would be trusted long before it deserved to be.
- Shipping or dispatching goods to the end customer is excluded because this release ends where the goods arrive; what leaves the Transit Zone is a separate capability with its own authorization surface.
- Recording whether a Pre-receipt Requirement was actually met on arrival is excluded because verifying packaging and labelling is an inspection step this release does not provide; the requirement is stated for the supplier and the member judges the result with their eyes.
- Consolidating demand across several Warehouses of one Workspace is excluded because the subject of every operation here is a resource a Warehouse owns, and reading one Warehouse's customer demand from another would cross the capability line the Workspace boundary draws.

## 4. User stories

### US-01: Record what a customer is waiting for

**As a** Warehouse Member permitted to create Customer Orders
**I want** to record that a named customer needs a stated quantity of one Item by a stated date
**So that** the demand exists in the product instead of in my notes

### US-02: See consolidated demand

**As a** Warehouse Member permitted to watch Customer Orders
**I want** to see one row per Item showing the total Outstanding Quantity and the earliest date it is needed
**So that** I can decide what to order without adding up back orders by hand

### US-03: Maintain the item catalogue

**As a** Warehouse Member permitted to watch, create, and update Items
**I want** to create and update Items whose SKU is unique in my Warehouse, and to choose an existing Item when recording demand
**So that** the same physical good aggregates into one Demand Line instead of fragmenting across spellings

### US-04: Account for what is already here

**As a** Warehouse Member permitted to adjust On-hand Quantity
**I want** to state and adjust an Item's On-hand Quantity with a reason
**So that** cancelled and leftover goods in the Transit Zone are subtracted from what I order

### US-05: Draft an order

**As a** Warehouse Member permitted to create Purchase Drafts
**I want** to assemble a Purchase Draft of Items and quantities and link its lines to the Customer Orders they are meant to serve
**So that** the order I am about to place is recorded together with who it is for

### US-06: State how goods must arrive

**As a** Warehouse Member permitted to update Purchase Drafts
**I want** to give each Purchase Draft Line a Packaging Type and a Value-adding Note
**So that** the supplier is told what the goods must look like on arrival for them to go straight back out

### US-07: Freeze the order I placed

**As a** Warehouse Member permitted to move a Purchase Draft to Ready for Ordering
**I want** the draft's contents to become unchangeable at that moment
**So that** the record of what I told the supplier survives whatever happens to the demand afterwards

### US-08: Learn that demand moved

**As a** Warehouse Member permitted to watch Purchase Drafts
**I want** to be told when the demand linked to a frozen Purchase Draft has changed since it was frozen
**So that** I find out before the goods arrive rather than at the truck

### US-09: Confirm what arrived and for whom

**As a** Warehouse Member permitted to confirm arrivals
**I want** to record the quantity that actually arrived for each Purchase Draft Line and assign it across the linked Customer Orders
**So that** the goods are attributed to the customers waiting for them and those customers stop showing as waiting for what they received

### US-10: Amend a customer's demand

**As a** Warehouse Member permitted to update and cancel Customer Orders
**I want** to change the quantity or the needed-by date of a Customer Order, or cancel it outright
**So that** the consolidated demand keeps matching what customers are actually waiting for

### US-11: See what is already covered

**As a** Warehouse Member permitted to watch Customer Orders
**I want** to see, next to each Demand Line, which Purchase Drafts already claim to serve it and for how much
**So that** two of us do not order the same demand twice

### US-12: Close a draft that will not arrive

**As a** Warehouse Member permitted to close Purchase Drafts
**I want** to close a frozen Purchase Draft with a reason when the supplier cannot fulfil it
**So that** an order that never came stops presenting itself as covering demand

### US-13: Retire an Item I should not have created

**As a** Warehouse Member permitted to deactivate Items
**I want** to deactivate an Item that should no longer be used
**So that** a mistaken or obsolete Item stops being offered to me and to my colleagues when we record demand or draft an order

### US-14: Abandon a draft I never made ready

**As a** Warehouse Member permitted to discard Purchase Drafts
**I want** to discard a Purchase Draft I have not yet moved to Ready for Ordering
**So that** drafts I thought better of stop cluttering what I am working on

## 5. Acceptance criteria

### AC-01 (US-01) — happy

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:CREATE` in a Warehouse that already holds an Item
**When** the member records that a named customer needs a quantity of that Item by a date
**Then** the system records the Customer Order as Unfulfilled in that Warehouse with its Outstanding Quantity equal to the quantity recorded, together with the member who recorded it and when, and confirms it to the member

### AC-02 (US-01) — error

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:CREATE`
**When** the member records a Customer Order whose quantity is zero, negative, or not a whole number, or whose customer name is empty
**Then** the system blocks the record, changes nothing, and tells the member in plain language which value it will not accept

### AC-02a (US-01) — domain invariant

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:CREATE`
**When** the member records a Customer Order whose needed-by date has already passed
**Then** the system blocks the record and tells the member that a customer cannot be recorded as waiting for a date in the past

### AC-03 (US-01, US-03) — cross-context

**Given** an authorized Warehouse Member who belongs to two Warehouses of one Workspace, holds `CUSTOMER_ORDERS:CREATE` in both, and is acting in the first of them
**When** the member records a Customer Order naming an Item that exists only in the second Warehouse
**Then** the system refuses the record and does not disclose that the Item exists elsewhere, because demand names an Item of the Warehouse the request applies to

### AC-04 (US-02) — happy

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:WATCH` in a Warehouse holding several Unfulfilled Customer Orders across several Items
**When** the member opens the consolidated demand
**Then** the system shows one Demand Line per Item with the total Outstanding Quantity, the earliest date any of its Unfulfilled Customer Orders is needed by, and that Item's current On-hand Quantity, and omits every Fulfilled and cancelled Customer Order

### AC-05 (US-02) — authorization

**Given** an authenticated Warehouse Member of a Warehouse whose Role does not carry `CUSTOMER_ORDERS:WATCH`
**When** the member attempts to open the consolidated demand of that Warehouse
**Then** the system denies the request, shows no customer name, quantity, or Item, and the denial does not reveal whether any demand exists

### AC-06 (US-03) — happy

**Given** an authorized Warehouse Member holding `ITEMS:CREATE`
**When** the member creates an Item with a SKU not yet used in that Warehouse, a description, and the unit of measure its quantities are counted in
**Then** the system records the Item in that Warehouse as active with nothing on hand, and it becomes selectable when recording demand and when drafting an order

### AC-06a (US-03) — happy

**Given** an authorized Warehouse Member holding `ITEMS:WATCH` in a Warehouse holding several Items
**When** the member looks for an Item while recording demand or assembling a draft
**Then** the system shows the Items of that Warehouse with their SKUs so the member selects an existing one rather than describing the good again

### AC-06b (US-03) — happy

**Given** an authorized Warehouse Member holding `ITEMS:UPDATE` and an Item already named by Customer Orders and Purchase Draft Lines
**When** the member corrects that Item's description or its unit of measure
**Then** the system records the correction and every Customer Order and Purchase Draft Line that names the Item continues to name the same Item

### AC-06c (US-03) — domain invariant

**Given** an authorized Warehouse Member holding `ITEMS:UPDATE` and an Item that a Customer Order or a Purchase Draft Line already names
**When** the member attempts to change that Item's SKU
**Then** the system blocks the change and tells the member that a SKU stops being correctable once demand or a draft names the Item, while an Item nothing yet names may still have its SKU corrected to one unused in that Warehouse

### AC-06d (US-13) — happy

**Given** an authorized Warehouse Member holding `ITEMS:DEACTIVATE` and an active Item that Customer Orders and Purchase Draft Lines already name
**When** the member deactivates that Item
**Then** the system records it as inactive, stops offering it when demand is recorded and when a draft is assembled, keeps every Customer Order and Purchase Draft Line that already names it readable and counting exactly as before, keeps its SKU taken so no new Item may reuse it, and lets the member make it active again

### AC-07 (US-03) — domain invariant

**Given** an authorized Warehouse Member holding `ITEMS:CREATE` in a Warehouse that already holds an Item with a given SKU
**When** the member attempts to create a second Item with that same SKU in the same Warehouse
**Then** the system blocks the creation and tells the member that a SKU identifies at most one Item within a Warehouse, naming the Item that already holds it

### AC-07a (US-03) — cross-context

**Given** two Warehouses of one Workspace, the first of which holds an Item with a given SKU
**When** an authorized Warehouse Member holding `ITEMS:CREATE` in the second Warehouse creates an Item with that same SKU there
**Then** the system records it as an unrelated Item, because a SKU is unique within a Warehouse and never across them

### AC-08 (US-04) — happy

**Given** an authorized Warehouse Member holding `ITEM_STOCK:ADJUST` and an Item of their Warehouse
**When** the member sets that Item's On-hand Quantity to the count they have just made and states a reason
**Then** the system records that count as the Item's On-hand Quantity, together with the reason, the acting member, and the time, and the consolidated demand shows the new quantity beside that Item

### AC-09 (US-04) — domain invariant

**Given** an authorized Warehouse Member holding `ITEM_STOCK:ADJUST` and an Item of their Warehouse
**When** the member attempts to set that Item's On-hand Quantity to a negative number, or to a quantity that is not a whole number
**Then** the system blocks the adjustment, changes nothing, and tells the member that On-hand Quantity is a whole number that is never negative

### AC-09a (US-04) — error

**Given** an authorized Warehouse Member holding `ITEM_STOCK:ADJUST`
**When** the member attempts an adjustment without stating a reason
**Then** the system blocks the adjustment and tells the member that every change to On-hand Quantity is recorded with its reason

### AC-10 (US-05) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:CREATE` in a Warehouse holding Unfulfilled demand
**When** the member assembles a Purchase Draft of Items and quantities, links each line to none, one, or several of that Warehouse's Unfulfilled Customer Orders stating for each link how much of that line is intended for that customer, and states an Expected Arrival Date or leaves it unstated because they have not yet spoken to the supplier
**Then** the system records the Purchase Draft in that Warehouse in the Draft state with each link and the quantity stated for it, together with the member who created it and when, and confirms it to the member

### AC-10a (US-05) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:UPDATE` and a Purchase Draft of their Warehouse in the Draft state
**When** the member adds a line, changes a line's Item or quantity, removes a line, links a line to a further Customer Order, changes the quantity stated on a link, or removes a link
**Then** the system records each change against the draft, which stays in the Draft state, and confirms it to the member, because a draft is assembled over the course of deciding rather than in one submission

### AC-11 (US-05) — domain invariant

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:CREATE` acting in one Warehouse
**When** the member attempts to give a Purchase Draft Line an Item of a different Warehouse, or to link a Purchase Draft Line to a Customer Order of a different Warehouse
**Then** the system blocks the change and tells the member that a draft, the Items it names, and the demand it serves all belong to the same Warehouse

### AC-11a (US-05) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:CREATE` and one Customer Order that another Purchase Draft Line already links to
**When** the member links a second Purchase Draft Line to that same Customer Order, or links one line to several Customer Orders whose quantities do not add up to the line quantity
**Then** the system records both links and does not block or adjust either quantity, because coverage is the member's decision and a link claims nothing

### AC-12 (US-06) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:UPDATE` and a Purchase Draft in the Draft state
**When** the member gives one of its lines a Packaging Type from the catalogue and a Value-adding Note, and gives another line a different Packaging Type
**Then** the system records each line's Pre-receipt Requirement separately and shows both when the draft is opened

### AC-13 (US-06) — error

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:UPDATE` and a Purchase Draft in the Draft state
**When** the member attempts to give a line a Packaging Type that is not one of Loose Items, Cartons, Pallets, or Cable Coil
**Then** the system blocks the change and tells the member which Packaging Types the catalogue offers

### AC-14 (US-07) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:READY` and a Purchase Draft in the Draft state holding at least one line
**When** the member moves the draft to Ready for Ordering
**Then** the system records the transition with the acting member and the time, captures the quantity, needed-by date, and state of every Customer Order its lines link to as they stand at that moment, presents the draft as the record of what is being ordered, and begins reporting demand changes against that captured picture

### AC-14a (US-07) — domain invariant

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:READY` and a Purchase Draft in the Draft state holding no lines
**When** the member attempts to move it to Ready for Ordering
**Then** the system blocks the transition and tells the member that a draft is only ready once it says what is being ordered

### AC-15 (US-07) — domain invariant

**Given** a Purchase Draft in Ready for Ordering
**When** any Warehouse Member, including the one who created it and the Warehouse Manager, attempts to change its lines, ordered quantities, links, Expected Arrival Date, or Pre-receipt Requirements
**Then** the system blocks the change and tells the member that a draft is frozen once it is ready, because it records what the supplier was told, and the only writes it still accepts are those of Arrival Confirmation and closure

### AC-16 (US-08) — cross-context

**Given** a Purchase Draft in Ready for Ordering whose line links to a Customer Order
**When** that Customer Order is afterwards cancelled, has its quantity changed, has its needed-by date moved, or becomes Fulfilled through the arrival of a different Purchase Draft
**Then** the system shows a Drift Signal against the draft naming the Customer Order and what changed, compared against the demand captured when the draft was frozen, and leaves every frozen value of the draft exactly as it was; a value amended and then put back as it was is no longer reported as drift

### AC-16a (US-08) — happy

**Given** a Warehouse holding frozen Purchase Drafts, some of whose linked demand has changed and some of whose has not
**When** an authorized Warehouse Member holding `PURCHASE_DRAFTS:WATCH` opens the drafts of that Warehouse
**Then** the system distinguishes the drafts carrying a Drift Signal from those that still match their demand

### AC-17 (US-09) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` and a Purchase Draft in Ready for Ordering whose line for a quantity of goods links to two Unfulfilled Customer Orders
**When** the member confirms arrival, records the quantity that actually arrived for that line whether it falls short of or exceeds the quantity ordered, and assigns part of it to each linked Customer Order
**Then** the system records the received quantity and each Allocation together with the acting member and the time, moves the draft to Closed, and shows which named customers the arrived goods cover

### AC-17a (US-09) — happy

**Given** the Arrival Confirmation of AC-17, in which one linked Customer Order was assigned its whole Outstanding Quantity and the other was assigned part of its own
**When** an authorized Warehouse Member holding `CUSTOMER_ORDERS:WATCH` opens the consolidated demand afterwards
**Then** the first Customer Order is Fulfilled and no longer counted, and the second still counts for the part it did not receive

### AC-17b (US-09) — domain invariant

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` and a Purchase Draft in Ready for Ordering, one of whose lines arrived short of what was ordered and another of whose lines links only to Customer Orders since cancelled or Fulfilled
**When** the member confirms the arrival and assigns nothing from the second line
**Then** the system records what arrived on both lines, records no Allocation for the second, moves the draft to Closed, and tells the member that confirming an arrival closes a draft once and for all, so goods the supplier still owes are ordered on a new draft rather than awaited on this one

### AC-18 (US-09) — error

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` confirming the arrival of a Purchase Draft
**When** the member assigns across the linked Customer Orders of one line more than the quantity they recorded as arrived for that line, assigns to one Customer Order more than it is still waiting for, or assigns to a linked Customer Order that has since been cancelled or is already Fulfilled
**Then** the system blocks the confirmation, records nothing of it, and tells the member which assignment it will not accept and why

### AC-18a (US-09) — domain invariant

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` who has just confirmed the arrival of a Purchase Draft
**When** the member opens the Items of that draft
**Then** the On-hand Quantity of each is unchanged, because it moves only through an adjustment that states its reason and this release derives no quantity from arrival

### AC-19 (US-10) — happy

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:UPDATE` and a Customer Order that is Unfulfilled, or one that is Fulfilled because everything it asked for has been assigned to it
**When** the member changes its quantity or moves its needed-by date to a date that has not passed
**Then** the system records the change with the acting member and the time, recalculates the Outstanding Quantity, reflects it in the consolidated demand immediately, counts a Fulfilled Customer Order whose quantity was raised as Unfulfilled again so that it returns to the consolidated demand, and every frozen Purchase Draft linked to it reports a Drift Signal

### AC-19a (US-10) — happy

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:CANCEL` and an Unfulfilled Customer Order that a frozen Purchase Draft links to
**When** the member cancels it and states a reason
**Then** the system records the cancellation with the reason, the acting member, and the time, removes it from the consolidated demand, and the linked frozen draft reports a Drift Signal without any of its values changing

### AC-19b (US-10) — domain invariant

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:UPDATE` and a Customer Order part of whose quantity has already been assigned to it from an arrival
**When** the member attempts to change its quantity to less than what has already been assigned
**Then** the system blocks the change, leaves the Customer Order exactly as it was, and tells the member that a customer's order cannot be reduced below the goods already attributed to them, because those goods are in the Transit Zone under that customer's name

### AC-20 (US-11) — happy

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:WATCH` and a Demand Line that two Purchase Drafts already link to
**When** the member opens the consolidated demand
**Then** the system shows against that Demand Line which Purchase Drafts link to it and for what quantity, without treating the demand as unavailable to a further draft

### AC-21 (US-12) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:CLOSE` and a Purchase Draft in Ready for Ordering that the supplier cannot fulfil
**When** the member closes the draft and states a reason
**Then** the system records the closure with the reason, the acting member, and the time, keeps the frozen contents readable, leaves the Outstanding Quantity of every linked Customer Order untouched, and stops presenting the draft as covering that demand

### AC-21a (US-11, US-12) — domain invariant

**Given** a Purchase Draft that has reached Closed, whether through Arrival Confirmation or through a member closing it with a reason, and a linked Customer Order still waiting for part of its quantity
**When** an authorized Warehouse Member holding `CUSTOMER_ORDERS:WATCH` opens the consolidated demand
**Then** the Demand Line presents that remaining demand as covered by no draft, because a Closed draft never presents as Coverage whichever way it closed, while the draft itself stays readable as the record of what was ordered and what arrived

### AC-22 (US-05, US-07, US-09) — authorization

**Given** an authenticated Warehouse Member of a Warehouse whose Role carries `PURCHASE_DRAFTS:WATCH` but none of `PURCHASE_DRAFTS:CREATE`, `PURCHASE_DRAFTS:READY`, or `PURCHASE_DRAFTS:RECEIVE`
**When** the member attempts to create a Purchase Draft, move one to Ready for Ordering, or confirm its arrival
**Then** the system denies each attempt, changes nothing, and the member continues to be able to read the drafts their Role does permit

### AC-23 (US-01, US-05, US-11) — cross-context

**Given** a Warehouse that has been archived while it holds Items, Unfulfilled Customer Orders, and Purchase Drafts
**When** a Warehouse Member who holds a membership in it attempts to record demand, assemble a draft, or confirm an arrival there
**Then** the system denies every attempt because an archived Warehouse authorizes no operation that changes the resources it owns, while a member whose Role carries the matching watch Permission reads its recorded demand and drafts exactly as before archiving, and a member whose Role carries no such Permission is refused the read exactly as before archiving

### AC-24 (US-14) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:DISCARD` and a Purchase Draft of their Warehouse in the Draft state
**When** the member discards it
**Then** the system records the draft as discarded together with the acting member and the time, stops presenting it among the drafts being worked on and as Coverage against any demand, and leaves every Customer Order its lines linked to exactly as it was

### AC-24a (US-14) — domain invariant

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:DISCARD` and a Purchase Draft in Ready for Ordering
**When** the member attempts to discard it
**Then** the system blocks the attempt and tells the member that a draft that has been made ready is closed with a reason rather than discarded, because it records what the supplier was told

## 6. Non-functional requirements

| Aspect                           | Target                                                                                                                                                                                                                                                                                                                                                     | Measurement                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Authorization evaluation         | Authorization stage p95 ≤ 50 ms per protected operation this feature introduces                                                                                                                                                                                                                                                                            | Structured server timing logs                          |
| Consolidated demand read latency | p95 ≤ 400 ms at the §1 scale, including the derived Demand Lines, their Coverage, and On-hand Quantity, excluding client network time                                                                                                                                                                                                                      | Structured server timing logs                          |
| Item and draft read latency      | p95 ≤ 250 ms, excluding client network time                                                                                                                                                                                                                                                                                                                | Structured server timing logs                          |
| Mutation latency                 | p95 ≤ 500 ms for recording demand, adjusting On-hand Quantity, and every Purchase Draft change, excluding client network time                                                                                                                                                                                                                              | Structured server timing logs                          |
| Protected-operation throughput   | ≥ 50 operations per second per running service instance for 10 minutes                                                                                                                                                                                                                                                                                     | Automated load smoke test                              |
| Arrival atomicity                | 100% of Arrival Confirmations record the received quantity of every line, every Allocation, and the resulting Outstanding Quantity of every Customer Order assigned to together, or record none of them; a line where nothing arrived records nothing received                                                                                             | Integration checks                                     |
| Frozen-record integrity          | 0 recorded changes to the lines, ordered quantities, links, Expected Arrival Date, or Pre-receipt Requirements of a Purchase Draft after it reaches Ready for Ordering. The received quantities, Allocations, closure reason, and Closed state that Arrival Confirmation and closure write are the only permitted additions and are not counted as changes | Integration checks and automated architecture checks   |
| Demand-derivation freshness      | A recorded, amended, cancelled, or Fulfilled Customer Order is reflected in the consolidated demand and in the Drift Signal of every linked frozen draft on the next read; 0 reads of superseded demand                                                                                                                                                    | Integration checks                                     |
| Authority staleness              | 0 authorization decisions made from Roles, Permissions, or Warehouse memberships held outside the request being authorized — each decision re-reads them from the store                                                                                                                                                                                    | Automated architecture checks and integration checks   |
| Authorization coverage           | 100% of the user-accessible capabilities this feature introduces have an explicit Permission rule and Warehouse ownership check, reads included                                                                                                                                                                                                            | Automated architecture and integration coverage checks |

## 6.1 Security / privacy

- **Data classification:** confidential — a Warehouse's Customer Orders reveal who its customers are, what they buy, in what volume, and when, which is the commercially sensitive core of a small operator's business and the first data of that kind in the product.
- **Personal data touched:** newly introduced. A Customer Order carries a customer name, which for a sole trader or a private buyer is personal data, together with a needed-by date that links that person to a transaction. No contact details, address, or payment data are introduced, and no customer record exists outside the Customer Orders that name it.
- **AuthZ/AuthN impact:** adds Warehouse-level capabilities under the existing model without changing it. Every key below is a Warehouse Permission, because the subject of every one of them is a resource a Warehouse owns; the protected Warehouse Manager Role receives all of them, members cannot create or rename Permission keys, and every read is protected on the same terms as every write.

  | Permission key            | Capability                                                            | Exercised by                        |
  | ------------------------- | --------------------------------------------------------------------- | ----------------------------------- |
  | `ITEMS:WATCH`             | Read and search the Warehouse's Items                                 | AC-06a                              |
  | `ITEMS:CREATE`            | Add an Item with a SKU unused in the Warehouse                        | AC-06, AC-07, AC-07a                |
  | `ITEMS:UPDATE`            | Correct an Item's description or unit of measure                      | AC-06b, AC-06c                      |
  | `ITEMS:DEACTIVATE`        | Deactivate or reactivate an Item                                      | AC-06d                              |
  | `ITEM_STOCK:ADJUST`       | Change an Item's On-hand Quantity with a reason                       | AC-08, AC-09, AC-09a                |
  | `CUSTOMER_ORDERS:WATCH`   | Read Customer Orders, the consolidated demand, and their Coverage     | AC-04, AC-05, AC-17a, AC-20, AC-21a |
  | `CUSTOMER_ORDERS:CREATE`  | Record a customer's demand                                            | AC-01, AC-02, AC-02a, AC-03         |
  | `CUSTOMER_ORDERS:UPDATE`  | Amend a Customer Order's quantity or needed-by date                   | AC-19, AC-19b                       |
  | `CUSTOMER_ORDERS:CANCEL`  | Cancel a Customer Order with a reason                                 | AC-19a                              |
  | `PURCHASE_DRAFTS:WATCH`   | Read the Warehouse's Purchase Drafts and their Drift Signals          | AC-16a, AC-22                       |
  | `PURCHASE_DRAFTS:CREATE`  | Assemble a Purchase Draft and link its lines to demand                | AC-10, AC-11, AC-11a, AC-22         |
  | `PURCHASE_DRAFTS:UPDATE`  | Change an unfrozen draft's lines, links, and Pre-receipt Requirements | AC-10a, AC-12, AC-13                |
  | `PURCHASE_DRAFTS:READY`   | Move a draft to Ready for Ordering, freezing it                       | AC-14, AC-14a, AC-15, AC-22         |
  | `PURCHASE_DRAFTS:RECEIVE` | Confirm arrival and allocate what arrived                             | AC-17, AC-17b, AC-18, AC-18a, AC-22 |
  | `PURCHASE_DRAFTS:CLOSE`   | Close a frozen draft with a reason                                    | AC-21                               |
  | `PURCHASE_DRAFTS:DISCARD` | Discard a draft that was never made ready                             | AC-24, AC-24a                       |

- **Abuse cases:**
  - Cross-Warehouse demand reach: deny any attempt to read, link to, or draft against the Items and Customer Orders of a Warehouse the actor is not acting in, even when they hold a membership in it and the matching Permission there, and do not disclose that the target exists.
  - Customer disclosure through denial: a denial names no customer, Item, quantity, or date, so a member without `CUSTOMER_ORDERS:WATCH` cannot learn the customer list by probing.
  - Scope leaking into free text: the Value-adding Note, the adjustment reason, and the cancellation and closure reasons are presented as statements about goods, and prices, supplier contacts, and payment terms recorded there exist outside every handling this specification assumes; each is treated as confidential data of the same classification as the record that carries it, and text submitted into any of them is rendered as text and never as markup or a link.
  - On-hand as unaudited fiction: every change to On-hand Quantity records the acting member, the time, and a reason, so a figure that drifts can at least be explained; no operation changes it silently, Arrival Confirmation included.
  - Allocation as a back door onto a frozen record: Arrival Confirmation writes only received quantities, Allocations, and the move to Closed, and a member holding `PURCHASE_DRAFTS:RECEIVE` cannot reach the frozen lines, ordered quantities, links, Expected Arrival Date, or Pre-receipt Requirements through it.
  - Draft and demand spam: recording demand, creating drafts, and adjusting On-hand Quantity are rate limited to 60 recorded changes per minute per member, and a denial from that limit reveals nothing about existing records.
  - Acting in an archived Warehouse: an archived Warehouse authorizes none of the capabilities above that change what it holds, regardless of retained memberships and Permissions, while the watch capabilities keep authorizing reads of it on exactly the Permission terms that applied before archiving — archiving withdraws a Warehouse from operation without either withdrawing the account of what happened in it or widening who may read that account.
- **Security review:** Required, because the feature introduces personal data for the first time, raises the product's data classification to confidential, and adds the first capabilities whose subject is business rather than access data.

## 7. Metrics / KPIs

This repository adds no telemetry, so each figure below names the source it is actually read from. "Operator query" means a query an operator runs against the deployment's own records on demand; it is not instrumentation and nothing is collected continuously.

- **Frozen drafts that never resolve** — baseline: 0 drafts exist; target: the count of Purchase Drafts in Ready for Ordering whose Expected Arrival Date has passed, together with those carrying no Expected Arrival Date that were frozen more than 30 days before the reading, does not grow between two consecutive monthly readings during the first 90 days. Source: operator query, read monthly. A count that only ever rises means the loop is not being closed and is the earliest sign this feature has failed, whatever else looks healthy.
- **Demand aggregation ratio** — baseline: not measured, one row per back order by definition today; target: Demand Lines number ≤ 60% of the Unfulfilled Customer Orders they derive from, at the 60-day reading. Source: operator query, read at 30 and 60 days. A ratio approaching one means the same physical good is being entered under several Items and the consolidated view is not consolidating anything.
- **Drafts reaching Arrival Confirmation** — baseline: 0%; target: ≥70% of Purchase Drafts that reached Ready for Ordering are afterwards either confirmed as arrived or closed with a reason, at the 90-day reading. Source: operator query, read at 90 days.
- **Demand covered by a recorded draft** — baseline: 0% of Unfulfilled Customer Orders are linked to anything; target: ≥50% of Unfulfilled Customer Orders older than seven days are linked to at least one Purchase Draft Line, at the 90-day reading. Source: operator query, read at 90 days.
- **Cross-Warehouse and authorization incidents** — baseline: 0 under the boundaries this feature adopts; target: 0 at all times, counted as reads or changes of one Warehouse's Items, Customer Orders, or Purchase Drafts from a request acting in another, and 0 coverage failures in which a capability this feature introduces is presented to a member lacking its Permission. Source: automated coverage-check results, integration-check results, and support reports.
- **Frozen-record violations** — baseline: 0; target: 0 Purchase Drafts whose frozen lines, ordered quantities, links, Expected Arrival Date, or Pre-receipt Requirements differ from what was frozen at Ready for Ordering, at all times. The received quantities, Allocations, and closure written afterwards are not violations. Source: integration-check and automated architecture-check results.

## 8. Open questions

- [ ] Should a Warehouse be prevented from being archived while it holds Purchase Drafts in Ready for Ordering whose goods a member has already ordered by phone? This spec accepts the approved `workspaces` rule as it stands, which AC-23 describes: archiving succeeds and the drafts afterwards authorize nothing, so goods can arrive at a site that can no longer record them. Changing that is an amendment to `workspaces` AC-11, not a decision inside this feature. Default now: leave AC-23 as the accepted behaviour and raise the question upstream. — owner: `workspaces` owner (Tech Lead), due: before `design`
- [ ] How is the manager-maintained On-hand Quantity reconciled when the Stock Movement ledger later lands — superseded outright, or migrated as an opening Movement — and does this release change the roadmap ordering that places Items, Locations, and Stock after it? §1 and the glossary deliberately leave this open rather than asserting supersession. Default now: superseded outright, with the introducing release converting each figure into one opening Movement. — owner: PM, due: before `design`
- [ ] Is merging two Items that turn out to name the same physical good in scope, or a later data-repair capability? The pick-or-create rule reduces fragmentation but does not prevent it, and the demand aggregation KPI in §7 is the trigger that would reveal it. Default now: out of scope for this release, recorded as such in the glossary. — owner: PM, due: before `tasks`
- [ ] Does the Value-adding Note need structure — per linked Customer Order rather than per Purchase Draft Line — so that two customers needing different labelling on one line can be expressed without contradiction? Default now: free text at the line, with the member splitting the line when the customers differ. — owner: PM, due: before `design-ui`
- [ ] How do the arrival, amendment, and freeze seams behave when two members act at once — two members confirming the arrival of one Purchase Draft, one member amending or cancelling a Customer Order while another is assigning against it, or two members moving one draft to Ready for Ordering? The §6 arrival-atomicity target fixes all-or-nothing within a single confirmation but says nothing about isolation between two of them, so AC-18's bounds could each pass on stale reads. Default now: the bounds in AC-18 and AC-19b are re-checked at the moment the change is recorded rather than when the member composed it, and the second of two competing frozen-state transitions is refused rather than merged. — owner: Tech Lead, due: before `design`
- [ ] Does a Customer Order need a customer identifier of any kind beyond the typed name, so that everything one customer is waiting for can be seen together? Default now: a typed name only, which keeps the personal data introduced to a minimum. — owner: PM, due: before `data-model`
- [ ] Should each ordering endpoint's refusal codes be mapped to distinct dialog copy, or bound to the field that explains them with `fieldErrorsForCode` beside the endpoint? Eight of the nine new dialogs use `onRefusal` as a boolean and render one fixed sentence, so a taken SKU, a quantity below what is allocated, and a frozen draft are indistinguishable; `ConfirmArrivalDialog` shows the conforming shape. Deferred from `/code-review-front-end` 2026-08-26 (advisory; `docs/system/guides/web-error-handling.md` §5, §3). — owner: Frontend Lead, due: before `ship`
- [ ] Is the Customer Order picker plus the four unused purchase-draft mutation hooks (`useCreatePurchaseDraftMutation`, `useRevisePurchaseDraftMutation`, `useAddPurchaseDraftLineMutation`, `useAddPurchaseDraftLineLinkMutation`) wired to the assembly path this release, or removed together with the `sad.md` §5 surface claim? Deferred from `/code-review-front-end` 2026-08-26 (advisory; `docs/system/guides/writing-web-components.md` §9). Tied to the unwired assembly path raised for `/review`. — owner: Frontend Lead, due: before `ship`
- [ ] Should `ItemDirectory` be split so the mutation bindings and dialog lookup leave the list/table rendering? It stands at 242 lines and seven hook calls, crossing two of the §2 budgets at once; the private-helper extraction fixed in the same pass addresses part of it. Deferred from `/code-review-front-end` 2026-08-26 (advisory; `docs/system/guides/writing-web-components.md` §2, §3). — owner: Frontend Lead, due: before `ship`
- [ ] Should `useItems()` move into `ItemPicker` so `modules/item` stops declaring a hook beside the view that consumes it? `RecordCustomerOrderDialog` currently calls it and threads the array down as a prop, which forces the extra surface entry. Deferred from `/code-review-front-end` 2026-08-26 (advisory; `docs/system/guides/placing-web-hooks.md` §4, `docs/system/guides/adding-a-web-module.md` §2). — owner: Frontend Lead, due: before `ship`
- [ ] Should `apps/web/vite.config.ts` alias `@warehouser/contracts/customer-orders` and `/purchase-drafts` to `packages/contracts/src` as it already does for `items`, `access`, `auth`, `users` and `workspaces`? Today those two resolve through `dist/`, so a schema change is invisible to the dev server and vitest until the package is rebuilt. Deferred from `/code-review-front-end` 2026-08-26 (advisory; `docs/system/guides/adding-and-using-contracts.md` §4). — owner: Frontend Lead, due: before `ship`
- [ ] Should `customer-order-api.spec.ts`'s import of `modules/item/api/item-api` go through the declared `useItems` surface entry, or be enumerated the way `PERMITTED_TEST_ONLY_COUPLINGS` records the existing test-only crossing? The boundary spec's production-only scan lets it pass silently today. Deferred from `/code-review-front-end` 2026-08-26 (advisory; `docs/system/guides/adding-a-web-module.md` §2). — owner: Frontend Lead, due: before `ship`
- [ ] Should `purchase-drafts/module-boundaries.spec.ts` assert the cross-module edge it is named for, and should `items/` gain the equivalent spec? It currently only regex-matches provider and export names inside its own `usecase.module.ts`, so it says nothing about how `purchase-drafts` reaches `customer-orders` — the one live cross-module edge in this change — while `customer-orders/module-boundaries.spec.ts` does assert the reverse direction, and `items/` has no boundary spec at all. Deferred from `/code-review-back-end` 2026-08-27 (advisory; `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` §Alternatives, §Decision "Public surface"). — owner: Backend Lead, due: before `ship`
- [ ] Should `write-rate-limit-cross-module.integration.spec.ts` move from `customer-orders/rest/controllers/` to `shared/guards/`, beside the `write-rate-limit-http-contract.integration.spec.ts` that already lives there? It covers `shared/guards/write-rate-limit.{counter,guard}.ts`, not the controller it is filed under; the in-file comment gives a historical rather than an architectural reason. Deferred from `/code-review-back-end` 2026-08-27 (advisory; `docs/system/server-architecture.md` §Testing). — owner: Backend Lead, due: before `ship`
