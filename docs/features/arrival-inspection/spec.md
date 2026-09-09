---
status: Draft
owner: 'PM + Tech Lead'
reviewers: ['Tech Lead', 'Security Lead']
updated_at: '2026-09-07'
feature_size: 'L'
---

# Spec — arrival-inspection

> **Glossary:** [CONTEXT](./CONTEXT.md), read together with [`access`](../access/CONTEXT.md),
> [`ordering`](../ordering/CONTEXT.md) and [`delivery-addresses`](../delivery-addresses/CONTEXT.md),
> which own the roles and domain objects this feature builds on.
> **Reference module / docs / channels used:** the shipped per-line ending in
> `apps/server/src/purchase-drafts` and its arrival command; the Packaging Type catalogue in
> `apps/server/migrations` and `packages/contracts/src/purchase-drafts`, which is the model the
> Rejection Reason catalogue follows; `docs/change-requests/ordering-amendments/change.md`;
> `docs/local/warehouse-mvp-feature-descriptions.md`.

## 1. Context

An arrival records how much came and nothing about the state it came in. `ordering` gave a Warehouse Member the loop from demand to supplier and back — a Customer Order records who is waiting, a Purchase Draft records what the supplier was told, and a line's ending records what physically turned up — and `delivery-addresses` split that ending per line. What no release has provided is any judgement of **condition**. Because a quantity recorded as arrived may be allocated, and an Allocation reduces the customer's Outstanding Quantity, a crushed pallet, a cable coil with a severed run and a carton holding the wrong Item all reduce demand exactly as sound goods do. The customer drops off the consolidated demand while still waiting, and the member learns of it when the customer telephones. This matters more here than in a storing warehouse: Warehouser cross-docks, so the dock is the only moment anyone looks at the goods before the customer does — there is no put-away, no cycle count, no buffer stock to absorb a bad delivery, and no second pair of eyes downstream. A refusal converts directly into a customer waiting longer, and today the product cannot tell that customer apart from one whose goods were never ordered.

This is the release to correct it, because the records it attaches to have just landed and almost no operational history sits behind them. Adding a condition dimension now costs a judgement recorded beside an ending that is already written once; adding it after a year of Allocations means every historical Allocation silently asserts that the goods were sound without anyone ever having said so. `ordering` named the gap itself when it excluded recording whether a Pre-receipt Requirement was met on arrival, on the grounds that verifying packaging and labelling is an inspection step it did not provide. That step is what this release provides.

The committed approach is to make the Arrival Inspection part of the line's ending rather than a process that happens afterwards, and to make the reason for a refusal a stated value rather than a sentence in a note. The member recording an ending states what the supplier presented and refuses part of it as one or more Rejections, each carrying one Rejection Reason from a catalogue the team maintains, and records whether the frozen Pre-receipt Requirement was honoured; the Accepted Quantity is what remains, and it is the only quantity an Allocation may draw on, so a refusal leaves the customer's Outstanding Quantity where it was. Competitive research supports both halves of that shape and warns about the third: Dynamics 365 Supply Chain Management is the only studied product that both blocks allocation of rejected quantity and ships a reason taxonomy, but it does so as a separately configured quality module bolted on after receiving and organized around a vendor record; Odoo, NetSuite and SAP EWM likewise model inspection as a downstream step with its own status; Zoho and Fishbowl keep receiving simple and drop reason, evidence and demand restoration altogether, Fishbowl's refusal being a quantity with no reason at all. **No studied product splits one receiving line into sub-quantities each carrying its own reason**, which is the thing this feature does that the market does not. What the market warns about is the second half: a multi-perspective review scored the full proposal negatively on engineering, executive and user lenses at once, because it stacked three capabilities with no precedent in this codebase behind a build whose payoff could not be observed for several reporting periods. This release therefore takes the judgement and leaves the visibility: proposed RICE favoured the reduced scope (2.6 against 0.75 for the full one, on a confidence of 0.7 against 0.4), and feasibility is confirmed for the judgement half because it mirrors shapes `ordering` and `delivery-addresses` have already shipped.

