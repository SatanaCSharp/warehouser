---
status: Draft
owner: 'PM + Tech Lead'
reviewers: ['Tech Lead', 'Security Lead']
updated_at: '2026-09-01'
feature_size: 'L'
---

# Spec — delivery-addresses

> **Glossary:** [CONTEXT](./CONTEXT.md), [ordering CONTEXT](../ordering/CONTEXT.md), [workspaces CONTEXT](../workspaces/CONTEXT.md), [access CONTEXT](../access/CONTEXT.md)
> **Reference module / docs / channels used:** `docs/features/ordering/spec.md`, `docs/features/ordering/CONTEXT.md`, `docs/features/ordering/data-model.md`, `docs/features/workspaces/CONTEXT.md`, `docs/features/access/spec.md`, `docs/system/server-index.md`, `docs/system/web-index.md`, `docs/system/architecture-map.md`, `docs/roadmap.md`, and the `apps/server/src` ordering module inventory.

## 1. Context

Warehouser now knows who is waiting for goods, and it does not know where they have to go. The `ordering` release gave a Warehouse Member a Customer Order, a consolidated Demand Line, and a Purchase Draft that records what was told to a supplier — but the customer on that order is a name typed by hand, so "Acme", "ACME Ltd" and "acme" are three unrelated customers and not one of them has an address anywhere in the product. A Purchase Draft Line says what to order and how it must be packed and never says where the supplier should send it; that is said on the phone and disappears the moment the call ends. And the flow has exactly one ending: goods arrive at our own Warehouse. Since Warehouser treats the Warehouse as a cross-docking point, whose Transit Zone is near empty by design, the obvious question is why some of those goods need to touch the building at all — and today there is no way to say "supplier, ship this one straight to the customer." Making the customer a record does not by itself collapse those three spellings — nothing here merges names a member typed differently — but it gives them one thing to be chosen from instead of retyped, and §7 measures whether that turns out to be enough.

This is the release to correct it, because `ordering` has just landed the two records this attaches to and almost no operational history has accumulated behind them yet. `ordering`'s own open questions already ask whether a Customer Order needs a customer identifier beyond the typed name; answering that now costs a new record beside an empty table, and answering it in a year costs a reconciliation of every name anyone ever typed. The same argument applies to the Warehouse itself, which is presently a name and nothing else: a member cannot give a supplier a delivery point for their own site, which makes the ordinary Via Warehouse case just as unrecorded as the new one.

The committed approach is to make the Delivery Address a first-class property of both demand and supply, and to make the frozen order accountable for it. Setting a delivery mode per order line and keeping directly-shipped goods out of on-hand quantity is what the market already does — Odoo chooses the route per line rather than per document, NetSuite excludes drop-ship lines from on-hand and from inventory-asset accounting, and Zoho refuses receipts against a drop-shipped order entirely — so that part of this feature is a well-trodden path rather than an invention, and the risk in it is low. What no studied product does is notice when the customer's address changes after the purchase document is committed: Business Central and Epicor leave it silently unenforced, and one open-source ERP carries an open defect where the customer address fails to copy onto the drop-ship order at all. This feature therefore spends its novelty in two places. The first is the refusal: a Direct to Customer line is refused any link to demand going somewhere else, and once frozen it reports Address Drift when the demand's Delivery Address moves out from under it. The second is the ending: because a dock arrival and a direct delivery on one draft fall on different days, each line's ending is recorded when its own goods land and the draft closes once every line has one, replacing the single whole-draft act `ordering` shipped. Both depart from shapes `ordering` settled, and §8 carries both back as amendments rather than leaving them asserted here.

Five boundaries are stated here so they are not re-derived downstream. First, a Customer and its Delivery Addresses are Warehouse-scoped exactly as Items, Customer Orders and Purchase Drafts are, so an organization running two sites for the same company maintains that company's address at each site separately; sharing them across a Workspace is an explicit non-goal and the duplicate-maintenance cost it leaves is accepted rather than overlooked. Second, the strictness of the Direct to Customer linking rule is deliberate and is the one place this product overrules a member's judgement: everywhere else a link claims nothing and no quantity has to reconcile, because a human is making a planning decision the system has no standing to arbitrate, whereas goods delivered to one company's depot cannot simultaneously be at another's, which is not a decision but a physical fact. This deliberately narrows the fourth boundary `ordering` settled — that "linking is deliberately loose" — for one delivery mode only. It is one of four amendments this feature makes to an approved specification: the second crosses `ordering`'s non-goal that excluded recording goods reaching the end customer, the third replaces its once-per-draft closure with an ending recorded per line, and the fourth extends its Demand Snapshot to carry the Delivery Address each linked Customer Order was going to, without which a frozen line has nothing to compare against and Address Drift cannot be reported at all. None is a detail of this feature, so all four are named in §8 to be carried back rather than left implicit here. Third, the Delivery Address and the delivery mode freeze with the rest of the line at Ready for Ordering and are never edited afterwards, because the Delivery Address is arguably the most consequential thing the member told the supplier and the draft's whole value is that it says what was actually ordered; drift is reported against it and never resolved into it. Fourth, the §6 targets assume an order of magnitude of roughly 500 Customers and 1 500 Delivery Addresses per Warehouse alongside the volumes `ordering` already assumes, at which every list this feature presents is returned whole rather than in pages; outgrowing that scale is the explicit trigger to revisit §6 and introduce paging, not a silent regression against these targets. Fifth, the work is not confined to new records: bringing customer identity under its own Permission means retrofitting the surfaces that already carry a customer name, expressing that requirement at all may mean the authorization stage has to evaluate more than one required Permission per operation, and the closure model changes for every Purchase Draft rather than only for those holding a directly-shipped line. The feature is sized L on the understanding that all three are in scope; if `design` finds the authorization-stage change larger than one feature can absorb, that is the trigger to re-classify rather than to quietly narrow the boundary.

