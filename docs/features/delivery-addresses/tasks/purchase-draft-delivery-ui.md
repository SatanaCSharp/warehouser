---
id: T23
title: 'Add the per-line DELIVERY block, the drift presentation split by mode, and the By-line view'
layer: 'ui'
deps: [T19, T21]
acs: ['AC-09a', 'AC-13', 'AC-14', 'AC-15', 'AC-17', 'AC-18a', 'AC-22', 'AC-23']
files_hint:
  - 'apps/web/src/modules/purchase-draft/'
  - 'apps/web/src/shared/icons/'
  - 'apps/web/public/locales/'
  - 'apps/web/src/test/locale-baseline.json'
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T23 — Add the per-line DELIVERY block, the drift presentation split by mode, and the By-line view

## Why

A member preparing the dock should see only the goods they will physically handle, and a shipment heading to the wrong site should be a phone call rather than a loss — so where drift surfaces differs by delivery mode. Derives from approved frames `cvX6h`, `TVcmE`, `zj46c`, `b4NNRD` in [design-handoff.md](../design-handoff.md) and [spec.md §5 AC-18a, AC-22](../spec.md).

## What

Extend `modules/purchase-draft/`: `Delivery/Draft Line` (`jnl1h`) with the `DELIVERY` block and its `radiogroup` mode control, serving the editable **and** the frozen line; `Dock Line Row` (`DFncO`) and the `By draft / By line` toggle; drift on the list card for a direct line and inside the opened draft for a via-warehouse line.

## Definition of Done

- [ ] Delivery mode and ending state are total `Record<…, ReactElement>` render lookups — **no** `if`/`else if` chain and no ternary ladder.
- [ ] The frozen line uses the HeroUI disabled field treatment, never a read-only lookalike.
- [ ] Drift is reported on the draft list card for a direct line and inside the draft for a via-warehouse line; it instructs nothing and blocks nothing.
- [ ] The `By draft / By line` toggle renders the Dock Line Row split, listing each line of a mixed draft under its own mode.
- [ ] Identity is withheld across the list, the draft and the drift without `CUSTOMERS:WATCH`.
- [ ] An archived Warehouse renders read-only while every read still succeeds.
- [ ] The mode control is a `radiogroup` and is operable and announced at both viewports.
- [ ] en/uk parity holds with the baseline regenerated; `pnpm --filter @warehouser/web build` passes; lint + vet clean.

## Notes

**The `By draft / By line` toggle is an explicitly unpinned presentation choice.** AC-22 requires the separation and names no mechanism; the toggle is the approved design's answer and changing it later needs no spec amendment. Recorded here rather than left as a silent assumption ([design-handoff.md § Open questions](../design-handoff.md), confirmed at `tasks`). Read [writing-web-components §6](../../../system/guides/writing-web-components.md) before writing any conditional.
