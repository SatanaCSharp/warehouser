---
id: T20
title: 'Draw the Demand Pressure and Purchasing Spread Panels'
layer: 'ui'
deps: [T19]
acs: ['AC-14', 'AC-18']
files_hint:
  - 'apps/web/src/modules/workspace-dashboard/components/DemandPressurePanel.tsx'
  - 'apps/web/src/modules/workspace-dashboard/components/PurchasingSpreadPanel.tsx'
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T20 — Draw the Demand Pressure and Purchasing Spread Panels

> **Blocked by:** [T19](./workspace-dashboard-module-ui.md)
> **Satisfies:** AC-14, AC-18 — see [spec.md §5](../spec.md)
> **Owner:** Frontend Lead · **Estimate:** M · **Layer:** `ui`

## Why

The two Workspace Panels that set the Warehouses beside one another on the simplest terms: how much
is promised and how soon, and where purchasing work stands
([design-handoff.md § Panel specifications](../design-handoff.md), frames `DCucv` and `G3tB1`).

## What

`modules/workspace-dashboard/components/DemandPressurePanel.tsx` and `PurchasingSpreadPanel.tsx`.

- **Demand Pressure** — one horizontal bar per active Warehouse, three ordinal Urgency Band
  segments, on a **scale of quantities** rather than of shares. Columns: Warehouse 116 · track 248 ·
  Outstanding 76. Footnote states the archived-Warehouse count.
- **Purchasing Spread** — a Warehouse × state heat grid over **four** states, sequential one-hue
  bins `1–19 / 20–49 / 50–99 / 100 +` plus a `$chart/track` zero cell, **the count printed in every
  cell**, a scale legend below. The column head reads "Ready"; the Panel meta expands it to "Ready
  for ordering".

## Definition of Done

- [ ] Demand Pressure's scale is absolute quantities, so a small Warehouse in trouble is not
      flattened beside a large healthy one (AC-14)
- [ ] Every Warehouse the surface shows is present; there is **no** Remainder Row on either Panel
- [ ] Purchasing Spread renders all four states including Closed and Discarded (AC-18)
- [ ] The count is printed in **every** cell, so the fill is a scanning aid and never the only
      encoding
- [ ] Both are tables with an `h2` and an accessible summary
- [ ] The archived-Warehouse count renders from its projection field on both Panels
- [ ] A Workspace with **one** Warehouse left renders unchanged and says nothing about it
- [ ] Rows flex 20–26 px, then the Panel scrolls internally while the surface does not
- [ ] Both mobile treatments render at 390 px
- [ ] Removing colour entirely loses no figure
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

Parallel with [T21](./order-flow-and-receipt-reliability-panels-ui.md) — separate component files.

Nothing here judges a Warehouse: no threshold, no target, no red/amber/green. The figures report and
the reader decides ([spec.md §3](../spec.md)).

No tooltip; no motion.