## 2. Goals

- Make a customer a record a Warehouse maintains once, carrying the places its goods may be sent, so that everything one customer is waiting for can be answered in one place instead of by scrolling a list and comparing spellings.
- Make every line of an order to a supplier state where its goods travel and by which of the two routes, so that what the member read down the phone survives in the record rather than only in their memory.
- Announce it while the goods are still in motion when a frozen line's Delivery Address has stopped matching where the demand behind it now goes, so that a shipment heading to the wrong site is a phone call rather than a loss.

## 3. Non-goals

- Locations, Stock balances, Stock Movements, and put-away are excluded because a Delivery Address answers where goods travel to while a Location answers where they were put inside the building, and the second question depends on a movement ledger this release still does not have.
- Suppliers as records, supplier addresses, and electronic exchange with a supplier are excluded because a Delivery Address is where goods go rather than who sends them, and the supplier relationship remains a conversation the member holds outside the product.
- Dispatching Via Warehouse goods onward to the customer, carriers, tracking, and shipping cost are excluded because this release records where goods were sent and that they arrived, and modelling the journey between those two facts is a capability with its own authorization surface. Recording that a directly-shipped line reached the customer does cross `ordering`'s non-goal that this release "ends where the goods arrive", which §8 carries back as an amendment; what stays excluded is the journey itself.
- Address validation, geocoding, maps, and distance are excluded because an address here is text a member types for a human driver to read, and interpreting it would import an external dependency for no decision this product makes.
- Proof that a Direct Delivery actually happened is excluded because, exactly as with a Pre-receipt Requirement, the member records what they know and this release provides no inspection step that could contradict them.
- Sharing Customers across the Warehouses of one Workspace, and merging two Customers that turn out to name one company, are excluded because the subject of every operation here is a resource one Warehouse owns, and a merge is a data-repair capability with invariants of its own.

## 4. User stories

### US-01: Keep a customer once

**As a** Warehouse Member permitted to create Customers
**I want** to record a customer as a named record of my Warehouse rather than typing their name onto each order
**So that** the same company stops fragmenting across three spellings

### US-02: Keep a customer's delivery addresses

**As a** Warehouse Member permitted to update Customers
**I want** to record the places one customer's goods may be sent and mark one of them as their main one
**So that** an address is looked up rather than remembered

### US-03: Retire a customer or an address

**As a** Warehouse Member permitted to deactivate Customers
**I want** to deactivate a Customer or a single Delivery Address that should no longer be used
**So that** a closed site stops being offered without disturbing the orders that already name it

### US-04: See everything one customer awaits

**As a** Warehouse Member permitted to watch Customers
**I want** to open one customer and see every order they are still waiting for, with the item, the quantity, the date and where it is going
**So that** I can answer their phone call without scrolling the demand list

### US-05: Give my own warehouse an address

**As a** Workspace Member permitted to maintain the Warehouse record
**I want** to record my own site's Delivery Address and the access notes a driver needs
**So that** I can actually give a supplier a delivery point for goods coming to me

### US-06: Say where a customer's order goes

**As a** Warehouse Member permitted to create Customer Orders
**I want** to pick the customer from a list and state which of their addresses this particular order goes to, and to redirect it to another of their addresses while it is still outstanding
**So that** the Delivery Address is decided when the demand is recorded rather than when the truck is loaded

### US-07: Choose how each line travels

**As a** Warehouse Member permitted to update Purchase Drafts
**I want** to set each draft line to come to my warehouse or to ship straight to the customer, with every new line starting as Via Warehouse travelling to my own Warehouse Delivery Address
**So that** the ordinary case stays one click and the exception is still expressible

### US-08: Keep a direct line honest

**As a** Warehouse Member permitted to update Purchase Drafts
**I want** the system to refuse to link a directly-shipped line to demand going somewhere else
**So that** I cannot promise one pallet to two addresses

### US-09: Freeze where the goods were sent

**As a** Warehouse Member permitted to move a Purchase Draft to Ready for Ordering
**I want** each line's Delivery Address and delivery mode to become unchangeable at that moment
**So that** the record of what I told the supplier survives whatever the customer does next

### US-10: Learn the address stopped being right

**As a** Warehouse Member permitted to watch Purchase Drafts
**I want** to be told when a linked customer order is now going somewhere other than the frozen line ships to
**So that** I can redirect a shipment while it is still moving

### US-11: Confirm each line's ending

**As a** Warehouse Member permitted to confirm arrivals
**I want** to record goods arriving at my dock and goods reaching the customer directly, each against the lines that travelled that way
**So that** both kinds of line reduce what those customers are waiting for

### US-12: Separate my dock from what ships direct

**As a** Warehouse Member permitted to watch Purchase Drafts
**I want** to see what is landing at my dock apart from what is shipping direct
**So that** I prepare only for the goods I actually have to handle

## 5. Acceptance criteria

### AC-01 (US-01) — happy

**Given** an authorized Warehouse Member holding `CUSTOMERS:CREATE` in a Warehouse
**When** the member records a Customer with a name not yet used in that Warehouse and one Delivery Address
**Then** the system records the Customer in that Warehouse as active with that address as its Main Delivery Address, together with the member who recorded it and when, and the Customer becomes selectable when demand is recorded

### AC-02 (US-01) — error

**Given** an authorized Warehouse Member holding `CUSTOMERS:CREATE`
**When** the member records a Customer whose name is empty or only spaces, or a Delivery Address whose text is empty
**Then** the system blocks the record, changes nothing, and tells the member in plain language which value it will not accept

### AC-03 (US-01) — domain invariant

