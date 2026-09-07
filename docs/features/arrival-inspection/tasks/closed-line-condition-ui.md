---
id: T17
title: "Render the closed line's condition account in all four shapes, with the withheld shape leaving no trace"
layer: 'ui'
deps: [T13]
acs: ['AC-21', 'AC-22', 'AC-23', 'AC-23a']
files_hint:
  - 'apps/web/src/modules/purchase-draft/components/'
  - 'apps/web/src/modules/purchase-draft/components/purchase-draft-line-directory/'
  - 'apps/web/public/locales/'
  - 'apps/web/src/test/locale-baseline.json'
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T17 — Render the closed line's condition account in all four shapes

## Why

Until the deferred Rejection Register lands, this surface is the **only** place a refusal's reason
reaches anyone ([spec.md §1](../spec.md), sixth boundary). And it is where AC-22's withholding must
leave no trace: a placeholder is itself a disclosure that can be probed. Derives from
[design-handoff.md § Component mapping](../design-handoff.md) and § States and interactions, approved
frames `Arrival Inspection / Closed Draft / Desktop / v1` (`MaRvu`) and mobile (`aqFhl`).

## What

Add three components to `modules/purchase-draft/components/`, **unnested** — each has more than one
consumer, the detail pane and the by-line view
([placing web components](../../../system/guides/placing-web-components.md)):

- the **closed line's condition block** (`Inspection/Closed Line`, `FYfEa`), derived from the shipped
  `Delivery/Draft Line`, adding a `CONDITION ON ARRIVAL` block between the value-adding note and the
  links. **One component serves both Delivery Modes**; the direct-line rendering is an instance
  override, not a second component, and `PurchaseDraftLineList`'s existing row is untouched;
- the **read-only refusal row** (`Inspection/Refusal Read Row`, `n4Ue8` / `Jm3OQ`) — quantity, Reason,
  description, Source chip, Disposition chip, kebab. Mobile stacks the chips under the description;
- the **condition summary** (`Inspection/Condition Summary`, `bllT3` / `M9G5z`) — the same four figures
  as the ending dialog's, reused here as static text rather than a live region.

## Definition of Done

- [ ] The full shape renders ordered, presented, accepted and rejected, with each refused quantity
      beside its Reason, description, Source chip and Disposition chip (AC-21).
- [ ] **One test per shape — four, not two:** cause and identity, cause only, identity only, neither.
- [ ] In the cause-withheld shapes the surface renders **one total refused figure** and no placeholder,
      no "hidden" chip, no count, no greyed row and no division into separate refusals; a test asserts
      the rendered output is indistinguishable from a line carrying one unexplained refusal (AC-22).
- [ ] That a refusal happened stays visible in the withheld shape, because presented and accepted
      differ — the protection is over the cause, never over the fact.
- [ ] The Packaging Type rendered is the one frozen on the line, not a current catalogue reading
      (AC-23); a Reason renders as recorded after a catalogue extension (AC-23a).
- [ ] A line whose ending predates this release renders its **absent case** — no condition block, no
      conformance — without an error or an empty placeholder ([sad.md §7](../sad.md)).
- [ ] Delivery mode, Source, Disposition and the conformance verdict are total
      `Record<State, ReactElement>` render lookups, never `if`/`else if` chains or ternary ladders.
- [ ] A member's description is **wrapped, never truncated** into ambiguity, and renders as text — never
      as markup and never as a link.
- [ ] The kebab carries an accessible name identifying its refusal.
- [ ] `en`/`uk` keys are added with full parity and the locale baseline regenerated in its existing key
      order.
- [ ] Frames `MaRvu` and `aqFhl` render as approved at 1440 and 390; the closed draft collapses list
      and detail into two screens at mobile with a `chevron-left` back affordance.
- [ ] `pnpm --filter @warehouser/web test`, `lint`, `pnpm exec tsc --noEmit` and
      `pnpm --filter @warehouser/web build` are green.

## Notes

**Hard rule** ([spec.md §6.1](../spec.md) abuse cases): the withholding must be trace-free. This is the
UI half of the rule T12 enforces at the projection — if the server sends the withheld shape and the
client renders "0 refusals" or a disabled row, the guarantee is gone.

**Hard rule** ([design-handoff.md](../design-handoff.md)): the shell is reused unchanged. Header,
sidebar, context bar, tabs and draft cards get nothing from this feature at either viewport.

Shares the locale lane with T15, T16, T18 and T19; independent of the ending dialog otherwise.
