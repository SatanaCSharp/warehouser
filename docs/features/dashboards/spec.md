---
status: Draft
owner: 'PM + Tech Lead'
reviewers: ['Tech Lead', 'Security Lead']
updated_at: '2026-09-20'
feature_size: 'L'
---

# Spec — dashboards

> **Glossary:** [CONTEXT](./CONTEXT.md), read together with [`access`](../access/CONTEXT.md) and [`workspaces`](../workspaces/CONTEXT.md), which own the roles and the authority levels, and [`ordering`](../ordering/CONTEXT.md), [`arrival-inspection`](../arrival-inspection/CONTEXT.md) and [`delivery-addresses`](../delivery-addresses/CONTEXT.md), which own every record this feature reads.
> **Reference module / docs / channels used:** `docs/features/ordering/spec.md` §1 and §6 for the scale and the read boundaries, `docs/features/ordering/CONTEXT.md` and `docs/features/arrival-inspection/CONTEXT.md` for the derivation rules, `docs/features/arrival-inspection/spec.md` §8 and `docs/roadmap.md` for the deferred Rejection Register, `docs/system/guides/server-request-authorization.md` for the two authority levels and the redaction standard, and competitive research into warehouse-management and multi-site inventory dashboards.

## 1. Context

A warehouse using this product now records everything an operational question needs, and can answer none of them. What its customers are waiting for lives in the Customer Orders; what it holds lives on the Items; what it has decided to buy lives in the Purchase Drafts; what arrived unusable lives in the Rejections. Each of these is a list a member opens and reads a row at a time. The questions a supervisor actually asks in the morning — _is anything promised that we cannot supply, is anything arriving after it is owed, which of last month's purchasing decisions never went anywhere, which two things keep coming in broken_ — are all questions across those lists, and answering one today means opening three destinations and reconciling them by hand. The records exist; the read across them does not. The Warehouse's own address shows a design-system placeholder in the place this read belongs, and the navigation beside it has called that place _Dashboard_ since the ordering shell shipped.

At the level above, the gap is not a missing read but a missing surface. `workspaces` made it possible to run several Warehouses under one identity, and nothing since has given anyone a way to look at them together. A Workspace Owner holding four Warehouses learns that one of them is falling behind by entering it, and learns it about the other three by entering those too — so in practice they learn it when somebody telephones. Every Workspace Permission that exists today is administrative: roles, members, the Warehouse lifecycle, renaming. There is no authority in the product under which one person may see how the Warehouses are _doing_, which is a fair description of why no such surface was ever built.

The committed approach is a fixed, zero-configuration, quantity-only view at each level: four Panels per surface, chosen once and never chosen again, of which each reader sees those their Permissions admit, fitting one screen with no scrolling, each Panel answering one question and offering no controls. The only words on either surface are the labels a Panel needs to be read and the counts it must state to be honest — how many records it has had to leave out, and why — which are part of the figure rather than prose about it. A reader whose Permissions admit no Panel at all is told so plainly instead of being shown an empty surface. Nothing is configurable, nothing is exported, and nothing is clicked through to the records behind it. Competitive research supports treating that as a position rather than a shortfall: every comparable product found is either a configurable widget board whose users curate their own view and expect to drill into a transaction from any number, or a pooled multi-site stock view built for a single-site mental model stretched across locations. Neither answers _which of my sites needs attention this morning_ without setup, and the adversarial pass agreed that the risk this takes on is not complexity but actionability — which is why the absence of drill-through is carried in §8 as a question with a review date rather than settled here for good.

Seven boundaries are stated here so they are not re-derived downstream. **First**, this feature stores nothing. It adds no business record, no write path and no state transition; every figure is derived when a member looks at it, from records other features own and continue to own. The one exception is authority, below. **Second**, the Workspace surface needs an authority that does not exist. The two levels never meet — a Workspace Permission on a Warehouse-guarded capability resolves nothing, and authority in a Warehouse is the membership held in _that_ Warehouse — so a cross-Warehouse operational read cannot be assembled from Warehouse memberships a Workspace Member does not have, and cannot honestly be smuggled through `WAREHOUSES:WATCH`, which today means seeing that the Warehouses exist and what they are called. One new Workspace Permission is introduced, and it is the only thing this feature adds to the system catalogue. **Third**, the Workspace surface does cross a boundary three features drew, and says so rather than claiming otherwise. It does not reopen the half of `ordering`'s non-goal that concerns consolidation — it sets Warehouses beside one another and pools nothing, no Item identity crosses a Warehouse boundary, and no figure claims to be one organization's demand for one Item. But `ordering` excluded cross-Workspace demand also because reading one Warehouse's customer demand from another would cross the capability line the Workspace boundary draws, `ordering` holds that every operation on a Warehouse-owned record is authorized by the Role its actor holds in that Warehouse, and `arrival-inspection` holds that nothing it reads crosses that boundary, including across the Warehouses of one Workspace. Reading aggregates of those records from the Workspace above them contradicts all three as written. The ruling below amends each of them rather than reinterpreting them, and §8 names who owes each amendment. **Fourth**, every figure is a quantity or a share of quantities. The product holds no price, cost or currency anywhere, so there is nothing here to value and no figure that could be read as money. **Fifth**, there is no history to plot except where the records carry their own timestamps. On-hand Quantity is a maintained absolute figure with no ledger behind it, so no stock level over time can be reconstructed, and no chart pretends to. **Sixth**, a figure that the records cannot honestly support is either specified differently or not drawn, and every figure that leaves records out states how many it left. Five were found unsupportable as first proposed and are specified differently below: what is on order, when a Customer Order was satisfied, what share of arrivals were on time, what a past week recorded, and what share of arrivals honoured their instruction. **Seventh**, the §6 targets assume the scale `ordering` already fixes — roughly 2 000 Items, 5 000 Unfulfilled Customer Orders and 250 open Purchase Drafts per Warehouse — and, for the Workspace surface, up to 20 Warehouses in a Workspace; outgrowing either is the explicit trigger to revisit §6 rather than a silent regression against it.

Four of those boundaries were not the specification's to settle. The domain gate run before this draft returned `ESCALATION_REQUIRED` on seven points, having found that the domain knowledge base holds no Warehouser specification at all and that the repository artifacts, read as the only authority, do not define _uncovered_, do not define a Purchase Draft's _age_, leave the Expected Arrival Date unreconciled with the per-line Delivery Mode, define no on-time arrival, define no met-conformance denominator, and give the Workspace surface no authority to stand on. Each was ruled by the feature's owners rather than assumed, and each ruling is recorded here with what it costs:

