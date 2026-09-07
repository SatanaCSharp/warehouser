---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Backend Lead', 'Frontend Lead']
updated_at: '2026-09-02'
feature_size: 'L'
ticket: ''
---

# 0002 — Record a Purchase Draft's ending per line, not once for the whole draft

## Context

`ordering` shipped one ending per Purchase Draft.
`apps/server/src/purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command.ts` locks the
draft, asserts it is in `ready_for_ordering`, writes every line's received quantity, delegates the demand
effect to `customer-orders`' exported `DemandAllocationService`, and moves the draft to `closed` — all in one
transaction, once. Its `CONTEXT.md` invariant is that "Arrival Confirmation happens at most once for a draft",
and `spec.md` §6 "Arrival atomicity" is stated for the whole confirmation.

This feature gives each line its own destination and its own route. A Direct to Customer line's goods go from
the supplier straight to the customer; a Via Warehouse line's goods arrive at the dock. `spec.md` AC-19 is
explicit that the two "reach the dock and the customer on different days", that each is recorded against the
lines that travelled that way, and that the draft "moves to Closed once every one of them has" an ending.
AC-20 requires a dock arrival against a direct line, and a direct delivery against a via-warehouse line, to be
refused. AC-20a requires a second ending on one line to be refused, naming when and by whom.

One whole-draft act cannot express any of that: it would force a member to wait for the slowest line before
recording the fastest, or to record an arrival for goods that never arrived.

The decision changes the closure model of **every** Purchase Draft, not only those holding a direct line. It
reaches the `purchase_draft_lines` and `purchase_drafts` relations, the `purchase-drafts` contract, one
shipped REST route, the `ordering` acceptance criteria, and the shipped web arrival dialog. Reversing it after
drafts have closed line-by-line means reconstructing a whole-draft attribution that was never recorded. It
therefore passes the feature ADR blast-radius gate, and it is also `spec.md` §8's sixth open question, due
before this stage.

## Decision drivers

- AC-19 requires two endings on one draft, days apart, each reducing what its own customers are waiting for.
- AC-20 must refuse the wrong kind of ending for a line's Delivery Mode, and the refusal must name which of
  the two ways the goods travelled — so the _kind_ has to be a first-class property of the act, not a
  submitted value.
- AC-20a must refuse a second ending on one line and name when and by whom, which requires per-line
  attribution.
- `spec.md` §6 "Ending atomicity" scopes the guarantee to one line's ending: its quantity, its Allocations and
  the resulting Outstanding Quantities together or not at all.
- The demand effect must stay owned by `customer-orders`
  ([ordering ADR 0002](../../ordering/adr/0002-arrival-confirmation-ownership.md)); this decision is about
  granularity, not about moving that boundary.
- Closing a draft with a reason must remain possible at any time, whatever lines remain unrecorded
  (`spec.md` §8, sixth question, stated default).
- Two members recording the last two endings of one draft must not both close it.
- `ordering` is an approved specification whose invariant this contradicts; the contradiction has to be named
  rather than absorbed.

## Considered options

1. **One ending per line, two sub-resources, closure derived from the lines.** Each line records its own
   ending through its own route — `…/lines/{lineId}/arrival` and `…/lines/{lineId}/direct-delivery` — carrying
   the quantity, the Allocations, the acting member and the time. Each command owns one `@Transactional()`
   boundary and delegates the demand effect to `DemandAllocationService`. The draft moves to Closed in the
   same transaction as the ending of its last unrecorded line, as a conditional update predicated on no line
   remaining.
2. **Keep the whole-draft Arrival Confirmation and add a separate whole-draft Direct Delivery act.** The draft
   closes when both have run, or when the only applicable one has.
3. **One ending route per line with the kind as a payload field.** One sub-resource, a `kind` discriminator in
   the body.
4. **Keep the whole-draft act and let it record both kinds at once**, refusing per line inside the payload.
5. **Make closure an explicit separate act** the member performs after recording every line's ending.

## Decision outcome

Chosen: **option 1 — one ending per line, expressed as two sub-resources, with closure derived from the
lines.**