**Given** an authorized Warehouse Member holding `CUSTOMERS:CREATE` in a Warehouse that already holds a Customer with a given name, whether that Customer is active or Inactive
**When** the member attempts to record a second Customer with that same name in the same Warehouse
**Then** the system blocks the record and tells the member that a customer name identifies at most one Customer within a Warehouse, naming the Customer that already holds it

### AC-03a (US-01) — cross-context

**Given** two Warehouses of one Workspace, the first of which holds a Customer with a given name
**When** an authorized Warehouse Member holding `CUSTOMERS:CREATE` in the second Warehouse records a Customer with that same name there
**Then** the system records it as an unrelated Customer with its own Delivery Addresses, because a customer name is unique within a Warehouse and never across them

### AC-03b (US-01) — happy

**Given** an authorized Warehouse Member holding `CUSTOMERS:UPDATE` and a Customer that Customer Orders and frozen Purchase Draft Lines already name
**When** the member corrects that Customer's name to one unused in that Warehouse
**Then** the system records the correction, and every Customer Order and every frozen line that named the Customer continues to name the same Customer

### AC-03c (US-01) — domain invariant

**Given** an authorized Warehouse Member holding `CUSTOMERS:UPDATE` and two Customers of their Warehouse
**When** the member attempts to correct the first Customer's name to the name the second already holds, whether that second Customer is active or Inactive
**Then** the system blocks the correction, leaves the Customer exactly as it was, and tells the member that a customer name identifies at most one Customer within a Warehouse

### AC-04 (US-02) — happy

**Given** an authorized Warehouse Member holding `CUSTOMERS:UPDATE` and a Customer of their Warehouse with one Delivery Address
**When** the member adds a second Delivery Address with its access notes and marks it as the Main one
**Then** the system records both addresses against that Customer, makes the second one Main and the first one no longer Main, and offers both wherever a Delivery Address is chosen

### AC-05 (US-02) — domain invariant

**Given** an authorized Warehouse Member holding `CUSTOMERS:UPDATE` and a Customer with several active Delivery Addresses
**When** the member opens that Customer
**Then** exactly one of its active Delivery Addresses is its Main Delivery Address, and a member changes which by marking another as Main

### AC-06 (US-03) — happy

**Given** an authorized Warehouse Member holding `CUSTOMERS:DEACTIVATE` and an active Customer that Customer Orders already name, some of them Unfulfilled
**When** the member deactivates that Customer
**Then** the system records it as Inactive whether or not it is still waiting for goods, stops offering it when demand is recorded, keeps every Customer Order that already names it readable and counting exactly as before, leaves every one of its Delivery Addresses in the state it was already in, keeps its name taken so no new Customer may reuse it, and lets the member make it active again

### AC-06a (US-03) — happy

**Given** an authorized Warehouse Member holding `CUSTOMERS:UPDATE` and a Customer with two active Delivery Addresses, one of which frozen Purchase Draft Lines and Customer Orders already name
**When** the member deactivates that Delivery Address
**Then** the system records it as Inactive, stops offering it when a Delivery Address is chosen, and leaves every Customer Order and every frozen Purchase Draft Line that already names it reading and counting exactly as before

### AC-06b (US-03) — happy

**Given** an authorized Warehouse Member holding `CUSTOMERS:UPDATE` and a Customer with three active Delivery Addresses, one of which is its Main Delivery Address
**When** the member deactivates the Main one
**Then** the system records it as Inactive, makes one of the remaining active addresses that Customer's Main Delivery Address, and tells the member which address is now the Main one

### AC-07 (US-03) — domain invariant

**Given** an authorized Warehouse Member holding `CUSTOMERS:UPDATE` and a Customer whose only remaining active Delivery Address is the one they are deactivating, whether or not that Customer has Unfulfilled Customer Orders
**When** the member attempts to deactivate it
**Then** the system blocks the change and tells the member that a Customer always keeps at least one active Delivery Address, so the member adds the replacement address first and deactivates the old one afterwards

### AC-08 (US-04) — happy

**Given** an authorized Warehouse Member holding `CUSTOMERS:WATCH` and a Customer with Unfulfilled Customer Orders across several Items and two Delivery Addresses
**When** the member opens that Customer
**Then** the system shows every Unfulfilled Customer Order of that Customer with its Item, its Outstanding Quantity, the date it is needed by, and the Delivery Address it is going to, and omits its Fulfilled and cancelled Customer Orders

### AC-09 (US-04) — authorization

**Given** an authenticated Warehouse Member of a Warehouse whose Role does not carry `CUSTOMERS:WATCH`
**When** the member attempts to open the Customers of that Warehouse, or a single Customer
**Then** the system denies the request, shows no customer name, address, quantity, or Item, presents no count of how many Customers exist, and the denial does not reveal whether any Customer exists

### AC-09a (US-04, US-10) — authorization

**Given** an authenticated Warehouse Member whose Role carries `PURCHASE_DRAFTS:WATCH` and `CUSTOMER_ORDERS:WATCH` but not `CUSTOMERS:WATCH`
**When** the member opens a Purchase Draft, its Address Drift, or the consolidated demand
**Then** the system withholds every customer name those surfaces would otherwise carry — the name of a Customer and the name typed onto a Customer Order that names no Customer alike — together with the Delivery Addresses and access notes, presents no count from which the member could infer them, and continues to show that member everything their own Permissions do admit

### AC-10 (US-05) — happy

**Given** an authorized Workspace Member holding `WAREHOUSES:ADDRESS_UPDATE` over a Warehouse of their Workspace that has only a name
**When** the member records that Warehouse's own Delivery Address together with its access notes
**Then** the system records both against the Warehouse as its one Delivery Address, that address is what a Via Warehouse Purchase Draft Line is shown as travelling to, and the member may correct it in place afterwards but never deactivate it

