# Approved-frame observations (transcribed from the PNGs)

These are notes to orient you, **not a substitute for reading the frames yourself** — read your
own PNGs under `docs/features/ordering/previews/` with the Read tool. Where these notes and the
frame disagree, the frame wins. Copy shown here is the design's own wording; use it (through the
locale files) rather than inventing your own.

## Sidebar (all frames)

Order: Dashboard · Demand · Purchase drafts · Items · Access. `Purchase drafts` carries a count
badge in its trailing slot (the drift count), drawn as a small amber/accent numeral.

## Demand desktop — `G6jhw.png`

- Page title `Demand`, then the lede: "One row per item: the total your customers are still
  waiting for, the earliest date any of them needs it, and what the transit zone already holds.
  Derived from customer orders on every read — never a stored list."
- A search field, placeholder **"Search items or SKUs"**, sitting left of a primary
  **"+ Record demand"** button.
- Table columns: `ITEM` · `OUTSTANDING` · `EARLIEST NEEDED BY` · `ON HAND` · `COVERED BY` · row menu.
- Item cell: description on line 1; on line 2 `WH-100420 · counted in pieces` followed by the
  disclosure control, which reads **"5 customer orders"** collapsed and
  **"hide the 2 customer orders"** expanded.
- Outstanding cell: the grouped number `1 240` above the unit caption `pieces outstanding`.
- Earliest needed by: the date `2 Sep 2026`, and **below it an urgency chip** — neutral
  `in 8 days` / `in 17 days`, and **danger** `overdue by 4 days` when the date has passed.
- On hand: the number above the caption `on hand`.
- Covered by: one chip per covering draft, each reading **`PD-0142 · 800`** (draft reference ·
  quantity). When nothing covers it: the plain text **"No draft claims this demand"**.
- Child (customer-order) rows: `↳ Nordwind Logistik GmbH` · `800 of 800 outstanding` ·
  `by 2 Sep 2026` · a status chip `Unfulfilled` · row menu.
- **Table footer row**: left `4 items · 12 unfulfilled customer orders`, right
  `Fulfilled and cancelled customer orders are not counted here.`
- Below the table, an info alert: heading **"Covered by is what someone already ordered — not a
  reservation"**, body "A purchase draft linked to this demand is shown so you can see what a
  colleague has already ordered and for how much. It claims nothing: you may still draft the same
  demand again, and only goods that actually arrive reduce what a customer is waiting for."

## Items desktop — `XIvAZ.png`

- Title `Items`; lede "The goods this warehouse deals in. A SKU identifies one item inside this
  warehouse and nowhere else — the same SKU in another warehouse names an unrelated item."
- Search field, placeholder **"Search by SKU or description"**, plus a primary **"+ Add item"**.
- Columns: `SKU` · `DESCRIPTION` · `COUNTED IN` · `ON HAND` · `STATUS` · row menu.
- Description cell carries a second line naming what references the item:
  `Named by 3 customer orders and 1 draft line` / `Named by 5 customer orders` /
  `Nothing names it yet — its SKU is still correctable` /
  `Named by 2 customer orders · no longer offered when demand or a draft is assembled` (inactive).
- **On hand cell carries a reason line** under the number: `24 Aug · cycle count · by you`,
  `23 Aug · returned from a cancelled order · by Iryna Kovalenko`, or `nothing recorded yet`.
  `design-handoff.md` calls this "part of the contract, not decoration" twice.
- Status chip: `Active` (success) / `Inactive` (neutral); the inactive row is dimmed.
- **Table footer**: left `5 items · 1 inactive`, right `An inactive item keeps its SKU and keeps
counting on every record that already names it.`
- Below, an info note: **"A SKU is correctable only until something names its item"**, body "Once
  a customer order or a purchase draft line names an item, its SKU is fixed for the life of that
  item — the description and the unit it is counted in stay correctable. Deactivating an item
  never releases its SKU for reuse."

## Purchase Drafts, unfrozen — `yGhkK.png`

- Title `Purchase drafts`; lede "What you decided to order from your supplier, and who each line
  is for. Nothing leaves Warehouser — you contact the supplier yourself, and the draft is the
  record of what you told them."
- Tabs carry counts: `Being worked on · 3` · `Ready for ordering · 2` · `Closed · 4`.
  A primary **"+ New draft"** sits below them, right-aligned.
- List cards: **`PD-0143`** with a state chip, second line `3 lines · created by you · 25 Aug 2026`.
  Footnote under the list: "Discarded drafts leave this list. Closed drafts move to the Closed tab
  and stop covering demand."