Six boundaries are stated here so they are not re-derived downstream. **First**, the Condition Split and the Pre-receipt Conformance are recorded with the line's ending and never afterwards, which keeps the write-once ending `delivery-addresses` settled intact but means damage found when a carton is opened two days later has no home in this release; §3 excludes it and §8 carries the consequence, which is that such damage will be written into some other free-text field instead of being lost visibly. **Second**, this feature amends approved specifications in six places — it supersedes `ordering`'s non-goal excluding proof that a Pre-receipt Requirement was met, narrows its Allocation bound from the received quantity to the Accepted Quantity, widens the enumerated list of writes a frozen draft accepts, narrows its glossary claim that arrival is not a receiving process with inspection, replaces its rule that the quantity received for a line is whatever physically arrived — since a sealed unit that declared more than it held is presented in full and refused in part, so the recorded figure is what the supplier stood behind rather than what was in the carton — and supersedes `delivery-addresses`' default that a customer disputing a directly delivered line is handled by correcting the Customer Order, since such a refusal is now recorded against that line's ending with its reason. That release's exclusion of proof stands: this feature verifies nothing a customer reports. None is a detail of this feature, so all six are raised as a change request rather than asserted here, and §8 records it. **Third**, three things this release states are deliberate departures from documented warehouse practice rather than conventions it inherits: a fixed catalogue of reasons where the literature describes free-text examples and no studied product ships a closed list; a Refused at delivery disposition where the literature describes no door refusal at all and an invariable offload-then-quarantine pattern; a Short within packaging reason where the literature treats a short inner-pack as one undifferentiated non-compliance beside condition failures. Each is a product decision made knowingly, and none may be presented downstream as trade practice. Seven further rules — that the Received Quantity is what was presented rather than what physically arrived, that the Accepted Quantity is derived rather than stated, that no refusal may follow a recorded ending, that a conformance judgement and a packaging refusal must agree, that refused demand is re-ordered by hand, that a Fulfilled order can never revert, and how a short sealed unit is counted — were settled by the product owner after a domain authority reported that it could not source them. They are this product's decisions, not documented warehouse practice, and `design` and `data-model` must not cite them as convention. Clarification settled six more of exactly that kind, on the same footing and under the same prohibition: that a line frozen carrying either instruction must be judged honoured or not honoured and only a line given no instruction records that the judgement does not apply; that a decided Disposition may be corrected to another decision but never returned to undecided; that the Rejection Reason catalogue is extended only, never reworded or retired, so a Rejection names its reason rather than copying it; that a line where nothing was received records neither a Condition Split nor a Pre-receipt Conformance; that the member alone judges when a Direct to Customer line's ending is final, no reporting window being introduced; and that a member's prose on a Rejection stops at one thousand characters. The domain authority could source none of them either, and reported that the literature records supplier non-conformance only as a free-text exception log with no per-line ledger of any kind — so the closed conformance judgement this feature ships has no counterpart in documented practice to be cited as one. **Fourth**, the Received Quantity counts what the supplier presented, including goods refused at the door and goods a sealed unit declared but did not hold, so the Condition Split always balances and the Disposition rather than the arithmetic says where refused goods went. **Fifth**, the reason recorded at the dock reaches only a member who opens the closed Purchase Draft it lives on: the Rejection Register and the Rejection Marker that would carry it to the consolidated demand are deferred to an immediate follow-up, and the cost of deferring them is that a restored shortfall reappears looking exactly like demand that was never ordered — which is the problem this specification opens with, solved at the dock and not yet at the point of re-ordering. **Sixth**, the §6 targets assume the volumes `ordering` already assumes, at which every list this feature touches is returned whole rather than in pages, because this release adds no list of its own.

## 2. Goals

- Make the condition of arriving goods a recorded judgement rather than an assumption, so that a quantity a customer is told to expect is a quantity somebody actually looked at.
- Keep a customer waiting when the goods meant for them arrived unusable, so that the shortfall stays on the consolidated demand to be re-ordered instead of being discovered by the customer.
- Make the reason for a refusal a comparable value rather than a sentence in a note, and record it against the order it happened on so the account of that order is complete rather than optimistic.
- Make a supplier's compliance with the packaging and labelling instruction they were given a recorded fact rather than a member's recollection.

## 3. Non-goals

- Suppliers as records, supplier scorecards, and vendor performance ratings are excluded because the product models no supplier at all, exactly as `ordering` settled; a Rejection therefore says what was refused and why, and never who sent it.
- Claims, debit notes, chargebacks, return authorization numbers and any financial recovery are excluded for the same reason `ordering` excludes pricing: the product holds no money and no counterparty, and settling one side of a commercial dispute in software is a maintenance burden with no decision attached to it.
- Returning refused goods as a modelled movement, quarantine areas, and put-away of refused goods are excluded because there is no Stock Movement ledger and no Locations; a Disposition records what a member decided, not that goods went anywhere.
- Raising a Rejection after a line's ending has been recorded — including damage found when a carton is opened days later — is excluded because an ending is recorded once, and a change of condition after arrival belongs with the movement ledger a later release introduces.
- Photographic evidence attached to a Rejection is excluded from this release because the product has no binary-asset surface of any kind and a photograph has no redacted form, so it would disclose through an image the customer identity every other read redacts field by field; it is deferred to a feature that can decide storage, retention and disclosure properly.
- The Rejection Register and the Rejection Marker are excluded from this release and deferred to an immediate follow-up, because both are read surfaces over records this release already creates and neither is needed to stop unusable goods reducing demand.
- Automatically re-ordering a refused shortfall is excluded for the same reason `ordering` excludes suggested quantities: a human decides what to buy.

## 4. User stories

### US-01: Judge what arrived

**As a** Warehouse Member permitted to record an arrival
**I want** to record how much of a line I accept and how much I refuse
**So that** a crushed pallet is not recorded as goods a customer can have

### US-02: State why, not only how many

**As a** Warehouse Member permitted to raise Rejections
**I want** to state a reason for each quantity I refuse
**So that** eight crushed and eight of the wrong item are not the same record

### US-03: Refuse for more than one reason at once

**As a** Warehouse Member permitted to raise Rejections
**I want** to split one line's refused quantity across several reasons
**So that** a delivery that was partly crushed and partly wrongly packed is recorded as it actually was

### US-04: Assign only sound goods

**As a** Warehouse Member permitted to record an arrival
**I want** the system to let me assign to customers only what I accepted
**So that** a customer stops waiting only for goods they can actually be given

### US-05: Describe the problem for the supplier