- **Decision override: Uncovered Quantity is a legitimate derived read** — rationale: `ordering` declined to arbitrate the arithmetic between a link's stated quantity and the quantities around it, because a member was making that decision and the system's job was to show them what they were deciding against. A read grained per Item asserts nothing about any link and arbitrates nothing between them; it states what the Warehouse is holding and what it has ordered against one Item's promised total. `ordering`'s fourth boundary is amended to permit it, and the amendment is owed by this feature.
- **Decision override: the Expected Arrival Date is read narrowly** — rationale: the date means goods reaching the Transit Zone, so it speaks for its draft's Via Warehouse lines and for no others, and for those the moment the line's ending was recorded is taken as the moment the goods arrived. This is the narrowest reading that makes the date usable at all, and it is written into `ordering` and `delivery-addresses` rather than left implicit in a chart.
- **Decision override: the Workspace surface gets its own authority** — rationale: composing it from Warehouse memberships would make one chart read differently for two people and would show a Workspace Owner nothing, and restricting it to Workspace-owned records would leave no operational figure on it. Three invariants are amended together to admit a read of aggregates over Warehouse-owned records while still authorizing no operation inside a Warehouse: the `workspaces` rule that a Workspace Permission never authorizes an operation inside a Warehouse, the `ordering` rule that every operation on a Warehouse-owned record is authorized by the Role its actor holds in that Warehouse together with the §3 rationale that excluded cross-Workspace reading, and the `arrival-inspection` rule that nothing it reads crosses that boundary including across the Warehouses of one Workspace. Amending three rather than one is the honest cost of this surface, and is why it is reviewed rather than applied.
- **Decision override: the Conformance Rate counts instructed lines only** — rationale: a line recorded Not applicable was given no instruction to honour, so counting it as honoured would let a Warehouse that instructs nobody read as perfect. The narrower denominator is volatile where instructions are rare, which is what §7's conformance-coverage figure exists to expose.

A second domain gate, run during `clarify` over the ambiguities this draft still carried, confirmed the first gate's finding — the knowledge base holds two general warehouse-management texts and no Warehouser specification, so repository artifacts remain the only authority. It ruled four points from them: Arrival Timing reads the drafts standing in Ready for Ordering when it is read, a Closed draft's date describing goods no longer awaited; a new non-reserved Workspace Permission reaches every existing Workspace Owner Role through its release's migration, with precedent; the Rejection Sources are fixed by Delivery Mode and a Customer-reported Rejection is still that Warehouse's own; and the Rejection Reason catalogue is system-managed and currently holds ten entries. Six further points had no authority anywhere and were ruled by the feature's owners, each recorded here with what it costs:

- **Decision override: Due soon means the next fourteen days** — rationale: nothing in the product records a lead time, a supplier, a service window or any horizon the boundary could be derived from, and the band is expressly not a service level. A stated span is arbitrary where a sourced one would not be, and is preferred to leaving the boundary open, because an unpinned band makes every Demand Pressure bar a different chart for every reader. It is pinned in the glossary exactly as Age Band already is.
- **Decision override: a cancelled Customer Order stays in the week it was recorded** — rationale: Order Flow reports what a week took on rather than what remains owed, so a cancellation is a withdrawal from a whole that still counts it; a week's total that silently dropped its cancellations could not report how much of it was cancelled. AC-04 and §6's demand-figure honesty target are narrowed to figures of what is owed, and Order Flow is named as the single exception rather than left to contradict them.
- **Decision override: Purchasing Spread counts every Purchase Draft state** — rationale: US-09 exists to tell a supply problem from a Warehouse that abandons its own purchasing work, which the open states alone cannot show. The Workspace Panel had no name, which is what let the open-state invariant read as covering it; it is named, and the invariant is scoped to the Warehouse Panel it was written for.
- **Decision override: both receipt rates read the whole retained record** — rationale: no artifact states a period over which a Warehouse's receiving record is judged, and §3 already refuses date-range controls. The cost is carried openly: every ending recorded before `arrival-inspection` shipped was never backfilled, so the Conformance Rate is depressed by a period in which the record could not exist, which is precisely what §7's conformance-coverage figure measures.
- **Decision override: Reason Concentration counts both Rejection Sources** — rationale: `arrival-inspection` makes every Rejection belong to the Warehouse of the line it names, and US-05 asks which problems are worth raising with whoever sends the goods — a refusal by the end customer being that supplier's failure too. The Panel is therefore not a figure about the dock, and the Customer-reported part is shown within each Reason so the two are never read as one.
- **Decision override: demand owed beyond the eighth week is excluded with a stated count** — rationale: `ordering` bounds a needed-by date only from below, so demand past the horizon legitimately exists and eight weeks is this feature's own choice. Excluding it with a count matches how the Panel already treats the undated and the still-in-Draft draft, and keeps the horizon readable; §6's exclusion-accounting target is extended to cover it.

The gate's two remaining points needed no ruling. A Purchase Draft's age is measured from the moment it entered the state it is in, which is the only reading the one existing precedent supports. And the refusal of a count belongs to `delivery-addresses` and protects Customers and Delivery Addresses specifically — `ordering` deliberately discloses how many Customer Orders an Item has, as not being a count of Customers — which is why §6.1 grounds this feature's disclosure position in the redaction the Customer Orders read already performs, rather than in a general rule about aggregates that no artifact states.

## 2. Goals

- A member entering a Warehouse reads its demand risk, its inbound timing, its purchasing pipeline and its receipt quality in one screen, without opening a list or reconciling anything by hand.
- A Workspace Member holding the new authority can tell which Warehouse needs attention, and on which of three grounds — how much is promised and how soon, where purchasing work stands, and how reliably goods are received — without entering any of them; the fourth Panel reports the Workspace's own demand trend as a whole rather than comparing its Warehouses.
- Every figure either states honestly what it counts and what it leaves out, or is not drawn — so a member can act on what they see without checking it against the lists.
- Both surfaces stay glanceable: a fixed set of charts, one screen, no configuration, no controls and no explanatory copy to read first.

## 3. Non-goals