### AC-11 (US-06) — happy

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:CREATE` and `CUSTOMERS:WATCH`, and a Customer of their Warehouse with a Main Delivery Address and a second active one
**When** the member records a Customer Order naming that Customer and either states no Delivery Address or states the second address
**Then** the system records the Customer Order against the Customer with the Main Delivery Address in the first case and the stated one in the second, and the consolidated demand shows the Delivery Address of each alongside everything it showed before

### AC-11a (US-06) — happy

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:CREATE` whose Warehouse holds Customers
**When** the member records a Customer Order by typing a customer name instead of naming a Customer
**Then** the system records the Customer Order with that typed name and no Delivery Address, counts it in the consolidated demand exactly as an order naming a Customer is counted, and creates no Customer and matches none for it

### AC-11b (US-06) — happy

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:UPDATE` and `CUSTOMERS:WATCH`, and an Unfulfilled Customer Order naming a Customer with a second active Delivery Address
**When** the member redirects that Customer Order to the second address
**Then** the system records the Customer Order as going to that address, keeps it against the same Customer, and reports Address Drift on every frozen Purchase Draft Line linked to it that was frozen expecting the previous address

### AC-11c (US-06) — error

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:UPDATE` and `CUSTOMERS:WATCH`
**When** the member attempts to redirect a Customer Order to a Delivery Address of another Customer, or to an Inactive Delivery Address, or attempts to redirect a Customer Order that is already Fulfilled or cancelled
**Then** the system blocks the change, changes nothing, and tells the member that an outstanding Customer Order is redirected only to another active Delivery Address of the Customer it already names, so serving a different customer means recording a new Customer Order

### AC-12 (US-06) — cross-context

**Given** an authorized Warehouse Member who belongs to two Warehouses of one Workspace, holds `CUSTOMER_ORDERS:CREATE` in both, and is acting in the first of them
**When** the member records a Customer Order naming a Customer or a Delivery Address that exists only in the second Warehouse
**Then** the system refuses the record and does not disclose that the Customer or the address exists elsewhere, because demand names a Customer of the Warehouse the request applies to

### AC-13 (US-07) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:UPDATE` and `CUSTOMERS:WATCH`, and a Purchase Draft of their Warehouse in the Draft state, in which every new line starts as Via Warehouse travelling to the Warehouse's own Delivery Address
**When** the member adds three lines and leaves them as they are, then sets two further lines to travel Direct to Customer naming one Customer's Delivery Address
**Then** the system records the first three as Via Warehouse travelling to the Warehouse Delivery Address and the last two as Direct to Customer travelling to the stated address, keeps all five on the one draft, and confirms it to the member

### AC-14 (US-07) — domain invariant

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:UPDATE` and a Purchase Draft Line in the Draft state
**When** the member attempts to set that line to Direct to Customer while naming the Warehouse's own Delivery Address as where its goods travel
**Then** the system blocks the change and tells the member that goods shipped to their own site are travelling Via Warehouse, so a Direct to Customer line names a customer's address

### AC-15 (US-08) — domain invariant

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:UPDATE` and a Direct to Customer Purchase Draft Line travelling to one Customer's Delivery Address
**When** the member attempts to link that line to a Customer Order going to any other Delivery Address, whether of the same Customer or another
**Then** the system blocks the link, records nothing of it, and tells the member that a directly-shipped line serves only the demand going to the address it ships to, naming the address each of the two is bound for

### AC-15a (US-08, US-09) — domain invariant

**Given** a Purchase Draft Line in the Draft state that was legitimately linked to its Customer Orders — either a Direct to Customer line linked to orders going to its own Delivery Address, or a Via Warehouse line linked to orders bound for several different Delivery Addresses
**When** a member afterwards revises that line's Delivery Address, or sets that line to Direct to Customer, or moves the draft to Ready for Ordering, while any of those Customer Orders is going to an address the line would not ship to
**Then** the system blocks that change or that transition and names every link that does not agree, withdrawing none of them, because the agreement between a directly-shipped line and its demand is required continuously and not only at the moment the link was made, and which link to withdraw is the member's decision

### AC-15b (US-08) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:UPDATE` and a Via Warehouse Purchase Draft Line
**When** the member links that line to Customer Orders bound for several different Delivery Addresses, and states link quantities that do not add up to the line quantity
**Then** the system records every link and adjusts no quantity, because everything on that line lands at one dock and any customer can be served from it, and coverage remains the member's decision

### AC-16 (US-09) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:READY` and a Purchase Draft in the Draft state holding both Via Warehouse and Direct to Customer lines
**When** the member moves the draft to Ready for Ordering
**Then** the system freezes each line's delivery mode and Delivery Address alongside the lines, quantities, links and Pre-receipt Requirements it already froze, records the Delivery Address as it read at that moment together with the Delivery Address each linked Customer Order was going to at that moment, and presents the draft as the record of what the supplier was told

