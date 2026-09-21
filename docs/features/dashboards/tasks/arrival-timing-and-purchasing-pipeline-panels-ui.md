---
id: T18
title: 'Draw the Arrival Timing and Purchasing Pipeline Panels with every exclusion count in their footnotes'
layer: 'ui'
deps: [T16]
acs: ['AC-07', 'AC-08a', 'AC-10', 'AC-11']
files_hint:
  - 'apps/web/src/modules/warehouse/components/dashboard/ArrivalTimingPanel.tsx'
  - 'apps/web/src/modules/warehouse/components/dashboard/PurchasingPipelinePanel.tsx'
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T18 — Draw the Arrival Timing and Purchasing Pipeline Panels with every exclusion count in their footnotes

> **Blocked by:** [T16](./warehouse-dashboard-shell-ui.md)
> **Satisfies:** AC-07, AC-08a, AC-10, AC-11 — see [spec.md §5](../spec.md)
> **Owner:** Frontend Lead · **Estimate:** M · **Layer:** `ui`

## Why

The two distribution Panels of the Warehouse surface, and the two whose honesty lives entirely in
their footnotes — AC-07, AC-08a and `spec.md` §6 together require seven exclusion counts between
them to be stated on the Panel ([design-handoff.md § Panel specifications](../design-handoff.md)).

## What

`modules/warehouse/components/dashboard/ArrivalTimingPanel.tsx` and `PurchasingPipelinePanel.tsx`
(frames `z8UrQP` and `fbew6`).

- **Arrival Timing** — grouped columns, never netted: one Overdue bucket 56 px then eight weeks at
  44.75, plot 116 px tall, y-axis gutter 42, three gridlines. `chart/ramp-3b` = owed,
  `chart/supply` = expected at the dock. **One footnote line carrying all four exclusion counts.**
- **Purchasing Pipeline** — two horizontal stacked bars, one per open state, split by the four Age
  Bands on a shared scale with headroom to 50 drafts, **every segment printing its count**, and a
  footnote stating that Closed and Discarded drafts are not counted.

## Definition of Done

- [ ] Arrival Timing's two series are drawn side by side and **never netted**
- [ ] All four exclusion counts render from their own projection fields — demand beyond the eighth
      week with its Customer Order count, undated drafts, drafts still in Draft, drafts since Closed
      or Discarded (AC-07, AC-08a)
- [ ] A late Ready draft appears in the **first bucket**, beside the Overdue demand
- [ ] Every Purchasing Pipeline segment prints its count, with the ink chosen by fill luminance
- [ ] The footnote states that Closed and Discarded drafts are not counted (AC-11)
- [ ] A draft readied yesterday after a month in Draft renders in the day-old band (AC-10)
- [ ] Gridlines are 1 px **solid**, never dashed
- [ ] Each carries an `h2` and an accessible summary naming what it plots and the counts it excludes
- [ ] Mobile: Arrival Timing's plot is 276 wide with bare week numbers; Purchasing Pipeline
      rescales to 318
- [ ] Removing colour entirely loses no figure
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

Parallel with [T17](./coverage-gap-and-reason-concentration-panels-ui.md) — separate component
files, no shared lane.

`chart/supply` sits ΔE 14.5 from `$warning/warning` and is the **only** categorical slot for
"expected at the dock". It never appears in the same component as a status element, and it must not
be reused for anything else.

No tooltip; no motion.