- No new business records, no write paths and no state transitions; every figure is derived on read from records the existing features own, and the single addition to stored data is the one Workspace Permission catalogue entry that authorizes the Workspace surface, because without it that surface has no authority to stand on.
- No monetary reporting of any kind, because the product carries no price, cost or currency column anywhere and every measure it holds is a quantity.
- No stock-level history, because On-hand Quantity is recorded as an absolute counted figure rather than a movement, so no past balance can be reconstructed from what is stored.
- No export, no scheduled or emailed reports, and no drill-through from a figure to the records behind it in this release, because each is a surface of its own and the first release is deliberately one screen that answers questions rather than a place work is done.
- No configurable dashboards — no adding, removing, reordering or resizing of charts, no saved views, no filters and no date-range controls — because a fixed set is what lets two people discuss the same chart, and configurability is the thing every comparable product added and then had to support forever.
- No comparison of one Item across Warehouses, because `ordering` makes a SKU name two unrelated Items in two Warehouses, so cross-Warehouse Item identity does not exist to be compared.
- No alerts, thresholds or targets, because nothing here judges a Warehouse; the figures report and the reader decides.

## 4. User stories

### US-01: Read the dock at a glance

**As a** Warehouse Member permitted to watch Customer Orders, Items and Purchase Drafts
**I want** the Warehouse Dashboard's four Panels to be what I see when I enter it
**So that** I learn what needs attention this morning without opening three lists first

### US-02: See what is promised and uncovered

**As a** Warehouse Member permitted to watch Customer Orders, Items and Purchase Drafts
**I want** to see, per Item, how much promised quantity is covered by stock, how much by what is on order, and how much by nothing
**So that** I know what to buy before a customer telephones about it

### US-03: See whether goods arrive before they are owed

**As a** Warehouse Member permitted to watch Customer Orders and Purchase Drafts
**I want** to see what is due each week beside what is expected to arrive each week
**So that** I can tell that a week is short before it arrives rather than during it

### US-04: See which purchasing work has stalled

**As a** Warehouse Member permitted to watch Purchase Drafts
**I want** to see how many drafts stand in each state and how long they have stood there
**So that** I can finish or discard the ones that have stopped moving

### US-05: See which refusals cost the most

**As a** Warehouse Member permitted to watch Rejections
**I want** to see which Rejection Reasons account for most of the quantity we refused, and how much of it is still undecided
**So that** I know which two problems are worth raising with whoever sends the goods

### US-06: Read only what I am permitted

**As a** Warehouse Member permitted to watch some of the Warehouse's records but not all of them
**I want** the Panels I may not read to be absent rather than shown empty
**So that** I am not told, by an empty frame, what the Warehouse holds that I may not see

### US-07: Compare my Warehouses

**As a** Workspace Member permitted to observe how the Workspace's Warehouses are performing
**I want** to see each Warehouse's promised quantity split by how soon it is owed
**So that** I can tell which Warehouse is under pressure without entering any of them

### US-08: See whether demand is growing

**As a** Workspace Member permitted to observe how the Workspace's Warehouses are performing
**I want** to see, for each recent week, how much demand was taken on in it and how much of that same demand has since been assigned to arrived goods
**So that** I can tell whether we are taking on more than we are turning around

### US-09: See where purchasing work piles up

**As a** Workspace Member permitted to observe how the Workspace's Warehouses are performing
**I want** to see how many Purchase Drafts sit in each state in each Warehouse, including the discarded ones
**So that** I can tell a supply problem from a Warehouse that abandons its own purchasing work

### US-10: See which Warehouse struggles to receive

**As a** Workspace Member permitted to observe how the Workspace's Warehouses are performing
**I want** to see, per Warehouse, how often goods arrived when they were expected and how often the packaging instruction was honoured
**So that** I can tell which dock needs help rather than which one shouts loudest

### US-11: Grant the cross-Warehouse read

**As a** Workspace Owner
**I want** to grant the authority to observe Warehouse performance to a Workspace Role without granting Workspace administration
**So that** a colleague can triage the Warehouses without being able to change roles, members or the Warehouses themselves

### US-12: Trust the figures

**As a** Warehouse Member permitted to watch Customer Orders, Items and Purchase Drafts
**I want** every figure to count exactly what it says it counts and to state what it has left out
**So that** I do not order against demand nobody is waiting for, or against a quantity that was counted twice

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:WATCH`, `ITEMS:WATCH`, `PURCHASE_DRAFTS:WATCH` and `REJECTIONS:WATCH` in a Warehouse holding Unfulfilled Customer Orders, open Purchase Drafts and recorded Rejections
**When** the member enters that Warehouse
**Then** the system presents the Warehouse Dashboard's four Panels together in one screen without scrolling — the Coverage Gap, Arrival Timing, the Purchasing Pipeline and Reason Concentration — and presents no controls, nothing the member must choose before reading them, and no words beyond each Panel's own labels and the counts it states

### AC-02 (US-01) — authorization

**Given** an authenticated Warehouse Member of a Warehouse whose Role carries no combination of watch Permissions that fully admits a single Panel — whether because it carries none of `CUSTOMER_ORDERS:WATCH`, `ITEMS:WATCH`, `PURCHASE_DRAFTS:WATCH` and `REJECTIONS:WATCH`, or because it carries some of them and no Panel's whole set
**When** the member enters that Warehouse
**Then** the system presents a statement that the member is not permitted to read the Warehouse's figures, presents no chart frame, no axis and no total, and the statement reveals nothing about what the Warehouse holds, whether it holds anything, or which of the member's Permissions fell short

### AC-02a (US-06) — authorization

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:WATCH` but none of `CUSTOMER_ORDERS:WATCH`, `ITEMS:WATCH` and `REJECTIONS:WATCH`, in a Warehouse holding Unfulfilled Customer Orders, open Purchase Drafts and recorded Rejections
**When** the member enters that Warehouse
**Then** the system presents the Purchasing Pipeline alone, because it is the only Panel every one of whose figures the member may read, that Panel occupies the screen as though the other three had never been part of it, and nothing on the screen indicates that a Panel has been withheld or that the Warehouse holds Customer Orders or Rejections at all

