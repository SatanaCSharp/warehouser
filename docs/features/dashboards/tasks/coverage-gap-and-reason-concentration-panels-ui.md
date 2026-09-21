---
id: T17
title: 'Draw the Coverage Gap and Reason Concentration Panels as accessible tables with stacked bars'
layer: 'ui'
deps: [T16]
acs: ['AC-03', 'AC-05', 'AC-12', 'AC-25']
files_hint:
  - 'apps/web/src/modules/warehouse/components/dashboard/CoverageGapPanel.tsx'
  - 'apps/web/src/modules/warehouse/components/dashboard/ReasonConcentrationPanel.tsx'
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T17 — Draw the Coverage Gap and Reason Concentration Panels as accessible tables with stacked bars

> **Blocked by:** [T16](./warehouse-dashboard-shell-ui.md)
> **Satisfies:** AC-03, AC-05, AC-12, AC-25 — see [spec.md §5](../spec.md)
> **Owner:** Frontend Lead · **Estimate:** M · **Layer:** `ui`

## Why

The two row-oriented Panels of the Warehouse surface. Reason Concentration is deliberately **not** a
Pareto chart: a quantity bar against a cumulative-% line is a dual-axis plot that invents a
correlation the data does not contain
([design-handoff.md § Panel specifications](../design-handoff.md)).

## What

`modules/warehouse/components/dashboard/CoverageGapPanel.tsx` and `ReasonConcentrationPanel.tsx`,
each rendering from a fixed projection at the handoff's stated column widths, row heights and gaps
(frames `Z4cE3M` and `CZvHc`).

- **Coverage Gap** — horizontal stacked bars, at most ten Items plus one Remainder Row, segments
  dark→light **On hand → On order → Uncovered** with a 2 px surface gap, the Uncovered figure
  printed on every row, both sort keys visible as the two numeric columns.
- **Reason Concentration** — a quantity bar plus **numeric columns** for Undecided, By customer and
  the running share. Not sub-segments: a Rejection can be both, and stacking would double-count it.

## Definition of Done

- [ ] Both are real `<table>`s with a header row and an `h2`, so a screen reader announces the Item
      or Reason with each figure
- [ ] An Item with nothing uncovered simply has no third segment (AC-05)
- [ ] The Remainder Row is muted and states how many Items it holds (AC-03)
- [ ] No Remainder Row is drawn on Reason Concentration while nothing has been gathered (AC-12)
- [ ] A deactivated Item renders exactly as an active one (AC-25)
- [ ] `tabular-nums` on every figure column; space-grouped thousands
- [ ] Truncation with an ellipsis past ~21 characters (Reason) and ~24 (Item) on desktop; the name
      owns its own line on mobile
- [ ] Both mobile row treatments render at 390 px
- [ ] A Panel with no rows draws its frame, legend and axis with no marks
- [ ] Removing colour entirely loses no figure
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

Parallel with [T18](./arrival-timing-and-purchasing-pipeline-panels-ui.md) — separate component
files, no shared lane.

No tooltip (the 2026-09-21 `tasks`-gate ruling). Nothing on either Panel is interactive, so neither
takes focus beyond the shell's own navigation.

Every string is a `dashboard` namespace key.