**As a** Warehouse Member permitted to raise Rejections
**I want** to describe in my own words what was wrong with the goods
**So that** I can put the problem to the supplier with more than a reason code

### US-06: Say whether the supplier followed instructions

**As a** Warehouse Member permitted to record an arrival
**I want** to record whether the Packaging Type and Value-adding Note frozen on the line were honoured
**So that** a supplier who keeps ignoring them is visible on the order it happened on

### US-07: Decide what happens to the refused goods

**As a** Warehouse Member permitted to amend Rejections
**I want** to record, and later change, whether refused goods went back on the vehicle, are held for return, or were scrapped here, and to correct my description of what was wrong
**So that** a decision taken after a telephone call is not lost

### US-08: See how the order actually turned out

**As a** Warehouse Member permitted to watch Purchase Drafts
**I want** a closed draft to show, for each line, what was ordered, presented, accepted and refused, and for what reasons
**So that** the record of an order is complete rather than optimistic

### US-09: Record what the customer refused

**As a** Warehouse Member permitted to raise Rejections
**I want** to record that a directly delivered line was refused by the customer and why
**So that** goods that never touched my dock are accounted for the same way as goods that did

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** an authorized Warehouse Member is recording the ending of a Purchase Draft Line for which the supplier presented one hundred units
**When** the member states that one hundred were presented, refuses eight of them, and states the Pre-receipt Conformance judgement that ending carries
**Then** the system records the line's ending showing one hundred presented, eight refused and ninety-two accepted, and confirms it to the member

An ending that refuses any quantity states a Pre-receipt Conformance judgement, because a refusal is only readable beside one; an ending that refuses nothing may state none, which is what a member holding no `REJECTIONS:CREATE` records (AC-01b) and what a line where nothing was received records (AC-04a). An ending that refuses without a judgement is blocked under `purchase_drafts.condition_split_invalid`. _(Added by the 2026-09-09 review: the rule shipped in code and in no approved artifact.)_

### AC-01a (US-01) — authorization

**Given** a Warehouse Member permitted to record an arrival but not permitted to raise Rejections
**When** the member attempts to record an ending that refuses part of what was presented
**Then** the system declines the refusal, tells the member that refusing goods needs a capability they do not hold, and records no part of the ending

### AC-01b (US-01) — authorization

**Given** a Warehouse Member permitted to record an arrival but not permitted to raise Rejections
**When** the member records an ending that refuses nothing of what was presented
**Then** the system records the ending, since the capability to refuse goods is required only by an ending that refuses some

### AC-02 (US-01) — domain invariant violation

**Given** an authorized Warehouse Member is recording an ending for which the supplier presented one hundred units
**When** the member refuses quantities totalling more than one hundred
**Then** the system blocks the ending and tells the member that no more can be refused than was presented

### AC-03 (US-01) — error

**Given** an authorized Warehouse Member is recording an ending
**When** the member refuses a quantity that is not a whole number greater than nothing
**Then** the system blocks the ending and tells the member that a refused quantity must be a whole number of at least one

### AC-04 (US-01) — domain invariant violation

**Given** a Purchase Draft Line whose ending has already been recorded
**When** an authorized Warehouse Member attempts to record a further refusal against it
**Then** the system blocks the attempt and tells the member that a line's ending, including its condition, is recorded once and cannot be revisited

### AC-04a (US-01) — happy path

**Given** an authorized Warehouse Member is recording the ending of a Purchase Draft Line for which the supplier delivered nothing at all
**When** the member records that nothing was received
**Then** the system records the line's ending with nothing received, no condition breakdown and no judgement of the supplier's instruction, and confirms it to the member

### AC-05 (US-02) — happy path

**Given** an authorized Warehouse Member is refusing part of what was presented on a line
**When** the member states that the refused units were damaged in transit
**Then** the system records that reason against that refused quantity, and it is shown with the line when the closed draft is read

### AC-06 (US-02) — error

**Given** an authorized Warehouse Member is refusing part of what was presented
**When** the member states a reason that is not one the catalogue offers
**Then** the system blocks the ending and tells the member which reasons are available, and that the list is maintained by the team rather than by members

### AC-07 (US-02) — domain invariant violation

**Given** an authorized Warehouse Member is refusing part of what was presented
**When** the member states the reason "unfit — other" and leaves the description empty
**Then** the system blocks the ending and tells the member that this reason always requires a description of what was wrong

### AC-08 (US-03) — happy path

**Given** an authorized Warehouse Member is recording an ending for a delivery that was partly crushed and partly packed against instruction
**When** the member refuses five units as damaged by packing and three as packaging not as instructed on the same line
**Then** the system records both refusals with their own quantities and reasons against that line, and the accepted quantity is what remains after both

### AC-09 (US-03) — domain invariant violation

**Given** an authorized Warehouse Member is composing an ending on which five units are already refused as damaged in transit
**When** the member adds a further refusal of three units on the same line for that same reason and submits the ending
**Then** the system blocks the ending and tells the member that one line carries one refusal per reason, and that the quantities for a reason belong together

### AC-10 (US-04) — happy path

**Given** an authorized Warehouse Member has accepted ninety-two units on a line linked to two Customer Orders that are still waiting
**When** the member assigns sixty to one and thirty-two to the other
**Then** the system records both assignments and reduces what each of those customers is still waiting for accordingly

### AC-11 (US-04) — domain invariant violation