### AC-03 (US-02) — happy path

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:WATCH`, `ITEMS:WATCH` and `PURCHASE_DRAFTS:WATCH` in a Warehouse whose Unfulfilled Customer Orders name more than ten Items
**When** the member reads the Coverage Gap
**Then** the system shows at most ten Items, drawn only from those some Unfulfilled Customer Order still asks for, ordered by Uncovered Quantity from largest down and, where two Items are uncovered by the same quantity, by total Outstanding Quantity from largest down and then by SKU — so that two members reading the same Warehouse at the same moment see the same ten Items in the same order — each divided into its On-hand Quantity, its Inbound Quantity and its Uncovered Quantity, and gathers every remaining Item into one Remainder Row that states how many Items it holds

### AC-04 (US-02, US-12) — domain invariant

**Given** an authorized Warehouse Member and a Warehouse in which a Customer Order for a given Item was cancelled while a quantity was still outstanding on it
**When** the member reads any figure about promised quantity on either surface
**Then** the system counts nothing from that cancelled Customer Order toward any figure of what is still owed — the quantity it still records as outstanding contributes to no Coverage Gap and to no Urgency Band — while Order Flow, whose subject is what each week took on rather than what remains owed, keeps that quantity in the week the Customer Order was recorded and presents the cancelled part as withdrawn from that week rather than as demand the Warehouse still carries

### AC-05 (US-02) — domain invariant

**Given** an authorized Warehouse Member and an Item whose On-hand Quantity and Inbound Quantity together meet or exceed its total Outstanding Quantity
**When** the member reads the Coverage Gap
**Then** the system shows that Item as having nothing uncovered rather than a negative quantity or a surplus, and orders it below every Item that has something uncovered

### AC-06 (US-02, US-12) — domain invariant

**Given** an authorized Warehouse Member and an Item named by a Purchase Draft Line on an open Purchase Draft, where the quantities the member stated on the links between that line and the Customer Orders it was meant for do not add up to the quantity ordered on the line
**When** the member reads that Item's Inbound Quantity
**Then** the system reports the quantity ordered on the open Purchase Draft Lines naming the Item, and reports no figure derived from the stated quantities of those links, which claim an intention rather than a quantity on order

### AC-06a (US-12) — domain invariant

**Given** an authorized Warehouse Member and an Item demanded by several Unfulfilled Customer Orders and named by several open Purchase Draft Lines
**When** the member reads any figure about that Item
**Then** each quantity the system reports equals the quantity it would report were the Item demanded by one Customer Order or named by one Purchase Draft Line, so no quantity is multiplied by the number of records counted beside it

### AC-07 (US-03) — happy path

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:WATCH` and `PURCHASE_DRAFTS:WATCH` in a Warehouse holding Unfulfilled Customer Orders needed across the coming weeks and some already Overdue
**When** the member reads Arrival Timing
**Then** the system shows one bucket for everything already Overdue followed by eight weeks beginning with the week in progress, presents the outstanding quantity owed in each, states how much outstanding quantity is owed beyond the eighth week and how many Customer Orders it covers without placing any of it in a week — so the demand shown is never read as the whole of what is owed — and presents beside it the quantity expected to reach the dock in each, taken from the Expected Arrival Date of the Purchase Drafts standing in Ready for Ordering at the moment the Panel is read — a draft that has since reached Closed or been Discarded counting toward no week, because its Expected Arrival Date then describes goods whose ending has been recorded or that will not come, rather than goods still awaited

### AC-08 (US-03) — domain invariant

**Given** an authorized Warehouse Member and a Warehouse holding an open Purchase Draft with one Via Warehouse line and one Direct to Customer line
**When** the member reads the Coverage Gap and then Arrival Timing
**Then** the system counts both lines toward the Inbound Quantity of the Items they name, because goods sent straight to a customer answer that customer's demand, and counts only the Via Warehouse line toward what is expected to reach the dock, because the other never arrives there

### AC-08a (US-03, US-12) — domain invariant

**Given** an authorized Warehouse Member and a Warehouse holding Purchase Drafts in Ready for Ordering of which some carry no Expected Arrival Date, and Purchase Drafts still in Draft of which some already carry one
**When** the member reads Arrival Timing
**Then** the system places in a week neither an undated Purchase Draft nor a Purchase Draft still in Draft, whose date is a working note rather than the commitment that freezing makes of it, and states for each of those two exclusions how many drafts and what quantity it covers — so the weeks shown are never read as the whole of what is on order, and the difference from the Inbound Quantity the member reads on the Coverage Gap beside it is accounted for rather than left unexplained

### AC-09 (US-01) — error

**Given** an authenticated Warehouse Member following a stale link that names no Warehouse they may enter
**When** the member follows it
**Then** the system tells the member that the link names no Warehouse they can enter and offers them the Warehouse they were last in, or — where they were last in none, or the one they were last in is no longer theirs to enter — offers them the Warehouses they may enter and asks them to choose, telling a member who may enter none that they hold no Warehouse membership, and in every case discloses nothing about whether the Warehouse the link named exists anywhere

### AC-10 (US-04) — happy path

**Given** an authorized Warehouse Member holding `PURCHASE_DRAFTS:WATCH` in a Warehouse holding Purchase Drafts in Draft and in Ready for Ordering of varying ages
**When** the member reads the Purchasing Pipeline
**Then** the system shows the two states divided into the four Age Bands, counting a Draft from when it was created and a Ready for Ordering draft from when it was made ready, so a draft readied yesterday after a month in Draft reads as a day old

### AC-11 (US-04) — domain invariant

**Given** an authorized Warehouse Member and a Warehouse holding Purchase Drafts that have been Closed and Discarded as well as open ones
**When** the member reads the Purchasing Pipeline or any Inbound Quantity on the Warehouse Dashboard
**Then** the system counts only Purchase Drafts in Draft and in Ready for Ordering, which is the same set that already presents as Coverage, and counts nothing from a Closed or Discarded draft

### AC-12 (US-05) — happy path

**Given** an authorized Warehouse Member holding `REJECTIONS:WATCH` in a Warehouse whose Rejections carry several Rejection Reasons and a mixture of Dispositions
**When** the member reads Reason Concentration
**Then** the system shows the Rejection Reasons ordered by refused quantity from largest down with the running share across them, counts refusals carrying either Rejection Source because a Warehouse's Rejections are its own wherever the goods were refused, distinguishes within each Reason both the quantity whose Disposition is still Undecided and the quantity refused by the end customer rather than at the dock so that the two are never read as one, and gathers any Reason beyond the tenth into one Remainder Row that states how many Reasons it holds, presenting no Remainder Row at all while nothing has been gathered into it

### AC-13 (US-05, US-06) — authorization