- Detail header: **`PD-0143`**, state chip, overflow menu, and the attribution line
  `Created by you · 25 Aug 2026 · every change is recorded as you make it`.
- Info banner: **"Move to Ready for ordering once you have told the supplier"** + body.
- **`Expected arrival date` field** — an editable date input, placeholder `Not stated yet`, with
  the helper text "Your own estimate, not a supplier commitment. Leave it blank until you have
  spoken to them."
- `LINES` section header, right-aligned caption "Each line carries its own packaging and note".
- Each line: `LINE 1` + overflow menu; `Item` (combobox showing `WH-100420 · Pallet wrap, 500mm`),
  `Quantity` (with unit caption `pieces` below), `Packaging type` (with caption "How the goods must
  arrive"), and `Value-adding note` (textarea, helper "Processing the goods need before or on
  arrival. Not a place for prices, supplier contacts or payment terms.").
- **`SERVES` section per line.** Each link row: customer name, then
  `Unfulfilled · 800 outstanding · needed by 2 Sep 2026`, a labelled `Intended for them` number
  input, and an `×` remove control.
- **A `+ Link a customer order` button** under the link rows, with the links note beside it:
  `1 200 ordered · 1 200 intended for customers. These never have to agree, and neither claims the
demand.` When no link exists, the section instead shows the note "No customer order is linked.
  This line is still ordered — what arrives on it simply will not be attributed to anyone." and the
  links note reads `120 ordered · nothing intended for a named customer.`
- `+ Add a line` below the lines.
- Detail footer: danger `Discard draft` on the left; on the right the hint
  `At least one line is needed` then the primary `Move to Ready for ordering`.

## Purchase Drafts, frozen + drift — `F0SpRx.png`

- Lede changes for the Ready tab: "A draft that has been made ready is the record of what you told
  the supplier. It is not a live projection of demand — when the demand behind it moves, you are
  told, and the draft is left alone."
- Card: `PD-0142` · `2 lines · frozen 22 Aug 2026 · expected 5 Sep` · a warning line
  **"⚠ Demand moved since freezing"**. List footnote: "Only drafts that have been made ready appear
  here. One of them carries a drift signal."
- Detail header attribution: `Made ready by Iryna Kovalenko · 22 Aug 2026, 14:20 · expected arrival
5 Sep 2026`.
- **Drift alert** (warning): heading "Demand moved since this draft was frozen"; subline "Compared
  against the demand captured at 22 Aug, 14:20."; then **bullets that state the comparison**:
  - "Baltic Freight OÜ — cancelled on 24 Aug. Line 1 was linked to it for 400."
  - "Nordwind Logistik GmbH — quantity raised from 800 to 1 000 on 25 Aug, still needed by 2 Sep."
    and the closing paragraph "Nothing on the draft has changed and nothing will. What to do about
    this is your decision — a value amended and then put back as it was stops being reported."
- Frozen note (lock icon): "Frozen at 22 Aug, 14:20. Lines, quantities, links, pre-receipt
  requirements and the expected arrival date can no longer be changed — by anyone, the warehouse
  manager included. Only what arrives and who it is for is still written here."
- Every line field renders **disabled, not hidden**.
- Section label becomes **`SERVED, AS FROZEN`**; the quantity label becomes `Was intended for`;
  each drifted link carries a **specific** chip — `Raised to 1 000 on 25 Aug`, `Cancelled on 24 Aug`
  — never a generic "Drift detected".
- Link row text uses the frozen tense: `Unfulfilled · was 800 outstanding, needed by 2 Sep 2026`,
  `Was Unfulfilled · 440 outstanding, needed by 9 Sep 2026`.
- Links note: `1 200 ordered · what was intended for each customer is shown as it stood when the
draft was made ready.`
- Footer: `Close with a reason` · hint `Confirming an arrival closes this draft once and for all` ·
  primary `Confirm arrival`.

## Numbers and dates everywhere

Quantities are group-separated (`1 200`, `4 500`). Dates are `25 Aug 2026`; timestamps are
`22 Aug 2026, 14:20`; short forms in dense contexts are `5 Sep`, `29 Aug`. No raw ISO string
appears anywhere in any frame.

## Dialogs board — `s5EPi.png` (desktop) / `blZtz.png` (mobile)

Board caption: "Every dialog is a HeroUI modal at its true rendered width (440px, and 720px for the
arrival confirmation). Cancel always precedes the primary in DOM and keyboard order; a destructive
primary is solid danger."

Three things the board makes non-negotiable, and all three are currently missing:

1. **Every dialog title names its subject.** `Amend Nordwind Logistik GmbH's order` ·
   `Cancel Baltic Freight OÜ's order?` · `Move PD-0143 to Ready for ordering?` ·
   `Close PD-0142 with a reason?` · `Discard PD-0144?` ·
   `Deactivate WH-100199 · Cable, 3×2.5mm²?` · `Confirm what arrived on PD-0142`.
2. **Every field carries helper text** under it, e.g. "A whole number greater than zero, counted in
   pieces." · "A date that has not already passed." · "Required. Recorded with your name and the
   time, so a figure that drifts can be explained." · "The end customer waiting for the goods. A
   name is all this release records."
3. **A refused field shows its own red message under that field**, and the message names the value
   and the rule — this is what BRIEF §A's field-error plumbing exists to deliver:
   - SKU conflict: "WH-100420 already names "Pallet wrap, 500mm" in this warehouse. A SKU identifies
     at most one item here."
   - Amend below the assigned floor: "This order cannot go below 160. That much has already been
     assigned to this customer from an arrival, and those goods are in the transit zone under their
     name."

Per-dialog notes worth having:

- **Record demand** (AC-01/02/02a): Customer · Item (combobox, helper "Only active items of this
  warehouse are offered.") · Quantity · Needed by. Primary `Record demand`.
- **Adjust on-hand** (AC-08/09/09a): Item (read-only) · Counted quantity · **Reason** (required,
  helper as above) + the note "Nothing else in Warehouser changes this figure — confirming an
  arrival does not touch it." Primary `Save the count`.
- **Add an item** (AC-06/07): SKU · Description · Counted in, with "A new item starts active with
  nothing on hand." Primary `Add item`. The **correct-item** dialog is this dialog's sibling and
  must carry the SKU field too — AC-06c's legal half ("an Item nothing yet names may still have
  its SKU corrected") is unreachable without it.
- **Amend a customer order** (AC-19/19b): Quantity · Needed by, plus a **warning alert** when
  frozen drafts link to it: heading "2 frozen drafts link to this order", body "PD-0142 and PD-0141
  will report a drift signal. Neither draft changes — they record what the supplier was told."
- **Cancel a customer order** (AC-19a): Reason, plus the note "PD-0142, which links to this order
  for 400, keeps every value it was frozen with and reports a drift signal instead." Primary is
  solid danger `Cancel the order`; cancel control reads `Keep the order`.
- **Move to Ready for ordering** (AC-14/14a/15): four explanatory paragraphs — "Frozen now — …",
  "Captured now — …", "Still possible — …", "No longer possible — …" — then "Nothing is
  transmitted. Placing the order with the supplier is still yours to do." Primary
  `Freeze and mark ready`.
- **Close a frozen draft** (AC-21/21a): Reason + "The frozen contents stay readable. Every linked
  customer keeps waiting for exactly what they were, and the draft stops covering their demand."
  Primary `Close draft`.
- **Discard a draft** (AC-24/24a): explanation + an info panel "A draft that has been made ready is
  closed, not discarded". Cancel reads `Keep it`; primary is danger `Discard draft`.
- **Deactivate an item** (AC-06d): three explanatory paragraphs including "The 2 customer orders
  that already name it stay readable and keep counting exactly as before." Primary `Deactivate`.
- **Confirm an arrival** (AC-17/17a/17b/18a), 720px: per line `LINE 1  WH-100420 · Pallet wrap,
500mm` with `1 200 ordered` right-aligned; `Quantity that arrived` (helper "Whatever physically
  arrived"); section label `ASSIGN IT ACROSS THE CUSTOMERS THIS LINE WAS ORDERED FOR`; per-customer
  `Assign to them` inputs — a cancelled link is **disabled with a `Cancelled on 24 Aug` chip** and
  the caption "Was linked for 400 · nothing can be assigned to it now"; and a live running total
  `1 180 arrived · 1 000 assigned · 180 left unassigned in the transit zone.` / `400 arrived · 320
assigned · 80 left unassigned. Sudhafen Handel KG becomes fulfilled and leaves the consolidated
demand.` Primary `Confirm arrival and close the draft`.
- **Assignment refused** (AC-18): a separate dialog "That assignment cannot be recorded", body
  "Nothing of this confirmation has been saved and the draft is untouched.", then **one bullet per
  broken bound naming it**: "Line 1 — you assigned 1 300 across its customers, but recorded 1 180 as
  arrived." · "Nordwind Logistik GmbH — you assigned 1 100, but they are waiting for 1 000." ·
  "Baltic Freight OÜ — cancelled on 24 Aug, so nothing can be assigned to it." Closing line "Each
  bound is checked again at the moment the confirmation is recorded, not when you started filling
  it in." Single control `Back to the form`.
