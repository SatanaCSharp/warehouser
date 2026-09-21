---
id: T21
title: 'Draw the Order Flow and Receipt Reliability Panels with their disclosure and exclusion footnotes'
layer: 'ui'
deps: [T19]
acs: ['AC-16', 'AC-17a', 'AC-19', 'AC-20', 'AC-20a']
files_hint:
  - 'apps/web/src/modules/workspace-dashboard/components/OrderFlowPanel.tsx'
  - 'apps/web/src/modules/workspace-dashboard/components/ReceiptReliabilityPanel.tsx'
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T21 — Draw the Order Flow and Receipt Reliability Panels with their disclosure and exclusion footnotes

> **Blocked by:** [T19](./workspace-dashboard-module-ui.md)
> **Satisfies:** AC-16, AC-17a, AC-19, AC-20, AC-20a — see [spec.md §5](../spec.md)
> **Owner:** Frontend Lead · **Estimate:** L · **Layer:** `ui`

## Why

The two Workspace Panels carrying the surface's two hardest disclosures: Order Flow's weeks move
without a record being made (AC-17a), and Receipt Reliability must say which Warehouses it could not
rate rather than placing them at nothing or at everything (AC-20a)
([design-handoff.md § Panel specifications](../design-handoff.md), frames `z5olfa` and `ScGrF`).

## What

`modules/workspace-dashboard/components/OrderFlowPanel.tsx` and `ReceiptReliabilityPanel.tsx`.

- **Order Flow** — twelve stacked columns, pooled across the Workspace and **naming no Warehouse**.
  Each week's whole is its Recorded Quantity, divided bottom-up into **Assigned to arrived goods →
  Still awaited → Cancelled**, so the cancelled part reads as withdrawn from the week. Footnote
  carries the retroactive-figure disclosure.
- **Receipt Reliability** — bubble scatter, x = On-time Arrival Rate, y = Conformance Rate, area ∝
  quantity received at `r = 16 × √(received ÷ max received)` with a 2 px `$surface/surface` ring.
  Plot 417 × 140, gridlines at 0 / 50 / 100 %. **Every mark direct-labelled with its Warehouse
  name**, placed centred below and moved aside on collision.

## Definition of Done

- [ ] Order Flow names no Warehouse anywhere on the Panel (AC-16)
- [ ] The cancelled part reads as **withdrawn from** the week, never as demand the Workspace still
      owes
- [ ] The footnote discloses that weeks report what their Customer Orders **currently** ask for
      (AC-17a)
- [ ] A week whose whole is entirely cancelled renders correctly
- [ ] Every Receipt Reliability mark is direct-labelled, so no legend has to be consulted (AC-19)
- [ ] Labels move aside rather than overlapping when two marks collide
- [ ] A Warehouse with **no rate** is **not plotted** and is named in the footnote beside every
      exclusion count (AC-20, AC-20a)
- [ ] A Workspace where **every** Warehouse has no rate renders the Panel with its frame, gridlines
      and footnote and no marks
- [ ] Each carries an `h2` and an accessible summary naming what it plots and the counts it excludes
- [ ] Mobile: Order Flow 270 wide with every third week labelled; Receipt Reliability 278 × 200 with
      marks at r ≤ 12
- [ ] Removing colour entirely loses no figure
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

Parallel with [T20](./demand-pressure-and-purchasing-spread-panels-ui.md) — separate component
files.

The two rates are **two independent shares set beside each other, never combined into one number**.
There is no composite score and no ranking.

The bubble area is a client computation over a server-supplied absolute: the server sends the
quantity received, the component scales the mark relative to the largest in the set
([sad.md § Flags raised while drawing these flows](../sad.md)).

No tooltip; no motion.
