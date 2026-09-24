---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Frontend Lead', 'Tech Lead']
updated_at: '2026-09-21'
feature_size: 'L'
ticket: ''
---

# 0002 — Draw the Panels from layout primitives and module-owned scales, with no charting dependency

> **Status is `Accepted`.** `spec.md` §8 assigned this decision to the Tech Lead and stated d3 as
> its standing default. This ADR recommended otherwise, and the Tech Lead confirmed it at the
> `tasks` gate on 2026-09-21: **no charting dependency**. `sad.md` §11 no longer carries it as an
> open question, and `tasks.json` is sized for hand-built primitives over
> `shared/utils/chart-scale.ts`.

## Context

`apps/web` carries no charting dependency today — its `dependencies` are HeroUI, TanStack Router,
Redux Toolkit, React Hook Form, i18next, Zod, Lodash and React Aria, and nothing that draws a plot.
`dashboards` is the repository's first charting surface, and `spec.md` §8 records the question
openly: "Which charting library, and does the choice warrant an ADR? … _Default now:_ d3, recorded
in an ADR."

The approved design (`design-handoff.md`, frames `Zz5PK` / `L1Wpz` and four more) settles what the
charts actually are, and that changes the question. Every mark in all eight Panels is a rectangle,
an ellipse, or a one-pixel hairline at a computed offset:

| Panel                | Form                                               |
| -------------------- | -------------------------------------------------- |
| Coverage Gap         | horizontal stacked bars in a row list              |
| Reason Concentration | horizontal bars plus numeric columns               |
| Arrival Timing       | grouped columns over three fixed gridlines         |
| Purchasing Pipeline  | two horizontal stacked bars with in-segment counts |
| Demand Pressure      | horizontal stacked bars in a row list              |
| Order Flow           | stacked columns over three fixed gridlines         |
| Purchasing Spread    | a count heat grid                                  |
| Receipt Reliability  | a bubble scatter with direct labels                |

What the design does **not** contain is equally decisive, because `spec.md` §3 forbids most of it:
no configurable charts, no filters, no date ranges, no drill-through, no export, no alerts or
thresholds, no zoom, no brush, no pan. `design-handoff.md` § States adds no motion at all. Every
axis carries three fixed gridlines at values the Panel chooses, so there is no tick algorithm to
run. Every scale is linear from zero to a rounded maximum. There is no time axis — weeks are
ordinal buckets, not dates on a continuous scale. There are no curves, no paths, no stacking
algorithm beyond a running offset, and no layout algorithm at all.

## Decision drivers

- The repository's dependency culture is explicitly subtractive: the accepted
  [logging-instead-of-telemetry ADR](../../../system/adr/03-08-2026-structured-logging-instead-of-telemetry.md)
  removes a whole category of dependency rather than configuring it, and `AGENTS.md` forbids adding
  telemetry at all.
- A charting library brings its own palette, its own theming surface and its own default marks.
  `design-handoff.md` § Tokens fixes ten validated `chart/*` variables derived from `--accent`, and
  `styles/global.css` carries an explicit policy against a parallel palette. Any library whose
  colours must be overridden per chart is a second token system to keep in step.
- The repository's component rules are strict in ways imperative charting libraries fight:
  one exported component per file, `shared/components/Conditional` as the only conditional form, no
  element ternaries, handlers named above the `return`
  ([Writing web components](../../../system/guides/writing-web-components.md) §6–§7). A library that
  renders by mutating a DOM node it owns sits outside all of it.
- Bundle cost is paid by every actor entering a Warehouse, because the Warehouse Dashboard is the
  Warehouse's landing view rather than a destination someone chooses.
- Whatever is chosen is hard to reverse: it shapes eight components, their tests, and the way every
  later Panel is written.

## Considered options

1. **No charting dependency.** Draw each mark as a positioned element using the layout primitives
   the application already has, with linear scales and bucket arithmetic as pure functions in
   module-owned `utils/`, and chart presentation primitives in `shared/components/charts/`.