**Given** an authorized Warehouse Member has presented one hundred units on a line and refused eight of them
**When** the member attempts to assign one hundred units to the customers waiting for that line
**Then** the system blocks the ending and tells the member that only accepted goods may be assigned, and that eight of the hundred were refused

### AC-12 (US-04) — cross-context

**Given** an authorized Warehouse Member is recording an ending on a line linked to a Customer Order that has since been cancelled
**When** the member attempts to assign accepted goods to that Customer Order
**Then** the system blocks the ending, tells the member that the order it names is no longer waiting for anything, and records no part of it

### AC-13 (US-05) — happy path

**Given** an authorized Warehouse Member is refusing part of what was presented
**When** the member describes in their own words what was wrong with the goods
**Then** the system records that description with the refusal, and it is shown to any member permitted to read the refusal

### AC-14 (US-05) — error

**Given** an authorized Warehouse Member is refusing part of what was presented
**When** the member submits a description longer than one thousand characters
**Then** the system blocks the ending and tells the member that a description must stay within one thousand characters

### AC-15 (US-06) — happy path

**Given** an authorized Warehouse Member is recording the ending of a Purchase Draft Line that was frozen carrying a Packaging Type and a Value-adding Note
**When** the member records that the supplier did not honour them and states what was wrong
**Then** the system records that judgement against the line with the member's note, and it is shown with the line when the closed draft is read

### AC-15a (US-06) — happy path

**Given** an authorized Warehouse Member is recording the ending of a Purchase Draft Line that was frozen carrying both a Packaging Type and a Value-adding Note, of which the supplier honoured the packaging but not the note
**When** the member records the judgement
**Then** the system records that the frozen instruction was not honoured, with the member's note naming which of the two failed, since one judgement covers both

### AC-15b (US-06) — error

**Given** an authorized Warehouse Member is recording that the frozen instruction was not honoured
**When** the member submits a note longer than one thousand characters
**Then** the system blocks the ending and tells the member that the note must stay within one thousand characters

### AC-16 (US-06) — domain invariant violation

**Given** an authorized Warehouse Member is recording an ending that refuses units because the packaging was not as instructed
**When** the member also records that the frozen instruction was honoured
**Then** the system blocks the ending and tells the member that the two statements contradict each other, since a refusal for that reason is the instruction not being met

### AC-17 (US-06) — cross-context

**Given** a Purchase Draft Line that was frozen without any Packaging Type or Value-adding Note
**When** an authorized Warehouse Member records its ending and states that the instruction was honoured
**Then** the system blocks the ending and tells the member that a line carrying no instruction can only record that the judgement does not apply

### AC-17a (US-06) — domain invariant violation

**Given** a Purchase Draft Line that was frozen carrying a Packaging Type, a Value-adding Note, or both
**When** an authorized Warehouse Member records its ending and states that the judgement does not apply
**Then** the system blocks the ending and tells the member that a line carrying an instruction must be judged as honoured or not honoured, and that the judgement does not apply only to a line that was given no instruction

### AC-18 (US-07) — happy path

**Given** a recorded Rejection whose disposition is still undecided
**When** an authorized Warehouse Member records that the goods are being held for return
**Then** the system records the new disposition together with the member who set it and when, and changes no quantity on the line

### AC-18a (US-07) — domain invariant violation

**Given** a Rejection whose disposition has been recorded as held for return
**When** an authorized Warehouse Member attempts to return it to undecided
**Then** the system blocks the change and tells the member that a disposition once decided may be corrected to another decision but never returned to undecided

### AC-18b (US-07) — happy path

**Given** a recorded Rejection carrying the member's description of what was wrong
**When** an authorized Warehouse Member corrects that description
**Then** the system records the corrected description together with the member who changed it and when, and changes no quantity, reason or source on the Rejection

### AC-19 (US-07) — error

**Given** a recorded Rejection
**When** an authorized Warehouse Member states a disposition that is not one of those the system offers
**Then** the system blocks the change and tells the member which dispositions are available

### AC-20 (US-07) — authorization

**Given** a Warehouse Member permitted to read Rejections but not permitted to amend them
**When** the member attempts to change a Rejection's disposition
**Then** the system declines the change, tells the member that amending a refusal needs a capability they do not hold, and leaves the disposition as it was

### AC-21 (US-08) — happy path

**Given** an authorized Warehouse Member opens a Purchase Draft that has been closed
**When** the member reads a line whose goods were partly refused
**Then** the system shows what was ordered, what the supplier presented, the Accepted Quantity and the Rejected Quantity, with each refused quantity beside its reason and description

### AC-22 (US-08) — authorization

**Given** a Warehouse Member permitted to read Purchase Drafts but not permitted to read Rejections
**When** the member opens a closed draft holding a line whose goods were partly refused
**Then** the system shows what was ordered, what the supplier presented, the Accepted Quantity and one total Rejected Quantity, and withholds every reason, description and disposition together with the division of that total into separate refusals, without indicating what has been withheld

### AC-23 (US-08) — cross-context

**Given** a Purchase Draft Line that was frozen naming a Packaging Type, read after the catalogue has been extended with further types
**When** an authorized Warehouse Member reads the closed draft
**Then** the system shows the Packaging Type frozen on the line at the time it was ordered rather than any later reading of the catalogue

### AC-23a (US-08) — cross-context