### AC-16a (US-05, US-09) — error

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:READY` and a Purchase Draft holding a Via Warehouse line in a Warehouse whose own Delivery Address has never been recorded
**When** the member attempts to move that draft to Ready for Ordering
**Then** the system blocks the transition, changes nothing, and tells the member that a line coming to the warehouse cannot be frozen before the warehouse has an address to be delivered to, naming the capability that records it — while adding and revising lines on that draft continues to work as before

### AC-17 (US-09) — domain invariant

**Given** a Purchase Draft in Ready for Ordering
**When** any Warehouse Member, including the one who created it and the Warehouse Manager, attempts to change the delivery mode or the Delivery Address of one of its lines
**Then** the system blocks the change and tells the member that a draft is frozen once it is ready, because the Delivery Address is the most consequential thing the supplier was told and the record has to keep saying what was actually ordered

### AC-18 (US-10) — cross-context

**Given** a Purchase Draft in Ready for Ordering holding a line linked to a Customer Order, frozen together with the Delivery Address that Customer Order was going to at that moment
**When** that Customer Order is afterwards redirected to another Delivery Address
**Then** the system shows Address Drift against that line naming the Customer Order, the Delivery Address frozen for it, and the address the demand now expects, and leaves every frozen value of the draft exactly as it was

### AC-18a (US-10) — happy

**Given** a Warehouse holding frozen Purchase Drafts, one with Address Drift on a Direct to Customer line and one with the same drift on a Via Warehouse line
**When** an authorized Warehouse Member holding `PURCHASE_DRAFTS:WATCH` opens them
**Then** the system reports the drift on the directly-shipped line on the Purchase Draft list itself, where the member sees it without opening anything, because goods are travelling to an address nobody now expects them at, reports the drift on the line coming to the dock when that draft is opened, instructs the member in neither case and blocks nothing, and stops reporting either once the Customer Order is redirected back to the Delivery Address frozen for it

### AC-19 (US-11) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` and a Purchase Draft in Ready for Ordering holding one Via Warehouse line and one Direct to Customer line, whose goods reach the dock and the customer on different days
**When** the member records what arrived on the Via Warehouse line and assigns it across its linked Customer Orders, and afterwards records what the customer received on the Direct to Customer line and assigns that
**Then** the system records each line's ending with the acting member and the time, reduces what each named customer is still waiting for in both cases, leaves the draft in Ready for Ordering for as long as any of its lines still has no ending recorded, and moves it to Closed once every one of them has

### AC-20 (US-11) — error

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` and a Purchase Draft in Ready for Ordering holding lines of both delivery modes
**When** the member attempts to record an arrival at the warehouse against a Direct to Customer line, or a delivery to the customer against a Via Warehouse line
**Then** the system blocks the record, changes nothing, and tells the member which of the two ways that line's goods travelled

### AC-20a (US-11) — error

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` and a Purchase Draft Line whose ending has already been recorded
**When** the member attempts to record an ending against that line a second time
**Then** the system blocks the record, changes nothing, assigns nothing further to any Customer Order, and tells the member that this line's ending is already recorded, naming when and by whom

### AC-21 (US-11) — domain invariant

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:RECEIVE` who has just recorded both an arrival and a direct delivery on one Purchase Draft
**When** the member opens the Items of that draft
**Then** the On-hand Quantity of each is unchanged, because it moves only through an adjustment that states its reason — and the directly-shipped goods were never in the Transit Zone to be counted in the first place

### AC-22 (US-12) — happy

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:WATCH` in a Warehouse whose frozen Purchase Drafts hold lines of both delivery modes
**When** the member opens the Purchase Drafts of that Warehouse
**Then** the system separates the lines landing at that Warehouse's own Delivery Address from the lines shipping Direct to Customer, listing each line of a draft that holds both modes in whichever of the two its own delivery mode places it, so that a member preparing the dock sees only the goods they will physically handle

### AC-23 (US-01, US-06, US-11) — cross-context

**Given** a Warehouse that has been archived while it holds Customers, Delivery Addresses, and frozen Purchase Drafts carrying both delivery modes
**When** a Warehouse Member who holds a membership in it attempts to record a Customer, redirect a Customer Order, or record a line's ending there
**Then** the system denies every attempt because an archived Warehouse authorizes no operation that changes the resources it owns, while a member whose Role carries the matching watch Permission reads its Customers, addresses and drafts exactly as before archiving

### AC-24 (US-06) — happy

**Given** a Warehouse holding both Customer Orders that name a Customer and Customer Orders recorded with only a typed customer name
**When** an authorized Warehouse Member holding `CUSTOMER_ORDERS:WATCH` and `CUSTOMERS:WATCH` opens the consolidated demand
**Then** every Customer Order reads and counts alike, those naming a Customer show it with the Delivery Address they are going to while those recorded with a typed name show that name and no Delivery Address — that absence being what tells the member which kind of row they are looking at — and no Customer is created or matched for a typed name by the system

## 6. Non-functional requirements

| Aspect                         | Target                                                                                                                                                                                                                                                                                                                                                                                                      | Measurement                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Authorization evaluation       | Authorization stage p95 ≤ 50 ms per protected operation this feature introduces                                                                                                                                                                                                                                                                                                                             | Structured server timing logs                          |
| Customer read latency          | p95 ≤ 250 ms for the Customer list and for one Customer with everything they are waiting for, at the §1 scale, excluding client network time                                                                                                                                                                                                                                                                | Structured server timing logs                          |
| Demand and draft read latency  | p95 ≤ 400 ms for the consolidated demand and the Purchase Draft list once each carries its Delivery Address and delivery mode, excluding client network time — that is, no regression against the target `ordering` already holds                                                                                                                                                                           | Structured server timing logs                          |
| Mutation latency               | p95 ≤ 500 ms for recording a Customer, maintaining its Delivery Addresses, redirecting a Customer Order, and setting a line's delivery mode or Delivery Address, excluding client network time                                                                                                                                                                                                              | Structured server timing logs                          |
| Protected-operation throughput | ≥ 50 operations per second per running service instance for 10 minutes                                                                                                                                                                                                                                                                                                                                      | Automated load smoke test                              |
| Ending atomicity               | 100% of recorded endings write the line's quantity, every Allocation made from it, and the resulting Outstanding Quantity of every Customer Order assigned to, together or not at all; a line where nothing arrived or nothing was delivered records nothing assigned. This scopes to one line's ending the guarantee `ordering` held for a whole Arrival Confirmation, which the per-line model supersedes | Integration checks                                     |
| Frozen-address integrity       | 0 recorded changes to the delivery mode or Delivery Address of a Purchase Draft Line after its draft reaches Ready for Ordering; the recorded endings and the move to Closed are the only permitted additions and are not counted as changes                                                                                                                                                                | Integration checks and automated architecture checks   |
| Direct-line agreement          | 100% of Direct to Customer Purchase Draft Lines are linked only to Customer Orders naming the same Delivery Address, checked when a link is made, when the line is revised, and when the draft enters Ready for Ordering; 0 frozen lines violating it                                                                                                                                                       | Integration checks                                     |
| Address-drift freshness        | A redirected Customer Order is reflected in the Address Drift of every linked frozen draft on the next read; 0 reads of a superseded Delivery Address                                                                                                                                                                                                                                                       | Integration checks                                     |
| On-hand isolation              | 0 changes to any Item's On-hand Quantity arising from an arrival or a direct delivery recorded by this feature                                                                                                                                                                                                                                                                                              | Integration checks                                     |
| Authority staleness            | 0 authorization decisions made from Roles, Permissions, or Warehouse memberships held outside the request being authorized — each decision re-reads them from the store                                                                                                                                                                                                                                     | Automated architecture checks and integration checks   |
| Authorization coverage         | 100% of the user-accessible capabilities this feature introduces have an explicit Permission rule and Warehouse ownership check, reads included, and 100% of the pre-existing surfaces that carry customer identity are covered by the customer-read Permission                                                                                                                                             | Automated architecture and integration coverage checks |