2. **d3** (`spec.md` §8's standing default), most likely the modular subset `d3-scale` +
   `d3-array` + `d3-shape`.
3. **A React charting library** — Recharts, visx, or nivo.

## Decision outcome

Chosen (recommended): **option 1 — no charting dependency.**

The drawing surface is the DOM the application already renders. Each Panel composes primitives
placed in `shared/components/charts/` — a panel card, a legend, a stacked bar row, a column plot, a
heat grid, a bubble plot and a footnote — over the `chart/*` tokens the design fixes. The two
computations any of them need are a linear scale and a bucket index, and both are pure functions of
their inputs, so they live in `shared/utils/` beside the other generic helpers and are unit-tested
directly rather than through a rendered chart.

Inline `<svg>` is used only where an element cannot express the mark: the bubble scatter's circles
and their surface rings. Everything else — bars, columns, gridlines, cells — is a box, which is what
lets the marks inherit the same tokens, the same dark-mode behaviour and the same responsive rules
as the rest of the page without a second styling path.

### Why not d3

d3 would be used for almost none of what d3 is for. `d3-scale`'s value is continuous domains,
time scales, nice-tick generation, ordinal band padding and log/pow/quantile scales; this design
needs `value → value / max * trackWidth` and nothing else, eight times. `d3-shape` draws arcs,
curves and area generators; nothing here is curved. `d3-axis`, `d3-selection`, `d3-transition`,
`d3-zoom` and `d3-brush` are all for behaviour `spec.md` §3 forbids.

What it would cost is real. The three modular packages are roughly 30–50 kB minified before
anything is drawn, on a view every member loads on entry. d3's selection model expects to own and
mutate a DOM subtree, so used idiomatically it must be quarantined behind a ref and an effect in
every chart component — a rendering path the repository has nowhere else, invisible to Testing
Library's accessible queries, and awkward against the accessibility contract in
`design-handoff.md` § Accessibility, which requires each row-oriented Panel to be a real table with
a header row. Used non-idiomatically — importing `scaleLinear` and rendering the result in JSX —
it is a dependency earning one multiplication.

The honest summary is that d3 is the right default for an _unknown_ set of charts, and this set is
known, fixed by `spec.md` §3, and small.

### Why not a React charting library

Recharts, visx and nivo each solve composition, responsiveness, tooltips and axes — and each brings
a component vocabulary, a theming model and a default palette that would sit beside HeroUI's rather
than inside it. The specific collisions: the `chart/*` ramps would have to be threaded through each
library's own colour API instead of being CSS variables the marks read; the libraries' responsive
containers would compete with the fixed 1280 × 800 grid geometry the design verifies; and their
tooltip and legend components would have to be suppressed or restyled to satisfy
`design-handoff.md`'s rule that a legend is text and a tooltip gates nothing. They are the right
choice when charts are many, varied and evolving. Four fixed Panels per surface, chosen once and
never chosen again by policy (`spec.md` §3), is the opposite case.

## Consequences

### Positive

- No bundle cost on the Warehouse's landing view, and no dependency to track, upgrade or audit.
- One token system. The marks read the same CSS variables as everything else, so dark mode, the
  theme toggle and the design board stay in step by construction.
- The charts are ordinary React components under the repository's existing component, placement and
  testing rules, so `placing-web-components.md` and `writing-web-components.md` apply to them
  unchanged and no new review vocabulary is needed.
- Accessibility is reachable: a row-oriented Panel can be a real `<table>` because nothing else owns
  its DOM, which is what `design-handoff.md` § Accessibility requires.

### Negative

- **The repository owns the scale and layout arithmetic.** It is small and pure, but it is ours to
  test and to get right — including label-collision placement in the bubble scatter, which the
  design settles by hand for five marks and which has no general solution here.
- **A later chart type could invalidate the premise.** A time-series line, a distribution curve, a
  brush or a zoom would each be real work that a library would have given for free. The trigger to
  revisit is explicit: the first Panel that needs a continuous axis, a curved mark, or a
  user-driven viewport.
- Label placement is data-dependent. The five scatter labels are placed by a stated rule (below the
  mark, moving aside on collision); a Workspace with Warehouses at near-identical rates will need
  that rule to actually run, not just the positions the design happened to draw.

### Neutral

- Nothing about the design changes if this is reversed later. Every mark is a positioned box over a
  linear scale, so swapping in a library replaces the primitives in `shared/components/charts/`
  without touching a Panel's data, contract, authorization or tests.
- `spec.md` §8's stated default is not silently overridden: it stays recorded there, and this ADR is
  the reviewed answer to the question it raises.

## Links

- [`design-handoff.md`](../design-handoff.md) § Tokens, § Panel specifications, § Implementation constraints
- [`spec.md`](../spec.md) §3, §8
- [Frontend architecture](../../../system/frontend-architecture.md) § Components
- [Writing web components](../../../system/guides/writing-web-components.md)
- [Structured logging instead of telemetry](../../../system/adr/03-08-2026-structured-logging-instead-of-telemetry.md) — the dependency posture this follows