**Given** a Rejection recorded before the Rejection Reason catalogue was extended with further reasons
**When** an authorized Warehouse Member reads the closed draft it belongs to
**Then** the system shows the reason the member stated, unchanged by the extension, the catalogue being extended only and never reworded beneath a recorded Rejection

### AC-24 (US-09) — happy path

**Given** an authorized Warehouse Member is recording the ending — not yet recorded — of a line whose goods went straight from the supplier to the customer, and the customer has reported that some arrived broken
**When** the member records the delivery and refuses the broken units, stating that the customer reported it
**Then** the system records the refusal against that line, marks its source as reported by the customer rather than inspected at our own dock, and leaves that quantity assigned to nobody

### AC-25 (US-09) — domain invariant violation

**Given** an authorized Warehouse Member is recording the ending of a line whose goods were delivered to the Warehouse's own dock
**When** the member attempts to record a refusal as reported by the customer
**Then** the system blocks the ending and tells the member that a refusal on goods arriving at our own dock carries the inspected source, and only directly delivered goods carry a customer's report

### AC-26 (US-08) — authorization

**Given** a Warehouse Member acting in one Warehouse who holds no membership in another
**When** the member attempts to read or amend a Rejection belonging to that other Warehouse
**Then** the system denies the attempt without disclosing whether that Rejection exists

## 6. Non-functional requirements

| Aspect                        | Target                                                                                                                                                                                                                                                                                                                                                                                                                                       | Measurement                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Authorization evaluation      | Authorization stage p95 ≤ 50 ms per protected operation this feature introduces, including the ending that carries a Rejection and therefore requires two Permissions together                                                                                                                                                                                                                                                               | Structured server timing logs                        |
| Line ending latency           | p95 ≤ 500 ms for recording a line's ending with its Condition Split, its Pre-receipt Conformance, every Rejection and every Allocation, excluding client network time                                                                                                                                                                                                                                                                        | Structured server timing logs                        |
| Closed draft read latency     | p95 ≤ 250 ms for a closed Purchase Draft and the condition breakdown of every one of its lines, excluding client network time                                                                                                                                                                                                                                                                                                                | Structured server timing logs                        |
| Disposition amendment latency | p95 ≤ 300 ms, excluding client network time                                                                                                                                                                                                                                                                                                                                                                                                  | Structured server timing logs                        |
| Ending atomicity              | 100% of recorded endings write the line's Condition Split, its Pre-receipt Conformance, every Rejection, every Allocation, and the resulting Outstanding Quantity of every Customer Order assigned to together, or write none of them; the failure of any one part of a submission leaves nothing recorded. A line where nothing was received records neither a Condition Split nor a Pre-receipt Conformance and is not counted in this row | Integration checks                                   |
| Condition-split integrity     | 0 Purchase Draft Lines whose recorded refusals total more than the quantity presented, and 0 Allocations exceeding the Accepted Quantity of the line they draw on                                                                                                                                                                                                                                                                            | Integration checks                                   |
| Conformance consistency       | 0 Purchase Draft Lines recording that the frozen instruction was honoured while carrying a refusal for packaging not as instructed or for a value-adding note not applied, and 0 Purchase Draft Lines frozen carrying a Packaging Type or a Value-adding Note whose Pre-receipt Conformance is recorded as not applicable                                                                                                                    | Integration checks                                   |
| Catalogue integrity           | 0 Rejections carrying a reason outside the catalogue, 0 reasons added, renamed or removed by any member, and 0 reasons renamed or retired by anyone — the catalogue is extended only, so a Rejection names its reason rather than copying its wording; extending the catalogue changes no recorded Rejection and no frozen line                                                                                                              | Integration checks and automated architecture checks |
| Frozen-record integrity       | 0 recorded changes to the lines, ordered quantities, links, Expected Arrival Date, Delivery Mode, Delivery Address or Pre-receipt Requirements of a Purchase Draft after it reaches Ready for Ordering. The Condition Split, the Pre-receipt Conformance and the Rejections this feature records join the ending quantities, Allocations, closure reason and Closed state as permitted additions, and are not counted as changes             | Integration checks and automated architecture checks |
| Condition immutability        | 0 recorded changes to the fixed part of a Rejection Record — its quantity, reason, source and line — after it is recorded, 0 Rejections recorded against a line whose ending was already recorded, and 0 dispositions returned to undecided after a decision was recorded. Every amendment of a description or disposition records the acting member and the time                                                                            | Integration checks                                   |
| Authority staleness           | 0 authorization decisions made from Roles, Permissions, or Warehouse memberships held outside the request being authorized                                                                                                                                                                                                                                                                                                                   | Automated architecture checks and integration checks |
| Authorization coverage        | 100% of the user-accessible capabilities this feature introduces have an explicit Permission rule and Warehouse ownership check, reads included, and that includes the conditional rule whose required Permission set depends on whether the ending being recorded carries a Rejection                                                                                                                                                       | Automated architecture and integration checks        |

## 6.1 Security / privacy