**Given** an authorized Warehouse Member holding `CUSTOMER_ORDERS:WATCH`, `ITEMS:WATCH` and `PURCHASE_DRAFTS:WATCH` but not `REJECTIONS:WATCH` in a Warehouse whose goods have been refused many times
**When** the member enters that Warehouse
**Then** the system presents the three charts the member may read and presents nothing at all in place of Reason Concentration — no frame, no title and no count — so the member learns neither that refusals exist nor that any figure has been withheld

### AC-14 (US-07) — happy path

**Given** an authorized Workspace Member holding the Workspace Permission that admits observing Warehouse performance, in a Workspace holding several Warehouses with Unfulfilled Customer Orders
**When** the member reads Demand Pressure
**Then** the system shows one bar per Warehouse divided into quantity already Overdue, quantity due soon and quantity due later, on a scale of quantities rather than of shares, so a small Warehouse in trouble is not flattened beside a large healthy one

### AC-15 (US-07, US-08, US-09, US-10) — authorization

**Given** an authenticated Workspace Member whose Workspace Role does not carry the Workspace Permission that admits observing Warehouse performance
**When** the member attempts to read the Workspace's figures
**Then** the system denies the attempt, presents no Warehouse name, quantity, count or share, and the denial reveals nothing about how many Warehouses the Workspace holds or whether any of them has anything outstanding

### AC-16 (US-08) — happy path

**Given** an authorized Workspace Member holding the Workspace Permission that admits observing Warehouse performance, in a Workspace whose Warehouses recorded, satisfied and cancelled Customer Orders over the past twelve weeks
**When** the member reads Order Flow
**Then** the system shows twelve weeks for the Workspace as a whole, pooling its Warehouses and naming none of them — this being the one Panel that reports the Workspace's own trend rather than setting its Warehouses beside one another — each week holding the quantity the Customer Orders first recorded in that week now ask for, those since cancelled included, and within that whole how much has since been assigned to arrived goods and how much has since been cancelled — the cancelled part presented as withdrawn from the week rather than as a quantity the Workspace still owes, so that both parts are parts of a whole the week really took on

### AC-17 (US-08, US-12) — domain invariant

**Given** an authorized Workspace Member and a Customer Order recorded in one week and satisfied by goods arriving on three separate occasions in three later weeks
**When** the member reads the Workspace's Order Flow
**Then** the system adds the three assignments together and reports them against the week the Customer Order was recorded, places nothing in the three weeks the goods arrived, names the figure as quantity assigned rather than as orders fulfilled, and claims nowhere that the Customer Order was satisfied in any week, because no record states when it was

### AC-17a (US-08, US-12) — domain invariant

**Given** an authorized Workspace Member and a Customer Order recorded eight weeks ago whose quantity a member has since amended upward
**When** the member reads the Workspace's Order Flow
**Then** the system reports that week with the quantity the Customer Order asks for now rather than the quantity it asked for then, because no record keeps what it asked for then, and states on the Panel that its weeks report what the Customer Orders recorded in them currently ask for

### AC-18 (US-09) — happy path

**Given** an authorized Workspace Member holding the Workspace Permission that admits observing Warehouse performance, in a Workspace whose Warehouses hold Purchase Drafts in every state
**When** the member reads Purchasing Spread
**Then** the system shows every Warehouse against every Purchase Draft state — Draft and Ready for Ordering together with Closed and Discarded — and presents the number of drafts in each pairing, so a Warehouse that discards most of what it starts is distinguishable from one that cannot get goods, this being the one Panel on either surface that counts a draft the open-state rule excludes everywhere else

### AC-19 (US-10) — happy path

**Given** an authorized Workspace Member holding the Workspace Permission that admits observing Warehouse performance, in a Workspace whose Warehouses have received goods against Purchase Drafts carrying Expected Arrival Dates
**When** the member reads Receipt Reliability
**Then** the system shows one mark per Warehouse positioned by that Warehouse's On-time Arrival Rate and its Conformance Rate, sized by the quantity it received, each of the three read over the whole of that Warehouse's retained record rather than a recent period, and labels each mark with the Warehouse's name so that no legend has to be consulted to read it

### AC-20 (US-10, US-12) — domain invariant

**Given** an authorized Workspace Member and a Warehouse whose Purchase Draft Lines include some on drafts carrying no Expected Arrival Date, some whose Pre-receipt Conformance was never recorded, and some recorded as Not applicable
**When** the member reads that Warehouse's Receipt Reliability
**Then** the system excludes the undated lines from both parts of the On-time Arrival Rate, excludes the lines with no recorded Pre-receipt Conformance from both parts of the Conformance Rate rather than counting them as having failed, excludes the Not applicable lines as having been given no instruction to honour, and states how much of the Warehouse's record each exclusion covers

### AC-20a (US-10) — domain invariant

**Given** an authorized Workspace Member and a Warehouse none of whose Purchase Draft Lines can enter either rate, because every one of them is undated, carries no recorded Pre-receipt Conformance, or was sent Direct to Customer
**When** the member reads receipt reliability
**Then** the system presents that Warehouse as having no rate to report rather than placing it at nothing or at everything, so a Warehouse with no record is never read as the worst or the best performer

### AC-20b (US-10, US-12) — domain invariant

**Given** an authorized Workspace Member and a Warehouse holding a Purchase Draft made Ready for Ordering whose Expected Arrival Date has passed, on which one Via Warehouse line has had its ending recorded and another has had no ending recorded at all
**When** the member reads that Warehouse's On-time Arrival Rate
**Then** the system judges the recorded line by the moment its ending was recorded against the Expected Arrival Date its Purchase Draft carries, counts the line with no ending in neither part of the rate because nothing has yet said the goods reached the dock, counts in neither part a line whose ending recorded that nothing was received because no arrival happened that could be timely or late, and counts no Direct to Customer line in either part because those goods never reach the dock at all

### AC-21 (US-11) — happy path

**Given** an authorized Workspace Owner and a Workspace Role that carries no Workspace administration
**When** the Workspace Owner adds the Workspace Permission that admits observing Warehouse performance to that Role
**Then** the system records the change, and every Workspace Member holding that Role may afterwards read the Workspace's figures while remaining unable to change roles, members, or the Warehouses themselves

### AC-21a (US-11) — cross-context