## 6.1 Security / privacy

- **Data classification:** confidential, and materially more so than before. `ordering` introduced a customer's name; this feature adds where that customer physically is, plus the access notes — gate codes, opening hours, delivery windows — that describe how to get inside. Taken together with the demand already recorded, the data now says who buys what, in what volume, when, and at which door.
- **Personal data touched:** newly extended. A Delivery Address is personal data whenever the customer is a sole trader or a private buyer, and an access note may name a contact person or a gate code. The Warehouse's own Delivery Address and access notes are the operator's own premises data rather than a third party's, and are classified with the Warehouse record that carries them. No contact details beyond what a member types into an access note, and no payment data, are introduced.
- **AuthZ/AuthN impact:** adds Warehouse-level capabilities under the existing model without changing it, plus one Workspace-level capability. Reading customer identity requires its own Permission and is not implied by any ordering Permission — which means the pre-existing surfaces that already carry a customer name have to be brought under it too, not only the screens this feature adds.

  | Permission key              | Level     | Capability                                                             | Exercised by                                |
  | --------------------------- | --------- | ---------------------------------------------------------------------- | ------------------------------------------- |
  | `CUSTOMERS:WATCH`           | Warehouse | Read Customers, their Delivery Addresses, and what each is waiting for | AC-08, AC-09, AC-09a                        |
  | `CUSTOMERS:CREATE`          | Warehouse | Record a Customer with a name unused in the Warehouse                  | AC-01, AC-02, AC-03, AC-03a                 |
  | `CUSTOMERS:UPDATE`          | Warehouse | Correct a Customer's name and maintain its Delivery Addresses          | AC-03b, AC-03c, AC-04, AC-05, AC-06a, AC-07 |
  | `CUSTOMERS:DEACTIVATE`      | Warehouse | Deactivate or reactivate a Customer                                    | AC-06                                       |
  | `WAREHOUSES:ADDRESS_UPDATE` | Workspace | Record the Warehouse's own Delivery Address and access notes           | AC-10                                       |

  `WAREHOUSES:ADDRESS_UPDATE` sits at the Workspace level because the subject of the operation is the Warehouse record itself, which `workspaces` already settles as a Workspace Capability alongside renaming and archiving. Every other key above is a Warehouse Permission, because its subject is a resource the Warehouse owns. Setting a line's delivery mode and Delivery Address is exercised under the existing `PURCHASE_DRAFTS:UPDATE`, recording a Customer Order's Delivery Address under `CUSTOMER_ORDERS:CREATE` and `:UPDATE`, and recording a direct delivery under `PURCHASE_DRAFTS:RECEIVE`, because each is an aspect of a capability those keys already name.

- **Abuse cases:**
  - Cross-Warehouse customer reach: deny any attempt to read, name, or ship to the Customers and Delivery Addresses of a Warehouse the actor is not acting in, even when they hold a membership there and the matching Permission, and do not disclose that the target exists.
  - Customer disclosure through an ordering surface: a member holding the draft and demand Permissions but not the customer-read Permission sees drafts, demand and drift with the customer names, addresses and access notes withheld, so the customer list cannot be assembled from a surface that predates this feature.
  - Customer disclosure through a count: no count, badge, or total anywhere reveals how many Customers or Delivery Addresses a Warehouse holds to a member who may not read them, because a count answers "does this exist" as effectively as the record does.
  - Address and access notes as free text: a Delivery Address and its access notes are presented as text and never as markup or a link, and are treated as confidential data of the same classification as the Customer that carries them; gate codes and door codes recorded there exist outside every handling this specification assumes.
  - Redirection as a back door onto a frozen record: redirecting a Customer Order changes that order and reports Address Drift, and never reaches the frozen delivery mode or Delivery Address of any Purchase Draft Line linked to it.
  - Customer and address spam: recording Customers and Delivery Addresses is rate limited on the same terms as the ordering mutations, and a denial from that limit reveals nothing about existing records.
  - Acting in an archived Warehouse: an archived Warehouse authorizes none of the capabilities above that change what it holds, while the watch capabilities keep authorizing reads on exactly the Permission terms that applied before archiving.
- **Security review:** Required, because the feature adds a new authorization boundary over data that already ships from fifteen existing surfaces, and extends the product's personal data from a bare name to a physical address and the means of access to it.

## 7. Metrics / KPIs

This repository adds no telemetry, so each figure below names the source it is actually read from. "Operator query" means a query an operator runs against the deployment's own records on demand; it is not instrumentation and nothing is collected continuously.