- **Data classification:** confidential — a Rejection states that a named Warehouse refused specific goods on a specific order for a stated reason, which is commercially sensitive about the operator and about the supplier the reader can often infer, and it sits on records that already carry the Warehouse's customer demand.
- **Personal data touched:** none newly introduced. A Rejection carries the identifier of the member who raised or amended it and the time they did, which is the same attribution `ordering` already records for an On-hand adjustment. The free-text description is a statement about goods; a member who types a driver's or a customer contact's name into it puts personal data somewhere this specification does not expect it, which is why §6.1's abuse cases treat it as confidential text of the same classification as the record carrying it.
- **AuthZ/AuthN impact:** adds Warehouse-level capabilities under the existing model without changing it. Every key below is a Warehouse Permission because the subject of each is a resource a Warehouse owns; the protected Warehouse Manager Role receives all of them, members cannot create or rename Permission keys, and every read is protected on the same terms as every write. Recording an ending that refuses goods requires `PURCHASE_DRAFTS:RECEIVE` **and** `REJECTIONS:CREATE` together, while an ending that refuses nothing requires only `PURCHASE_DRAFTS:RECEIVE` (AC-01a, AC-01b). The second Permission is therefore demanded by a Rejection being present in what is recorded rather than by the operation itself, which makes this both the first rule in the product to require two Permissions at once and the first whose required set depends on what is being written.

  | Permission key            | Capability                                                                                                                           | Exercised by                                                              |
  | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
  | `PURCHASE_DRAFTS:RECEIVE` | _(existing, extended)_ Record a line's ending with its Condition Split and its Pre-receipt Conformance, and assign what was accepted | AC-01, AC-01b, AC-04a, AC-10, AC-11, AC-15, AC-15a, AC-15b, AC-17a, AC-24 |
  | `PURCHASE_DRAFTS:WATCH`   | _(existing)_ Read the Warehouse's Purchase Drafts, including the ending quantities of a closed one                                   | AC-21, AC-22, AC-23, AC-23a                                               |
  | `REJECTIONS:CREATE`       | Refuse part of what a line presented, stating its reason, description and source                                                     | AC-01, AC-01a, AC-05, AC-08, AC-13, AC-14, AC-24, AC-25                   |
  | `REJECTIONS:WATCH`        | Read a Rejection's reason, description and disposition                                                                               | AC-21, AC-22, AC-23a, AC-26                                               |
  | `REJECTIONS:UPDATE`       | Amend a Rejection's description or disposition                                                                                       | AC-18, AC-18a, AC-18b, AC-20, AC-26                                       |

- **Abuse cases:**
  - Cross-Warehouse reach: deny any attempt to read or amend a Rejection belonging to a Warehouse the actor is not acting in, even where they hold a membership and the matching Permission there, and do not disclose that the Rejection exists (AC-26).
  - Supplier and customer disclosure through a refusal: a Rejection read by a member holding `PURCHASE_DRAFTS:WATCH` without `REJECTIONS:WATCH` shows the ordered, presented and accepted quantities and one total refused quantity, and withholds every reason, description and disposition together with how many separate refusals the line carries, doing so without indicating that anything was withheld — so neither why goods were refused nor how many distinct things went wrong can be inferred by probing. That a refusal happened at all stays visible to such a reader, since the presented and accepted quantities differ; the protection is over the cause of a refusal and never over the fact of one (AC-22).
  - Scope leaking into free text: the Rejection description and the Pre-receipt Conformance note are presented as statements about goods; personal data, supplier contacts, prices or payment terms recorded there exist outside every handling this specification assumes, and text submitted into either is rendered as text and never as markup or a link.
  - Condition as unaudited fiction: a Rejection's quantity, reason, source and line cannot be changed after recording, and every amendment of a description or disposition records the acting member and the time, so a refusal that is later disputed can at least be attributed.
  - Refusal as a route around the Allocation bound: because the Accepted Quantity is derived rather than stated, no member can raise the quantity available for assignment by editing a figure; the only way to assign more is to have refused less, which is recorded and attributable.
- **Security review:** Required — the feature introduces a new authorization boundary, three new Permission keys, and the product's first authorization rule whose required Permission set is decided by what is being written rather than by the operation alone.

## 7. Metrics / KPIs

This repository adds no telemetry, so each figure below names the source it is actually read from. "Operator query" means a query an operator runs against the deployment's own records on demand; it is not instrumentation and nothing is collected continuously. Because the Rejection Register is deferred, every figure here is read by an operator against the records themselves rather than from a surface the product presents.

