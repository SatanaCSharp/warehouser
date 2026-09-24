---
id: T15
title: 'Add the chart primitives, the ten chart tokens, the scale helpers and the dashboard locale namespaces'
layer: 'ui'
deps: []
acs: ['AC-01']
files_hint:
  - 'apps/web/src/shared/components/charts/'
  - 'apps/web/src/shared/utils/chart-scale.ts'
  - 'apps/web/src/styles/global.css'
  - 'apps/web/public/locales/en/dashboard.json'
  - 'apps/web/public/locales/uk/dashboard.json'
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T15 — Add the chart primitives, the ten chart tokens, the scale helpers and the dashboard locale namespaces

> **Blocked by:** —
> **Satisfies:** AC-01 — see [spec.md §5](../spec.md)
> **Owner:** Frontend Lead · **Estimate:** L · **Layer:** `ui`

## Why

This is the repository's first charting surface and HeroUI supplies no series palette.
[ADR 0002](../adr/0002-charting-without-a-charting-dependency.md) — **Accepted at the `tasks` gate
on 2026-09-21** — rules that every mark is a rectangle, an ellipse or a 1 px hairline at a computed
offset, so `apps/web` takes **no charting dependency**. Both surfaces consume these primitives, and
no single domain entity owns a stacked bar, which is what promotes them to `shared/`
([sad.md §5](../sad.md)).

## What

- `shared/utils/chart-scale.ts` — `linearScale`, `bucketOffset`, pure and unit-tested directly.
- `shared/components/charts/` — `PanelCard`, `ChartLegend`, `StackedBarRow`, `ColumnPlot`,
  `HeatGrid`, `BubblePlot`, `PanelFootnote`.
- `styles/global.css` — the ten `--chart-*` variables in **both** themes, exactly as
  [design-handoff.md § Tokens](../design-handoff.md) states.
- `public/locales/{en,uk}/dashboard.json` — the new namespace.

`PanelCard` is HeroUI `Card` + `Card.Header` + `Card.Content`. Padding, radius and both shadows are
the Card contract — **do not restyle them**, and do not build a detached lookalike.

## Definition of Done

- [ ] `linearScale` and `bucketOffset` have direct unit tests including the degenerate
      zero-range case
- [ ] **No charting package is added to `apps/web`** — the `package.json` diff adds no dependency
- [ ] **No tooltip ships** (the 2026-09-21 `tasks`-gate ruling); nothing in `charts/` takes focus
- [ ] The ten tokens resolve in light and dark; `chart/track` and `chart/grid` alias the reused
      HeroUI tokens rather than restating hex values
- [ ] No status colour appears — nothing goes red, amber or green
- [ ] **The row-flex rule:** list rows flex between 20 px and 26 px; below 20 px the Panel scrolls
      internally while the surface does not
- [ ] Number grouping is space-grouped thousands, never a comma; `tabular-nums` on figure columns
- [ ] Component tests prove every series is readable with colour removed
- [ ] The locale-key-uniqueness and baseline gates pass on both new files
- [ ] `pnpm --filter @warehouser/web build` clean
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

Every string is a key; **no literal reaches a component**
([adding-and-maintaining-web-localization](../../../system/guides/adding-and-maintaining-web-localization.md)).

Text never wears the data colour. The one exception is a count set inside a filled segment, where
the ink is chosen by fill luminance: `$accent/foreground` on `ramp-4a`/`4b`,
`$foreground/foreground` on `4c`/`4d`.

No motion: no entry animation, no transition, no polling.

Regenerate the locale baseline through the documented safe path only.