**Given** a Workspace whose Workspace Owner Role was established before this feature was released
**When** the release introducing the Workspace Permission that admits observing Warehouse performance is applied, with no person acting
**Then** every existing Workspace Owner Role carries that Permission afterwards, so the Workspace Owner may read the Workspace's figures without anyone granting it to them, and no existing custom Workspace Role gains it

### AC-22 (US-11, US-07) — authorization

**Given** a Workspace Member holding the Workspace Permission that admits observing Warehouse performance and holding no membership in any Warehouse of the Workspace, and separately a Warehouse Member holding every watch Permission in their own Warehouse and no Workspace Role at all
**When** each of them attempts to read the Workspace's figures
**Then** the system admits the first, because the authority to observe the Workspace's Warehouses is held in the Workspace and not assembled from memberships in them, and denies the second, because authority in one Warehouse says nothing about the Workspace above it

### AC-23 (US-01, US-06) — cross-context

**Given** an authorized Warehouse Member holding the watch Permissions in a Warehouse that the Workspace has since archived
**When** the member enters that Warehouse
**Then** the system presents the Warehouse's charts on exactly the Permission terms that applied before it was archived, marks the Warehouse as archived where it already marks it elsewhere, and offers nothing on the surface that would change what the Warehouse holds

### AC-24 (US-01) — authorization

**Given** a Warehouse Member acting in one Warehouse who holds a membership carrying every watch Permission in another Warehouse of the same Workspace
**When** the member attempts to read the other Warehouse's figures while acting in the first
**Then** the system denies the attempt without disclosing whether that Warehouse holds anything, because authority is the membership held in the Warehouse being read

### AC-25 (US-02, US-12) — cross-context

**Given** an authorized Warehouse Member and an Item that was deactivated after Customer Orders naming it were recorded, some of which are still Unfulfilled
**When** the member reads the Coverage Gap
**Then** the system shows that Item with its outstanding quantity and its On-hand Quantity exactly as it shows an active one, because deactivation withdraws an Item from being newly ordered and withdraws nothing from what has already been promised

### AC-26 (US-12) — cross-context

**Given** an authorized Warehouse Member who records a Customer Order, amends another, or makes a Purchase Draft Ready for Ordering, and then returns to the Warehouse's charts
**When** the member reads them
**Then** the system presents figures that account for the change just made, and presents no figure carried over from before it

## 6. Non-functional requirements