- **Arrivals carrying a condition judgement** — baseline 0%; target ≥95% of Purchase Draft Line endings recorded after this release on which something was received carry a Condition Split and a Pre-receipt Conformance, at the 90-day reading; a line where nothing arrived records neither and is excluded from the denominator, as are endings recorded before this release. Source: operator query, read at 30 and 90 days. A high figure here is necessary but not sufficient, and is read together with the next one, which is what distinguishes a judgement from a formality.
- **Endings that refuse nothing** — baseline: not measurable today, since no ending records condition; target: the share of endings recording zero refusals is below 98% at the 90-day reading, and is compared against the operator's own known damage rate. Source: operator query, read at 90 days. This is the feature's honesty check. Recording no refusal is the fastest path through the dock and the form opens pre-filled with the ordered quantity, so a warehouse can carry a Condition Split on every line and refuse nothing all year — at which point the metric above reads as complete adoption while the feature has produced no data at all. A figure at or above 98% is read as non-adoption, not as a clean quarter.
- **Rejections carrying a specific reason** — baseline 0%; target ≥90% of Rejections carry a reason other than "unfit — other", at the 90-day reading. Source: operator query, read at 90 days. Read with care in both directions: a rising share of "unfit — other" is the designated signal that the catalogue is wrong and must be extended, but it is also the only reason requiring the member to type, and therefore the most expensive to choose at a dock — so a low share may mean the catalogue fits reality, or may mean members are choosing whichever reason is nearest.
- **Reason concentration** — baseline 0; target: no single Rejection Reason accounts for more than 60% of the Rejections recorded in a monthly reading. Source: operator query, read monthly. A distribution that concentrated indicates the reason easiest to select rather than what actually happened, and is the counterweight to the metric above.
- **Demand kept outstanding by a refusal** — baseline 0; target: 0 Customer Orders that became Fulfilled on a line where the Accepted Quantity did not cover what was assigned, and 0 Allocations exceeding the Accepted Quantity of the line they draw on, at all times. Source: integration-check results.
- **Refusals discovered by the customer rather than at the dock** — baseline: not measurable today; target: 0 Rejections carrying the customer-reported source on lines delivered to our own dock, at all times. Source: integration-check results and operator query, read at 90 days. Such a line should never produce one, so any occurrence is a failure of dock inspection rather than a tolerance to tune.
- **Refusals left undecided** — baseline 0; target: the count of Rejections still carrying an undecided disposition more than 30 days after being raised does not grow between two consecutive monthly readings. Source: operator query, read monthly.
- **Condition-data exposure incidents** — baseline 0 under the boundaries this feature adopts; target: 0 at all times, counted as reads of one Warehouse's Rejections from a request acting in another, and 0 coverage failures in which a Rejection's reason, description or disposition reaches a member lacking `REJECTIONS:WATCH` through any surface. Source: automated coverage-check results, integration-check results, and support reports.

## 8. Open questions