Options 2 and 4 are rejected on AC-19 directly: both still require the member to record every line of one kind
in a single act, so a draft holding two via-warehouse lines whose goods arrive a week apart cannot be recorded
truthfully. Option 4 additionally puts AC-20's refusal inside a payload the member composed, which is the
shape `ordering` §7 already rejected for its transitions.

Option 3 is rejected for the same reason at smaller scale: the kind of ending is what AC-20 refuses on, and a
route is a stronger statement of it than a field. Two routes also let a later release split
`PURCHASE_DRAFTS:RECEIVE` into two Permissions — `spec.md` §8's fifth open question, whose default this design
takes — as a decorator change on one handler rather than a re-cut of an endpoint.

Option 5 is rejected because it adds a member-visible step that answers no question: once every line has an
ending there is nothing left to decide, and an unclosed draft with every line recorded would be a state
carrying no information. Closing **with a reason** stays a distinct act precisely because it _does_ carry
information — that the goods are not coming.

Option 1's atomicity is per line and its closure is a conditional update: the last ending and the move to
Closed are written in one transaction predicated on no line remaining unrecorded, so two concurrent last
endings cannot both close the draft, and the second is a typed concurrency refusal rather than a silent
no-op — the shape `ordering` already uses for its freeze and closure transitions.

## Consequences

### Positive

- AC-19, AC-20 and AC-20a are all expressible, and each refusal is a routing or state fact rather than a
  payload check.
- Atomicity is scoped to the unit that actually commits: one line's quantity, its Allocations and its
  Outstanding Quantities.
- Per-line attribution — who recorded this line's ending and when — exists, which AC-20a's message needs and
  the whole-draft act never held.
- The `spec.md` §7 KPI "≤2% of frozen Direct to Customer lines Closed while still carrying Address Drift"
  becomes measurable, because a line now has its own ending time to compare drift against.
- The ownership split `ordering` decided is untouched: `purchase-drafts` owns the act and the state guard,
  `customer-orders` owns the demand effect through its exported service.

### Negative

- **`ordering`'s invariant "Arrival Confirmation happens at most once for a draft" is contradicted**, and the
  change reaches every Purchase Draft, not only those with a direct line. This is one of the four amendments
  `spec.md` §8 requires to be carried back to `ordering` as a change request, which has not yet happened
  (`sad.md` §11).
- The shipped `POST /purchase-drafts/{id}/arrival` route is withdrawn, breaking the published
  `purchase-drafts` contract and the shipped web arrival dialog. Server and web must change together, and the
  route-table baseline is regenerated deliberately.
- `purchase_drafts`' whole-draft arrival attribution columns are superseded. `data-model` decides whether they
  are dropped or retained as the record of drafts closed before this release; either way no new write targets
  them, and drafts closed under the old model carry no per-line attribution.
- A second write path now takes locks over the same Customer Order rows as the amendment path. The fixed lock
  order — draft, lines, then Customer Orders ascending — is not optional, and PGlite's single backend cannot
  prove the race (`sad.md` §8, §11).
- A draft can now sit in Ready for Ordering indefinitely with one line unrecorded. Closing with a reason is the
  remedy, and it remains available at any time.

### Neutral

- `PURCHASE_DRAFTS:RECEIVE` authorizes both endings, per `spec.md` §8's fifth default. Splitting it later
  touches one decorator on one handler.
- On-hand Quantity is unaffected by either ending, exactly as it was unaffected by the whole-draft
  confirmation (AC-21).

## Links

- [`../sad.md`](../sad.md) §1 goal 6, §4, §5, §6.10, §7, §8, §10, §11
- [`../spec.md`](../spec.md) AC-19, AC-20, AC-20a, AC-21, §6 "Ending atomicity", §8 sixth and eighth open questions
- [`../CONTEXT.md`](../CONTEXT.md) §Invariants
- [Arrival Confirmation ownership](../../ordering/adr/0002-arrival-confirmation-ownership.md)
- [Server architecture](../../../system/server-architecture.md) §"Use cases", §Persistence