- **Demand that knows where it is going** — baseline: 0% of Customer Orders name a Customer or a Delivery Address; target: ≥80% of Customer Orders recorded after this release name a Customer and a Delivery Address, at the 60-day reading. Source: operator query, read at 30 and 60 days. Recording a Customer Order by typed name stays available, so the remaining fifth measures adoption rather than being a rounding artefact.
- **Customer fragmentation** — baseline: not measured, and by definition one distinct typed string per spelling today; target: the number of Customers recorded in a Warehouse is ≤ 60% of the number of Customer Orders recorded there that name a Customer, at the 60-day reading. Source: operator query, read at 60 days. A ratio approaching one means members are creating a Customer per order instead of reusing one, and the record has bought nothing.
- **Goods that never touch the building** — baseline: 0%, since the mode does not exist; target: ≥15% of Purchase Draft Lines frozen after this release travel Direct to Customer, at the 90-day reading. Source: operator query, read at 90 days. This is the feature's whole operational premise; a figure near zero means members are not trusting the direct path, and the reason is worth finding before anything is built on top of it.
- **Directly-shipped goods arriving where they were sent** — baseline: 0 recorded, since neither the Delivery Address nor the drift exists; target: ≤2% of frozen Direct to Customer Purchase Draft Lines are Closed while still carrying Address Drift, at the 90-day reading. Source: operator query, read at 90 days. A line closed under drift is one where either the member redirected the shipment by phone and the record never caught up, or the goods went to the wrong place; both are worth counting and neither is visible today.
- **Frozen-address violations** — baseline: 0; target: 0 Purchase Draft Lines whose delivery mode or Delivery Address differs from what was frozen at Ready for Ordering, and 0 frozen Direct to Customer lines linked to demand naming another address, at all times. Source: integration-check and automated architecture-check results.
- **Customer-data exposure incidents** — baseline: 0 under the boundaries this feature adopts; target: 0 at all times, counted as reads of one Warehouse's Customers or Delivery Addresses from a request acting in another, and 0 coverage failures in which a customer name — a Customer's, or one typed onto a Customer Order that names no Customer — an address, an access note, or a count reaches a member lacking `CUSTOMERS:WATCH` through any surface, the surfaces predating this feature included. Source: automated coverage-check results, integration-check results, and support reports.

## 8. Open questions