- [ ] The six amendments in §1's second boundary contradict approved specifications that a reviewer reading `ordering` or `delivery-addresses` alone would find intact. Are they raised as their own change request, and does it wait for the pending `ordering-amendments` request to be reconciled first, given that request is drafted but its canonical reconciliation into `ordering` has not run and three of the six touch paragraphs it is itself rewriting? _Default now:_ raise a separate change request declaring the dependency, and reconcile `ordering-amendments` first so one paragraph never carries two unreconciled overlays. — owner: PM, due: before `design`
- [ ] The shipped line-ending dialog opens with the quantity pre-filled to the quantity ordered, so the fastest action at a dock is to accept everything, and adding a Condition Split does not change that default. What makes refusing goods cost a member no more than accepting them, and what makes a warehouse that never refuses anything visible as a problem rather than as a clean quarter? _Default now:_ the "endings that refuse nothing" metric in §7 is the detection, and the interaction answer is `design-ui`'s to make. — owner: Tech Lead, due: before `design-ui`
- [ ] Because the Accepted Quantity is derived, refusing goods after assignments have been composed invalidates those assignments, and the cheapest way for a member to recover is to remove the refusal rather than to redistribute the assignment. Does the member state the condition before the assignment, or does the surface absorb the conflict some other way? _Default now:_ condition is stated before assignment, so the assignable quantity is known when the member assigns it. — owner: Tech Lead, due: before `design-ui`
- [ ] Damage found after a line's ending was recorded has no home in this release. The writable surfaces a member is left with are an On-hand adjustment carrying free text, or a new Purchase Draft, or nothing — so the likely outcome is a shadow record of damage in a free-text field that no reading of this feature will ever find. Is that acceptable for one release? _Default now:_ yes, and it is revisited when the Stock Movement ledger lands, which is where a post-arrival change of condition belongs. — owner: PM, due: before `design`
- [ ] The three new Permission keys are not held by any custom Role that exists before this feature ships, so on the morning it deploys a member on such a Role either cannot record a refusal or can record only an ending that refuses nothing — which is indistinguishable from the feature working. How are existing Roles brought to the new capabilities, and is that a migration or an administrator's task in every Workspace? _Default now:_ the protected Warehouse Manager Role receives all three by migration, exactly as `ordering`'s keys were granted; every custom Role is an administrator's decision. — owner: Security Lead, due: before `design`
- [ ] Recording an ending that refuses goods requires two Permissions evaluated together, which the authorization stage has not had to do before. Is the stage extended to evaluate more than one required Permission, or is the pair expressed some other way? _Default now:_ extend the stage; `delivery-addresses` already put this on the table and this feature is the first to require it. — owner: Tech Lead, due: before `design`
- [ ] Deferring the Rejection Register and the Rejection Marker means a refusal's reason never reaches the member re-ordering the shortfall, and the restored demand is indistinguishable from demand never ordered. How long is that acceptable, and is the follow-up committed before this release ships rather than after? _Default now:_ the follow-up is registered on the roadmap as the immediate next feature and is not bundled into this one. — owner: PM, due: before `ship`
- [ ] Whether a minimal Supplier record deserves its own feature, without which "which supplier keeps doing this" stays unanswerable and every studied competitor's organizing entity is absent. _Default now:_ no; a Rejection names what was refused and why, never who sent it, and the question is a portfolio decision rather than this feature's. — owner: PM, due: before the deferred follow-up
- [ ] Customer-reported is the only Rejection Source available on a Direct to Customer line, but an ending is written once and `delivery-addresses` records a Direct Delivery when the goods reached the customer rather than when they were dispatched — so a customer who telephones the next day with damage has nowhere for it to be recorded, which on a direct line is the ordinary case rather than the edge case that §3 excludes. A domain authority reports no industry-standard reporting window exists; the literature treats it as a contractually negotiated term. What makes a member hold the ending until the customer's account is settled, and how is a line whose ending was recorded too early made visible rather than silently final? _Default now:_ the member alone judges when to record it, the surface states before submission that the ending is final and asks whether the customer has reported on the goods, and no reporting window and no time-driven state is introduced. — owner: PM, due: before `design-ui`
- [ ] The Allocation bound narrows from the Received Quantity to the Accepted Quantity for every line, including lines whose endings were recorded under `ordering` and `delivery-addresses` before this release. §1 argues that almost no operational history sits behind them but does not say none, so a reader cannot tell whether such endings are migrated to an Accepted Quantity equal to what they received or left carrying no Condition Split at all — which decides whether AC-21's read has an absent case §5 never describes and whether the condition-split integrity check needs a branch for a line that has no Accepted Quantity. _Default now:_ leave existing endings untouched with neither a Condition Split nor a Pre-receipt Conformance, treat their Accepted Quantity as equal to their Received Quantity for the purposes of the Allocation bound, and exclude them from every §7 reading, which counts only endings recorded after this release. — owner: Tech Lead, due: before `data-model`
- [ ] The Rejection description and the Pre-receipt Conformance note are bounded at one thousand characters, while the three member-authored prose fields already shipped — a Purchase Draft's closure reason, a Customer Order's cancellation reason and an On-hand adjustment's reason — are bounded by nothing at all, in either their contracts or their columns. This product's free-text fields therefore disagree from the day this release lands. Is one house limit applied across all of them, and does that need a check of existing rows before the bound goes on? _Default now:_ bound only the two fields this feature introduces; a house limit across the shipped fields is its own change request, because it edits `ordering`'s contracts and needs a data check first. — owner: Tech Lead, due: before `ship`
- [ ] Deferred by the 2026-09-09 independent review (`_review/review-2026-09-09.md`). The amend dialog drops four elements of approved frame `Ue4xn` — the immutable-context read-out, the "never back to Undecided" helper that is the only place AC-18a's rule is stated to the member, the prose-bound helper and the attribution note — and reverses the approved field order; the closed line's condition head drops the Source chip and the recording attribution, and the line header drops the "Accepted N of M presented" chip. `design-handoff.md` §Approved deviations requires the designer's sign-off on any visible deviation, which a code-review gate cannot grant. _Default now:_ take each drift to the design approver and either restore it or record it as an Approved deviation before the feature ships. — owner: Tech Lead + design approver, due: before `ship`
- [ ] Deferred by the 2026-09-09 independent review. The server admits an ending on an instructed line that states no Pre-receipt Conformance verdict at all — `refusalsStateVerdict` fires only when the submission carries a refusal — so a direct POST writes `pre_receipt_conformance = NULL`, which the read then serves as an absent condition, indistinguishable from a pre-release ending. AC-17a as worded forbids only `not_applicable`, and the migration leaves the converse deliberately unconstrained so pre-release rows stay legal, so this is not an acceptance-criterion violation; but it leaves §7's first adoption metric resting entirely on the web surface. _Default now:_ record the client-only enforcement here rather than tightening the API, so the next reader does not assume the API holds it. — owner: Tech Lead, due: before `ship`
- [ ] Deferred by the 2026-09-09 independent review. `test-plan.md` names ten seed factories "kept in the server test factories directory"; none were written, and each integration suite hand-rolls its own. The plan's stated safety property — that a refusal defaults to its line's Warehouse and Delivery Mode, so a cross-Warehouse or wrong-source case must be written deliberately rather than arrived at (AC-25, AC-26) — is therefore held by no shared code and depends on each suite's private helper agreeing. _Default now:_ lift the rejection factories into `apps/server/src/test/factories/` when the deferred Rejection Register follow-up next touches these suites. — owner: Tech Lead, due: before the deferred Rejection Register follow-up
- [ ] Deferred by the 2026-09-09 independent review. The by-line read builds and redacts the full four-shape condition projection, but `PurchaseDraftLineDirectory` renders none of it, so a redaction-bearing projection ships with no production consumer and is exercised only by tests — while `tasks.json` T17 justifies its component placement on that consumer existing. AC-21 and AC-22 are satisfied on the detail pane, which is what §5 names. _Default now:_ either render the condition account in the by-line view or record in `tasks.json`/`sad.md` §7 that the by-line read carries it ahead of a consumer. — owner: Tech Lead, due: before the deferred Rejection Register follow-up
- [ ] Deferred by the 2026-09-09 independent review. AC-26's read half has no contract-tier test — only the amend half does — and the closed-draft read denies a foreign draft with `500 system.internal_error` rather than the 404 every sibling route returns, because the handler asserts with a string message rather than a typed refusal. AC-26 still holds literally, since the foreign and the absent case are byte-identical and nothing is disclosed, and the behaviour is pre-existing from `ordering` rather than introduced here; but this feature makes that read the surface AC-21, AC-22 and AC-26 all land on. _Default now:_ add the `GET` pair to the existing identical-response sweep and refuse with `purchaseDraftTargetUnavailableError()` when the follow-up next touches this controller. — owner: Tech Lead, due: before the deferred Rejection Register follow-up