| Aspect                         | Target                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Measurement                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Authorization evaluation       | Authorization stage p95 ≤ 50 ms per protected operation this feature introduces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Structured server timing logs                             |
| Warehouse surface read latency | p95 ≤ 600 ms for every figure the actor is permitted, together, at the §1 scale, excluding client network time                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Structured server timing logs                             |
| Workspace surface read latency | p95 ≤ 900 ms for every figure the actor is permitted, together, at the §1 scale across up to 20 Warehouses, excluding client network time                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Structured server timing logs                             |
| Read shape                     | ≤ 1 round trip per chart, each awaited before the surface is presented, and 0 reads issued after it is presented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Integration checks and automated architecture checks      |
| Aggregation integrity          | 0 figures whose value changes when a record unrelated to that figure's own aggregation gains a row — each aggregation is computed in its own context and only then set beside the others                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Integration checks                                        |
| Demand-figure honesty          | 0 figures of what is still owed that include the outstanding quantity retained by a cancelled Customer Order, on either surface; Order Flow is the single exception and carries that quantity only within the week the Customer Order was recorded, where the cancelled part is presented as withdrawn and never as demand outstanding                                                                                                                                                                                                                                                                                                                                                              | Integration checks                                        |
| Exclusion accounting           | 100% of quantities and records a Panel excludes are reported on that Panel as a stated count — the undated Purchase Draft, the Purchase Draft still in Draft, the draft since Closed or Discarded, the demand owed beyond the eighth week, the line on which nothing was received, the unrecorded and the not-applicable verdict, and the Warehouse with no rate to report                                                                                                                                                                                                                                                                                                                          | Integration checks                                        |
| Retroactive-figure disclosure  | 100% of Panels whose past buckets can change without a new record being made say so on the Panel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Integration checks                                        |
| Row bounding                   | Every Panel keyed by Item or by Rejection Reason presents at most 10 named rows plus one Remainder Row, at every scale, those populations being unbounded; a Panel keyed by Warehouse presents every Warehouse the surface shows and carries no Remainder Row, its population being bounded at 20 by §1 — its list rows flex between 20 px and 26 px so every Warehouse still fits at that bound, and only once even the smallest row height cannot fit all of them does the Panel scroll internally while the surface around it does not, which is how this row and the one-screen layout row below it both hold at 20 Warehouses (ruled in [`sad.md` §11](../sad.md#11-risks-and-open-questions)) | Integration checks                                        |
| One-screen layout              | 100% of the Panels an actor is permitted are presented together without scrolling at and above 1280 × 800 CSS pixels, on both surfaces; below that width Panels stack in a stated order and the surface scrolls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Automated checks at the stated viewport and design review |
| Read freshness                 | A recorded, amended, cancelled or Fulfilled Customer Order, every Purchase Draft change, every Arrival Confirmation and every Rejection is reflected on the next read of either surface; 0 reads of superseded figures                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Integration checks                                        |
| Read-only guarantee            | 0 state changes, 0 records written and 0 quantities moved by any operation either surface performs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Automated architecture checks and integration checks      |
| Legibility without colour      | 100% of charts convey every series they present through a text label as well as through colour and position, and 0 figures are distinguishable by colour alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Automated accessibility checks and design review          |
| Authority staleness            | 0 authorization decisions made from Roles, Permissions, Workspace Roles, or Warehouse memberships held outside the request being authorized — each decision re-reads them from the store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Automated architecture checks and integration checks      |
| Authorization coverage         | 100% of the user-accessible capabilities this feature introduces have an explicit Permission rule and an ownership check at the level that owns the records read, reads included                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Automated architecture and integration coverage checks    |

## 6.1 Security / privacy

- **Data classification:** confidential — every figure on the Warehouse surface is an aggregate of that Warehouse's Customer Orders, which `ordering` already classifies confidential because they reveal what its customers buy, in what volume and when. The Workspace surface raises the blast radius rather than the classification: one read there spans every Warehouse in the Workspace.
- **Personal data touched:** none newly introduced, and none presented. No figure on either surface is keyed by a Customer, a Customer name or a Delivery Address, so the customer name `ordering` introduced reaches neither surface in any form.
- **AuthZ/AuthN impact:** the Warehouse surface adds no Permission at all — each of its charts is authorized by the watch Permission that already governs the records it reads, and a chart whose Permission the actor lacks is absent. The Workspace surface adds one Workspace Permission, because the Workspace vocabulary is entirely administrative today and nothing in it authorizes reading how the Warehouses are doing. It is introduced at the Workspace level because its subject is the comparison across Warehouses, which no single Warehouse owns; it is not composed from Warehouse memberships, because a Workspace Member holds none by default and the two levels never meet. It enters the catalogue as an assignable rather than a reserved entry, which AC-21 requires by granting it to a custom Workspace Role, and `workspaces` therefore adds it to every existing Workspace Owner Role when the release is applied, with no person acting (AC-21a) — without which the Workspace Owner, who holds the protected Owner Role and no other, could grant this surface to a colleague but never read it themselves.

  | Permission key                                               | Capability                                                                         | Exercised by                                            |
  | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
  | `CUSTOMER_ORDERS:WATCH` _(existing)_                         | Read the promised quantities behind the Warehouse's demand figures                 | AC-01, AC-02, AC-03, AC-07                              |
  | `ITEMS:WATCH` _(existing)_                                   | Read the On-hand Quantity and Item identity behind the Coverage Gap                | AC-01, AC-02, AC-03, AC-25                              |
  | `PURCHASE_DRAFTS:WATCH` _(existing)_                         | Read the Inbound Quantity, the expected arrivals and the pipeline                  | AC-01, AC-02, AC-02a, AC-07, AC-10, AC-11               |
  | `REJECTIONS:WATCH` _(existing)_                              | Read Reason Concentration and the Dispositions within it                           | AC-01, AC-12, AC-13                                     |
  | Workspace-level observation of Warehouse performance _(new)_ | Read every figure the Workspace surface presents across the Workspace's Warehouses | AC-14, AC-15, AC-16, AC-18, AC-19, AC-21, AC-21a, AC-22 |

  A Panel is present only when the actor holds every Permission its figures are drawn from, so the
  set below decides both which Panels a member sees and, when it admits none of them, that the
  Warehouse Dashboard is a denial rather than an empty screen (AC-02, AC-02a, AC-13):

  | Panel                | Permissions required together                                     |
  | -------------------- | ----------------------------------------------------------------- |
  | Coverage Gap         | `CUSTOMER_ORDERS:WATCH` + `ITEMS:WATCH` + `PURCHASE_DRAFTS:WATCH` |
  | Arrival Timing       | `CUSTOMER_ORDERS:WATCH` + `PURCHASE_DRAFTS:WATCH`                 |
  | Purchasing Pipeline  | `PURCHASE_DRAFTS:WATCH`                                           |
  | Reason Concentration | `REJECTIONS:WATCH`                                                |

- **Abuse cases:**
  - Cross-Warehouse reach through a Warehouse surface: deny any attempt to read the figures of a Warehouse the actor is not acting in, even when they hold a membership and the matching Permission there, and disclose nothing about whether that Warehouse holds anything.
  - Cross-Workspace reach through the Workspace surface: the Workspace a member observes is the one their session already establishes and is never named by the request, so no address, identifier or parameter can redirect the read at another Workspace's Warehouses.
  - Inference through a withheld chart: a chart the actor may not read is absent, and the remaining charts occupy the surface as though it had never been part of it, so neither a frame, a title, a zero nor a gap in the layout reports that something exists which the actor may not see. The surface a member sees describes their own authority, which they already hold, and never the Warehouse's contents.
  - Customer identity through an aggregate: no series, axis, bucket or hover is keyed by a Customer, a Customer name or a Delivery Address, and every figure presented is already visible to the same actor in the Customer Orders read, which withholds customer identity from anyone lacking `CUSTOMERS:WATCH` while showing these quantities. An Item-keyed quantity therefore discloses nothing the actor could not already read, and no redacted variant of either surface is required.
  - The new Workspace Permission as a back door onto administration: it admits reading figures and nothing else, so holding it changes no role, no membership and no Warehouse, and grants no read of any individual Customer Order, Purchase Draft, Item or Rejection record.
  - A derived surface as an unmetered read: both surfaces are read-only and are read on entering, and repeated entry is subject to the same rate limiting as every other read, so neither becomes a cheaper way to enumerate a Workspace's activity than the lists already allow.
  - Acting in an archived Warehouse: an archived Warehouse keeps serving its charts on exactly the Permission terms that applied before archiving, and the surface offers no operation that would change what it holds — matching the rule `ordering` already states for its watch capabilities.
- **Security review:** Required, because the feature introduces the first Workspace-level authority whose subject is Warehouse-owned business data, and because it presents aggregates of confidential records to an actor who may hold no membership in the Warehouses those records belong to.

## 7. Metrics / KPIs

This repository adds no telemetry, so each figure below names the source it is actually read from. "Operator query" means a query an operator runs against the deployment's own records on demand; it is not instrumentation and nothing is collected continuously.

- **Uncovered quantity carried** — baseline: not measurable today, since nothing computes it; target: the total Uncovered Quantity across a Warehouse's Items falls between the 30-day and the 90-day reading in at least half the Warehouses using the surface. Source: operator query, read at 30 and 90 days. This is the feature's whole thesis — that seeing the gap closes it — and it is the figure most likely to disappoint, because the surface only reports; a member still has to act.
- **Demand owed before its goods arrive** — baseline: not measurable today; target: the quantity owed in a week exceeding the quantity expected to reach the dock that week falls between the 30-day and the 90-day reading. Source: operator query, read at 30 and 90 days. Read together with the figure above, since both can improve by demand falling rather than by anything being done better.
- **Purchasing work left standing** — baseline: not measurable today; target: the number of Purchase Drafts whose Draft Age exceeds thirty days does not grow between two consecutive monthly readings. Source: operator query, read monthly. A Draft that has stood a month is either work nobody finished or a decision nobody cancelled; this figure does not distinguish them, and a rise is the prompt to look rather than a fault in itself.
- **Undated drafts on order** — baseline: not measurable today; target: fewer than 20% of Purchase Drafts in Ready for Ordering carry no Expected Arrival Date, at the 90-day reading. Source: operator query, read at 90 days. The timing chart and the on-time rate both exclude undated drafts, so this figure is what says whether those two are reading most of the Warehouse's record or a corner of it. A high figure means the charts are honest and nearly empty.
- **Conformance coverage** — baseline: 0% for every ending recorded before the arrival-inspection release, none of which was backfilled; target: ≥ 90% of Purchase Draft Lines whose ending recorded something received after this release carry a recorded Pre-receipt Conformance, at the 90-day reading. Source: operator query, read at 30 and 90 days. Below that, the receipt-reliability chart is comparing Warehouses on a record most of them do not keep.
- **Figures disputed** — baseline 0; target: 0 reported cases in which a figure presented on either surface disagrees with the records it was derived from, at all times. Source: support reports and integration-check results. A single such case costs more trust than the surface earns in a quarter, which is why §6 carries separate targets for aggregation integrity, cancelled-order exclusion and exclusion accounting rather than one for accuracy.
- **Cross-boundary exposure incidents** — baseline 0; target: 0 at all times, counted as reads of one Warehouse's figures from a request acting in another, reads of one Workspace's figures by a member of another, and coverage failures in which a withheld chart reaches an actor lacking its Permission through any surface. Source: automated coverage-check results, integration-check results, and support reports.
- **Surface adoption** — baseline 0; target: the Warehouse surface is not routed around — fewer than 10% of support conversations about an operational question cite a list as the place the question was answered, at the 90-day reading. Source: support reports, read at 90 days. There is no navigation telemetry in this repository and none will be added, so this figure is behavioural and weak by construction; it is recorded because the honest failure mode of a no-drill-through surface is that people read it once and go back to the lists, and that failure has no other signal.

## 8. Open questions

- [ ] Who amends `ordering` to record that a per-Item derived read may state the arithmetic between promised, held and ordered quantity, which its fourth boundary declined to state? The ruling is made (§1); the artifact it belongs in is not this one. _Default now:_ carried as a change against `ordering` alongside this feature rather than folded silently into it. — owner: `ordering` owner (Tech Lead), due: before `design`
- [ ] Who amends `ordering` and `delivery-addresses` to record that the Expected Arrival Date speaks for its draft's Via Warehouse lines only, and that a line's recorded ending is taken as its arrival? _Default now:_ carried as a change against both alongside this feature. — owner: `delivery-addresses` owner (Tech Lead), due: before `design`
- [ ] Who amends the three invariants that together forbid the Workspace surface — `workspaces`' rule that a Workspace Permission never authorizes an operation inside a Warehouse, `ordering`'s rule that every operation on a Warehouse-owned record is authorized by the Role held in that Warehouse together with the §3 rationale that excluded cross-Workspace reading, and `arrival-inspection`'s rule that nothing it reads crosses that boundary including across the Warehouses of one Workspace? All three must move together or the surface rests on one amendment and two contradictions. _Default now:_ carried as one change against all three, reviewed by the Security Lead with this feature's security review. — owner: `workspaces` owner (Tech Lead) + Security Lead, due: before `design`
- [ ] What timezone decides which week a date belongs to, and whether goods arrived on time? No Warehouse, Workspace or user timezone is recorded anywhere in the product, yet every chart buckets by week and the On-time Arrival Rate compares a date against a recorded moment. _Default now:_ one timezone for the whole deployment, with weeks beginning on Monday, stated wherever a week is labelled. — owner: Tech Lead, due: before `data-model`
- [ ] Does Reason Concentration justify the index `arrival-inspection` deliberately did not create? That decision reads "Add it when a product surface filters by Reason; the Rejection Register that would is deferred" — this is that surface, and it turns a monthly operator query into a read on entering a Warehouse. _Default now:_ yes, add it with this feature. — owner: Backend Lead, due: before `data-model`
- [ ] How do the figures stay fresh after a member acts? No operation shipped in `ordering`, `delivery-addresses` or `arrival-inspection` knows these reads exist, so nothing currently marks them stale, and AC-26 has no mechanism behind it yet. _Default now:_ every operation that changes a record these surfaces read declares the figures it makes stale. — owner: Frontend Lead, due: before `tasks`
- [ ] Is a read on entering enough, or does either surface need to refresh while it is open? _Default now:_ a read on entering, matching every destination the product already has, with no polling and no refresh control. — owner: PM, due: before `design`
- [ ] Is the Workspace-level observation one Permission or one per record family? One key is simpler to grant and matches the fact that the surface is read as a whole; several would let a Workspace Role see demand pressure without receipt quality. _Default now:_ one. — owner: Tech Lead, due: before `data-model`
- [ ] Which Warehouses does the Workspace surface show — every Warehouse in the Workspace, or only those still active? Archived Warehouses retain their records and a Workspace may hold several. _Default now:_ active Warehouses only, with archived ones excluded and their number stated. — owner: PM, due: before `design`
- [ ] Does the absence of drill-through leave the surface actionable? Every comparable product treats clicking a figure through to its records as ordinary, and the product's own stated job is deciding what to phone the supplier about. _Default now:_ it stays a non-goal for this release. — owner: PM, due: before `ship`, and reviewed against the adoption figure in §7 at 90 days
- [ ] Which charting library, and does the choice warrant an ADR? This is the repository's first charting dependency — `apps/web` carries none — and the request proposes d3. A choice of that weight has gone to an ADR before in this repository. _Default now:_ d3, recorded in an ADR. — owner: Tech Lead, due: before `design`
- [ ] How does the Workspace surface behave for a Workspace with only one Warehouse left to show? Every Workspace keeps at least one Warehouse that is not archived, so the surface is never empty, but a Workspace whose other Warehouses are all archived reduces three of its four Panels to a comparison of one. _Default now:_ presented unchanged, comparing what there is. — owner: PM, due: before `design-ui`
- [ ] What Rejection volume does §1 assume? The scale boundary fixes Items, Unfulfilled Customer Orders and open Purchase Drafts but states no Rejection figure, and neither `ordering` nor `arrival-inspection` supplies one — yet §6's 600 ms target covers a surface whose fourth Panel reads Rejections at that scale, and the index question below cannot be answered against an unstated row count. Rejections are cumulative rather than a standing level: they accrue against closed drafts and are never deleted. _Default now:_ none assumed; the figure is set beside the other three in §1 when the index question is decided. — owner: Tech Lead, due: before `data-model`
- [ ] Does either surface need to state when it was read? Every figure is a snapshot of the moment it was requested, and neither surface carries any prose. _Default now:_ no; the surface is read on entering and is never left open long enough to go stale unnoticed. — owner: PM, due: before `design-ui`