- [ ] Can a required Permission actually be composed with the Permission an ordering surface already declares, so that reading a Purchase Draft demands both it and `CUSTOMERS:WATCH`? The authorization stage today resolves a single required Permission per operation and carries a single one on the resolved principal, so AC-09a as written may have no expressible form without extending that stage — and the failure mode if it is attempted naively is silent, since the surplus Permission would simply not be evaluated. Default now: AC-09a stands as the required behaviour and the mechanism is chosen at `design`, extending the authorization stage if that is what it takes. — owner: Tech Lead, due: before `design`
- [ ] Does a frozen line's Delivery Address hold the address as text captured at the freeze, or a reference to the Delivery Address record it named? The customer name shown beside it is read live today, so freezing the address by value puts two freshness rules in one row, while freezing by reference lets an edit in place rewrite what the supplier was told. The same question now applies to the Delivery Address each linked Customer Order was going to, which AC-16 freezes alongside. Default now: capture the address text at the freeze and capture the customer name with it, on the line and on each frozen link alike, so the whole frozen Delivery Address reads as one statement made at one moment. — owner: Tech Lead, due: before `data-model`
- [ ] What is the remedy when a Direct to Customer line has been recorded as delivered and the customer then says nothing arrived? Recording an ending reduces what that customer is waiting for, and nothing in the product reverses it, so the demand can only be restored by raising the Customer Order's quantity — which leaves the record saying the customer ordered more than they did. Default now: out of scope for this release, with the member correcting the Customer Order and the discrepancy handled outside the product. — owner: PM, due: before `design`
- [ ] Should `WAREHOUSES:ADDRESS_UPDATE` be a Workspace Permission as §6.1 argues, or a Warehouse one? The subject is the Warehouse record, which `workspaces` classifies as a Workspace Capability — but a gate code and a delivery window are operational facts the members working in that Warehouse own, and they may not hold any Workspace Role at all. Default now: Workspace level, consistent with renaming and archiving. — owner: PM, due: before `design`
- [ ] Should recording a direct delivery be exercised under `PURCHASE_DRAFTS:RECEIVE`, or under a Permission of its own? Reusing it keeps one capability for "record what happened to this line", but the word describes goods arriving at the dock, and a member who may confirm arrivals is not obviously the member who may close out a shipment they never saw. Default now: reuse `PURCHASE_DRAFTS:RECEIVE`. — owner: PM, due: before `design`
- [ ] Does moving a Purchase Draft's closure from a single act to one ending per line change how a draft that will not arrive is closed with a reason, and can a member close a draft with some lines still unrecorded? `ordering` closes a draft once and for all through one Arrival Confirmation, and this feature replaces that with a per-line ending, which the existing closure-with-a-reason path has to remain consistent with. Default now: closing with a reason stays a whole-draft act available at any time, and it closes the draft whatever lines remain unrecorded. — owner: Tech Lead, due: before `design`
- [ ] Is a customer name unique per Warehouse case-sensitively, as every existing name in the product is, or folded so that "Acme" and "acme" collide? The established precedent is bytewise and case-sensitive with no normalisation, which would let exactly the three spellings this feature exists to eliminate coexist as three Customers — while folding them would be the first normalising uniqueness rule in the product and would refuse two genuinely different companies whose names differ only in case. Default now: follow the existing case-sensitive precedent and rely on the picker to make the duplicate visible, with the §7 fragmentation KPI as the trigger to revisit. — owner: Tech Lead, due: before `data-model`
- [ ] Do the four boundaries this feature amends get changed in `ordering` itself, or only described here? Refusing a link on a Direct to Customer line narrows its §1 boundary four ("linking is deliberately loose … never required to reconcile"); recording a direct delivery crosses its §3 non-goal ("shipping or dispatching goods to the end customer is excluded because this release ends where the goods arrive"); recording an ending per line replaces its invariant that "Arrival Confirmation happens at most once for a draft" and closes it, which is the change with the widest reach because it applies to every Purchase Draft and not only to those holding a directly-shipped line; and reporting Address Drift at all requires its Demand Snapshot, today "quantity, needed-by date, and state", to carry the Delivery Address each linked Customer Order was going to. All four are amendments to an approved specification, and a reviewer reading `ordering` alone would find it contradicted. Default now: raise all four upstream as a change request against `ordering` before `design`, and keep this spec's wording as the proposed amendment. — owner: PM, due: before `design`
- [ ] Should `PurchaseDraftLineEditor` keep its field block, or hand it to an owned component? This feature added an eighth prop (`endingAction`) and a fourth owned section (`PurchaseDraftLineDelivery`) to a file already at `writing-web-components.md` §2's length and prop ceilings — "Crossing several at once means the component is doing more than one job". The seam the slot implies is the item/quantity/packaging/note field block plus its handlers, leaving this file as the line's frame, its refusal reason and its slots. Deferred from the 2026-09-04 frontend conformance review as advisory, because the budget was worsened rather than created by this change. Default now: leave as is and extract when the next prop or section is added. — owner: Frontend Lead, due: before the next `PurchaseDraftLineEditor` change
- [ ] Should `onSelect` be read where it is used rather than travelling `CustomerDirectory` → `CustomerCatalogue` → `CustomerCardList` → `CustomerCard`? Moving the dialog controller down to the card list (2026-09-04 conformance fix 7) brought `onCorrect`/`onDeactivate` inside `writing-web-components.md` §4's two-hop budget, but selection stayed at the directory and still travels three hops. It is a callback reporting an event upward, which `web-action-dialogs.md` §6 treats as the tolerated shape, so it is over budget rather than wrong. Default now: leave it, and revisit if the directory grows a second selection-dependent surface. — owner: Frontend Lead, due: before the next `customer-directory` change
- [ ] Should the one-component-per-file gate also encode §1's "own state, effects, or data access" trigger? `src/test/one-component-per-file/one-component-per-file.spec.ts` (added 2026-09-04) currently encodes only the trigger a scan can decide mechanically — a private component annotated with a props type its own file exports. Encoding the second trigger flags seven files outside that change (`DatasetCard`, `MemberRow`, `Sidebar`, `MemberList`, `WorkspaceMemberRow`, `WarehouseLayout`, `WarehouseLifecycleActions`), so widening the gate means fixing them first. Default now: the narrow gate stands; widening it is its own piece of work. — owner: Frontend Lead, due: unscheduled
- [ ] Should the two per-line ending result types live in the feature's domain rather than in one of the two commands that share them? `record-purchase-draft-line-delivery.command.ts` imports `EndingAllocationInput`, `PurchaseDraftLineEnded` and `PurchaseDraftLineEndingRuntime` from `confirm-purchase-draft-line-arrival.command.ts`, so the Direct to Customer command's public result shape is owned by the Via Warehouse command — against `server-architecture.md` §"Use cases" ("A use case … declares the input and result types of that operation in its own file"), which ADR 0002 made load-bearing by splitting one act into two commands. Deferred from the 2026-09-04 backend conformance review as advisory; the coupling is through the application layer rather than a boundary crossing, and the natural home (`domain/value-objects/delivery-mode.ts`, which already holds `EndingKind`) is a move rather than a redesign. Default now: leave as is and move the three types into the feature domain the next time either ending command changes. — owner: Backend Lead, due: before the next per-line ending change
- [ ] Should the freeze capture write one conditional `UPDATE … FROM` instead of one statement per line? `purchase-draft-freeze.repository.ts`:201-208 reads every line of the draft with both candidate address sources in one query — correctly, and its comment cites the rule — then loops the result set applying `capturedDeliveryStatement` in application memory and issues a serial `PurchaseDraftLineEntity.update` per row, so a freeze costs `1 + N` round trips inside the caller's transaction. `capturedDeliveryStatement` is a pure ternary on `line.deliveryMode`, so it maps directly onto a SQL `CASE`, which is what `creating-a-server-repository.md` §"Design a specialized repository" prefers ("Prefer one purpose-built query"). Deferred from the 2026-09-04 backend conformance review as advisory: correctness is unaffected and drafts are small today, so this is a cost that only matters as line counts grow. Default now: leave as is, and revisit if freeze latency shows up against a real draft size. — owner: Backend Lead, due: unscheduled
- [ ] Should the Address Drift cross-check move out of `shared/domain/repositories/`, and should the reusable seeding move with it? `purchase-draft-address-drift-read.repository.integration.spec.ts`:14 imports `ReadPurchaseDraftQuery` to assert that the repository's list flag and the query's derived per-link Drift Signals agree — a genuinely valuable check, but it puts a feature-module dependency inside the directory `creating-a-server-repository.md` § "Keep repositories isolated and operation-oriented" says "must not import from or otherwise know about a dedicated feature module". The production repositories themselves are clean. Relocating the one assertion beside the query means extracting roughly 200 lines of file-local seeding helpers out of an 888-line spec into `src/test/fixtures/`, which `server-architecture.md` §Testing reserves for exactly that; duplicating them instead would be worse than the violation. The same shape already exists at `purchase-draft-read.repository.integration.spec.ts`:8, which predates this feature, so the extraction should serve both. Deferred from the 2026-09-04 backend conformance review as advisory. Default now: leave both in place and do the fixture extraction as its own piece of work, so the two specs move together. — owner: Backend Lead, due: unscheduled
