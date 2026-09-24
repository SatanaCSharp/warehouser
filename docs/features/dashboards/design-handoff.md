---
status: approved
design_file: ../../mockups/app.pen
approved_frame: 'Dashboards / Warehouse / Desktop / v1'
approved_node_id: 'Zz5PK'
approved_frames:
  - name: 'Dashboards / Warehouse / Desktop / v1'
    node_id: 'Zz5PK'
    viewport: 'desktop 1280×800'
    preview: 'previews/warehouse-desktop-v1.html'
  - name: 'Dashboards / Warehouse / Required States / Desktop / v1'
    node_id: 'G4JNMV'
    viewport: 'review board 1160×3057'
    preview: 'previews/warehouse-required-states-desktop-v1.html'
  - name: 'Dashboards / Warehouse / Mobile / v1'
    node_id: 'NRmuw'
    viewport: 'mobile 390×2250'
    preview: 'previews/warehouse-mobile-v1.html'
  - name: 'Dashboards / Workspace / Desktop / v1'
    node_id: 'L1Wpz'
    viewport: 'desktop 1280×800'
    preview: 'previews/workspace-desktop-v1.html'
  - name: 'Dashboards / Workspace / Required States / Desktop / v1'
    node_id: 'ujNPP'
    viewport: 'review board 1160×1951'
    preview: 'previews/workspace-required-states-desktop-v1.html'
  - name: 'Dashboards / Workspace / Mobile / v1'
    node_id: 'z5swDF'
    viewport: 'mobile 390×1853'
    preview: 'previews/workspace-mobile-v1.html'
approved_at: '2026-09-21'
approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1280', 'mobile 390']
design_system_board: 'HeroUI v3 · Design System (CdGdS)'
previews_status: 'published 2026-09-21 — 6 Tailwind HTML pages, one per approved frame'
supersedes: 'Archive / Warehouse / Dashboard / Desktop / v1 (UOTlR)'
---

# UI design handoff: dashboards

## Decision

- Selected design direction: **a fixed two-column grid of four Panels with no masthead**, drawn at
  exactly the §6 threshold of 1280 × 800 so the one-screen requirement is verifiable rather than
  asserted. One direction only; no alternatives were produced.
- Approval evidence: the user replied **"approved, all six v1 frames — use Administration and
  /workspace/dashboard"** on 2026-09-21 to the design review message that named all six frames by
  name and node ID, with all six previews published and rendered.
- Canonical source: `docs/mockups/app.pen`. The frame names and node IDs in `approved_frames` are the
  contract; the `previews/*.html` files are review evidence only and are **never** an implementation
  source.
- Versioning: an approved frame is immutable. A revision creates a **new** versioned frame; the
  superseded one is renamed with an `Archive / ` prefix and keeps its node ID. Never delete an
  archived frame. The placeholder Dashboard frame this design replaces was renamed
  `Archive / Warehouse / Dashboard / Desktop / v1` and keeps node ID `UOTlR`.
- Every frame binds only the themed `semantic: light | dark` variables. This design adds **ten new
  variables** (§ Tokens) and **no new reusable components**: each Panel is composed from HeroUI/Card's
  visual contract, and every mark is a plain rectangle, ellipse or hairline.

### Preview evidence

**Published 2026-09-21.** Six standalone Tailwind pages under `previews/`, one per approved frame,
each rendered in headless Chrome and read. They carry the HeroUI v3 semantic tokens copied from
`apps/web/node_modules/@heroui/styles/dist/themes/{default/variables.css,shared/theme.css}` —
including the `--{default,accent,success,warning,danger}-soft-foreground` declarations that the
skill's `templates/preview.html` token block omits — plus the ten `--chart-*` declarations this
design introduces, in both the light and the dark block. No image, PDF, `<img>`, `background-image`
or data-URI appears in `previews/`.

Structural sweep across the six frames: **1 688 nodes, 0 zero-size.** Eight remaining
`partially clipped` geometry flags are the top y-axis tick label, centred on its boundary gridline
and overhanging its plot frame by 8 px into the Panel's own internal gap; each was screenshot-verified
as rendering without collision. No Panel clips its children.

## Information architecture

### Addresses and navigation

| Surface             | Address                                | Navigation entry                                                                            |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Warehouse Dashboard | `/warehouses/$warehouseId` (unchanged) | The existing ungated **Dashboard** entry, unchanged                                         |
| Workspace Dashboard | `/workspace/dashboard` **(new)**       | New **Dashboard** entry, first in the Workspace rail, gated by the new Workspace Permission |

Two changes to the shipped shell were approved with this design:

1. `/workspace` stays the administration destination. The Workspace Dashboard takes the new nested
   address `/workspace/dashboard` rather than becoming the Workspace landing, because making it the
   landing would break a shipped address and would land an actor holding administration but not the
   new Permission on a denial.
2. The Workspace rail's existing entry is relabelled **"Administration"** (today `nav.workspace` =
   "Workspace"). With a second Workspace destination present, "Workspace" no longer names anything
   the entry does. This is a one-key copy change owned by `workspaces`.

The Warehouse Dashboard is reached by entering the Warehouse and is not a destination of its own
(CONTEXT.md). Its navigation entry stays ungated: AC-02 makes a member admitting no Panel a denial,
not an absent entry.

### Panel order

One fixed order governs both the grid and every reflow:

- Warehouse: **Coverage Gap → Reason Concentration → Arrival Timing → Purchasing Pipeline**
- Workspace: **Demand Pressure → Order Flow → Purchasing Spread → Receipt Reliability**

The Warehouse order pairs the two row-oriented Panels on the tall row and the two distribution
Panels on the short one; it is not AC-01's prose enumeration order, which is not a layout contract.

### Grid geometry (desktop, 1280 × 800)

| Element        | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| Shell          | header 80, footer 33, sidebar 240 — all inherited, unchanged        |
| Content region | 1040 × 687, padding 24 → **grid 992 × 639**                         |
| Warehouse rows | row 1 **355**, gap 16, row 2 **268** (355 + 16 + 268 = 639 exactly) |
| Workspace rows | row 1 **311**, gap 16, row 2 **312**                                |
| Panel          | width 488, radius 24, padding 16, vertical gap 8                    |

**There is no page heading, chip row, lede or notice above the grid.** AC-01 admits "no words beyond
each Panel's own labels and the counts it states", and the whole 639 px is needed. The accessible
name is a visually-hidden `h1`.

### Reflow when fewer Panels are permitted

Panels fill a two-column grid row-major in the fixed order; a row holding a single Panel spans both
columns; each row takes the natural height of its tallest Panel. **With all four permitted the two
rows stretch to fill the screen exactly; with fewer, Panels keep their natural heights and the
surface is not stretched to fill.** Nothing marks the absence (AC-02a, AC-13).

- 3 Panels (e.g. no `REJECTIONS:WATCH`): row 1 = Coverage Gap | Arrival Timing at 355; row 2 =
  Purchasing Pipeline spanning both columns at its natural 232. Frame `G4JNMV`, tile 2.
- 1 Panel (AC-02a): it spans both columns at its natural height, top-aligned. Frame `G4JNMV`, tile 1.

## Component mapping

| Pencil node                                                                             | Existing code primitive                                                                                                                                                              | Adaptation allowed                                                      |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Panel frame (`Z4cE3M`, `CZvHc`, `z8UrQP`, `fbew6`, `DCucv`, `z5olfa`, `G3tB1`, `ScGrF`) | `Card` + `Card.Header` / `Card.Content` from `@heroui/react`                                                                                                                         | Padding, radius and both shadows are the Card contract — do not restyle |
| Panel Title / Panel Meta                                                                | `Card.Title` / `Card.Description` semantics at 14/600 and 12/400                                                                                                                     | Copy only; no second line on desktop                                    |
| Sidebar entry `Nav · Dashboard` (`c6YxA`, `QG5lC`)                                      | `shared/layouts/sidebar/components/SidebarNavItem`                                                                                                                                   | None — instance of the shipped item                                     |
| Workspace rail                                                                          | `shared/layouts/sidebar/components/WorkspaceNavEntries`                                                                                                                              | Adds one gated entry; relabels the existing one                         |
| Warehouse rail                                                                          | `shared/layouts/sidebar/components/WarehouseNavEntries`                                                                                                                              | Unchanged                                                               |
| `Chip · Archived warehouse` (`seD0V`)                                                   | `shared/components/ArchivedWarehouseChip` (`Chip` color="default" variant="soft" size="sm")                                                                                          | None — reuse the shipped component verbatim                             |
| Denial block (`E6hKlZ`, `DBvii`)                                                        | The shipped denial pattern: `<main className="mx-auto max-w-3xl px-6 py-12">` + icon + `h1` + muted `p`, as in `modules/item/page.tsx` and `shared/components/WarehouseEntryRefusal` | Copy only                                                               |
| `Permission / Observe warehouse performance` (`N7gG7`)                                  | The Workspace Role Editor's permission row (`workspaces`)                                                                                                                            | One more row in the WAREHOUSES group; no new component                  |
| Icons                                                                                   | `shared/icons` — `DashboardIcon`, `Building2Icon`, `ShieldXIcon`                                                                                                                     | Lucide names `layout-dashboard`, `building-2`, `shield-x`               |
| Chart marks (rectangles, ellipses, hairlines)                                           | **None yet** — see § Implementation constraints                                                                                                                                      | Library-agnostic; every mark is a positioned box                        |

This design adds no reusable Pencil component. Each Panel is a frame reproducing HeroUI/Card's exact
visual contract (`$surface/surface`, `$radius/3xl`, both card shadows, padding 16), so implementation
uses `Card` and nothing is a detached lookalike.

## Tokens

### New — chart series tokens

Ten variables added to `docs/mockups/app.pen`, themed on the `semantic: light | dark` axis. They exist
because this is the repository's first charting surface and HeroUI supplies no series palette. They are
derived from `--accent` (OKLCH hue 253.83) rather than hand-picked, and each set was validated with the
`dataviz` skill's `scripts/validate_palette.js`.

| Pencil variable | Light                | Dark                 | Job                                                  |
| --------------- | -------------------- | -------------------- | ---------------------------------------------------- |
| `chart/ramp-3a` | `#0058b6`            | `#0064bc`            | Ordinal step 1 of 3 (darkest)                        |
| `chart/ramp-3b` | `#1181ec`            | `#1181ec`            | Ordinal step 2 of 3 · also the single-series hue     |
| `chart/ramp-3c` | `#7aaeee`            | `#6da3e4`            | Ordinal step 3 of 3 (lightest)                       |
| `chart/ramp-4a` | `#0058b6`            | `#0064bc`            | Ordinal step 1 of 4 · heat-grid bin `100 +`          |
| `chart/ramp-4b` | `#0072e2`            | `#0076e4`            | Ordinal step 2 of 4 · heat-grid bin `50–99`          |
| `chart/ramp-4c` | `#4391eb`            | `#3f8ee7`            | Ordinal step 3 of 4 · heat-grid bin `20–49`          |
| `chart/ramp-4d` | `#7cafec`            | `#6fa4e4`            | Ordinal step 4 of 4 · heat-grid bin `1–19`           |
| `chart/supply`  | `#eb6834`            | `#d95926`            | Categorical slot 2 — **only** "expected at the dock" |
| `chart/track`   | `$surface/secondary` | `$surface/secondary` | Empty bar track · heat-grid zero cell                |
| `chart/grid`    | `$separator`         | `$separator`         | Gridlines and axis hairlines                         |

Validation results (OKLab ΔE ×100, Machado-Oliveira-Fernandes 2009 at severity 1.0):

- 3-step and 4-step ramps: `--ordinal` — monotone lightness, every adjacent ΔL ≥ 0.06, light-end
  contrast 2.30:1 light / 2.99:1 dark, hue spread ≤ 3°. **All checks pass in both modes.**
- `ramp-3b` × `supply` as a categorical pair: CVD ΔE **27.4** light / **27.7** dark (target ≥ 8),
  normal-vision ΔE **36.5** / **34.8** (floor ≥ 15), both slots ≥ 3:1 on their surface.
  **All checks pass in both modes.**

**No status colour appears on either surface.** §3 and CONTEXT.md forbid any figure that judges a
Warehouse — nothing goes red, amber or green. `chart/supply` sits ΔE 14.5 from `$warning/warning`;
they never appear in the same component, and every status element in the shell ships an icon and a
label while every series ships a legend key and a direct label, so neither can impersonate the other.

### Reused HeroUI tokens

`$surface/surface`, `$surface/secondary`, `$background/background`, `$foreground/foreground`,
`$foreground/muted`, `$border/border`, `$separator`, `$accent/soft`, `$accent/soft-foreground`,
`$accent/foreground`, `$default/soft`, `$default/soft-foreground`, `$radius/3xl`, `$radius/lg`,
`$radius/md`, `$typography/font-sans`.

### Type and mark specs

| Element              | Spec                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------- |
| Panel title          | 14 / 600 / `$foreground/foreground`                                                     |
| Panel meta, footnote | 12 / 400 / `$foreground/muted`                                                          |
| Column head          | 12 / 500 / `$foreground/muted`                                                          |
| Data label           | 12 / 400 / `$foreground/foreground`                                                     |
| Emphasised number    | 12 / 600 / `$foreground/foreground`, `tabular-nums`                                     |
| Number grouping      | Space-grouped thousands (`2 980`), never a comma                                        |
| Stacked bar          | Segments square, **2 px surface gap** between them, final data-end rounded 3 px         |
| Bar heights          | Coverage Gap 10 · Demand Pressure 12 · Reason Concentration 10 · Purchasing Pipeline 24 |
| Column widths        | Arrival Timing 17 (pair gap 2) · Order Flow 18                                          |
| Gridlines            | 1 px **solid** `$chart/grid` — never dashed                                             |
| Scatter mark         | r = 16 × √(received ÷ max received), floor ≈ 8.7; **2 px `$surface/surface` ring**      |
| Heat-grid cell       | 84 × 30, radius 6, count printed in every cell                                          |

## Panel specifications

### Warehouse — Coverage Gap (`Z4cE3M`)

Horizontal stacked bars, at most 10 Items plus one Remainder Row, ordered by Uncovered Quantity
descending (AC-03). Columns: Item 154 · bar track 150 · **Uncovered** 70 · **Total** 56, gaps 8.
Rows 22 px, flexing 20–26 px (§ Responsive). The two numeric columns are deliberately AC-03's two
sort keys, so the ordering is visible rather than asserted. Segments run **dark → light: On hand →
On order → Uncovered**; the legend states all three, and the Uncovered figure is printed on every
row, so nothing is read from colour alone. An Item with nothing uncovered simply has no third
segment (AC-05). The Remainder Row is muted and states how many Items it holds.

### Warehouse — Reason Concentration (`CZvHc`)

**Not a Pareto chart.** A quantity bar against a cumulative-% line is a dual-axis plot, which invents
a correlation the data does not contain; the running share AC-12 requires is a numeric column
instead. Columns: Reason 126 · bar cell 130 (track 88 + value 36) · **Undecided** 64 ·
**By customer** 80 · **Cum.** 32, gaps 6. Rows 26 px.

Undecided and By-customer are **columns, not sub-segments**: a Rejection can be both undecided and
customer-reported, so stacking them inside one bar would double-count. Both Rejection Sources are
counted in the bar (AC-12). No Remainder Row is drawn while nothing has been gathered into one.

### Warehouse — Arrival Timing (`z8UrQP`)

Grouped columns, never netted: one Overdue bucket 56 px wide then eight weeks at 44.75. Plot 116 px
tall, y-axis gutter 42, three gridlines at 0 / 1 250 / 2 500. `chart/ramp-3b` = owed,
`chart/supply` = expected at the dock. One footnote line carries all four exclusion counts AC-07,
AC-08a and §6 require: demand beyond the eighth week with its Customer Order count, undated drafts,
drafts still in Draft, and drafts since Closed or Discarded.

### Warehouse — Purchasing Pipeline (`fbew6`)

Two horizontal stacked bars, one per open state, split by the four Age Bands on a shared scale with
headroom to 50 drafts. **Every segment prints its count** in `$accent/foreground` on steps 4a–4b and
`$foreground/foreground` on 4c–4d, chosen by fill luminance. Counts drafts, never quantities; the
footnote states that Closed and Discarded drafts are not counted (AC-11).

### Workspace — Demand Pressure (`DCucv`)

One horizontal bar per active Warehouse, three ordinal Urgency Band segments, on a **scale of
quantities** so a small Warehouse in trouble is not flattened (AC-14). Columns: Warehouse 116 ·
track 248 · Outstanding 76. Footnote states the number of archived Warehouses excluded.

### Workspace — Order Flow (`z5olfa`)

Twelve stacked columns, pooled across the Workspace and naming no Warehouse (AC-16). Each week's
whole is its Recorded Quantity, divided bottom-up into **Assigned to arrived goods → Still awaited →
Cancelled**, so the cancelled part reads as withdrawn from the week rather than as demand
outstanding. The footnote carries AC-17a's retroactive-figure disclosure verbatim in substance:
weeks report what their Customer Orders currently ask for.

### Workspace — Purchasing Spread (`G3tB1`)

Warehouse × state count heat grid, four states including Closed and Discarded (AC-18). Sequential
one-hue bins `1–19 / 20–49 / 50–99 / 100 +` plus a `$chart/track` zero cell, with **the count printed
in every cell**, so the fill is a scanning aid and never the only encoding. A scale legend sits below.
The column head reads "Ready"; the Panel meta expands it to "Ready for ordering".

### Workspace — Receipt Reliability (`ScGrF`)

Bubble scatter: x = On-time Arrival Rate, y = Conformance Rate, area ∝ quantity received — two
independent shares set beside each other, never combined into one number. Plot 417 × 140 with
gridlines at 0 / 50 / 100 %. **Each mark is direct-labelled with its Warehouse name** (AC-19), placed
centred below the mark and moved to the side where that would collide. A Warehouse with no rate to
report is **not plotted** and is named in the footnote alongside every exclusion count (AC-20,
AC-20a).

## Responsive behavior

Desktop and mobile are the same design at two widths: same Panels, same fixed order, same marks, same
tokens. Below 1280 px the grid collapses to one column and the surface scrolls (§6).

Mobile frame 390 → content 350 → **Panel inner 318**. The Panel header stacks (title above meta)
because 318 px cannot hold both on one line.

| Panel                | Mobile treatment                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage Gap         | Two-line row: Item + "N uncovered" above, bar (track 252) + Total below. Same 11 rows, same order.                                        |
| Reason Concentration | Three-line row: Reason + Refused, full-width bar, then "Undecided N · By customer N · Cum. N%".                                           |
| Arrival Timing       | Plot 276 wide; the first bucket keeps "Overdue" and the weeks become bare week numbers (`39`…`46`) so no two labels touch. Columns 11 px. |
| Purchasing Pipeline  | Unchanged; bars rescale to 318.                                                                                                           |
| Demand Pressure      | Two-line row: Warehouse + Outstanding above, full-width bar below.                                                                        |
| Order Flow           | Plot 270 wide, columns 14 px; every third week labelled (`W28`, `W31`, `W34`, `W37`, `W39`).                                              |
| Purchasing Spread    | Warehouse name on its own line above its four 76.5 px cells, so "Discarded" fits its column head.                                         |
| Receipt Reliability  | Plot 278 × 200, marks scaled to r ≤ 12; labels below the mark, moving aside on collision.                                                 |

**Row-count pressure.** §6 requires every Warehouse shown (bounded at 20) _and_ no scrolling at
1280 × 800. Both hold to about eight Warehouses. The rule this design fixes: **list rows flex between
20 px and 26 px; below 20 px the Panel scrolls internally while the surface does not.** See § Open
questions.

## States and interactions

| State                                     | Behaviour                                                                                                                                                                                                                   | Frame              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| All four Panels permitted (AC-01)         | The 2 × 2 grid, no controls, nothing to choose before reading                                                                                                                                                               | `Zz5PK`, `L1Wpz`   |
| Some Panels permitted (AC-02a, AC-13)     | Permitted Panels reflow per § Information architecture. **No frame, title, count, placeholder or gap** marks the absence                                                                                                    | `G4JNMV` tiles 1–2 |
| No Panel permitted (AC-02)                | A denial. Names no Panel, shows no frame, axis or total, discloses neither which Permission fell short nor whether the Warehouse holds anything                                                                             | `G4JNMV` tile 3    |
| Workspace read denied (AC-15)             | The same denial shape. Discloses neither how many Warehouses the Workspace holds nor whether any has anything outstanding. The navigation entry is absent, so the address is reached only by an actor who already had it    | `ujNPP` tile 1     |
| Archived Warehouse (AC-23)                | Every Panel served on exactly the pre-archiving Permission terms, marked with the soft `Archived warehouse` chip in a 26 px strip above the grid                                                                            | `G4JNMV` tile 4    |
| Granting the Permission (AC-21, AC-21a)   | One more assignable row in the Workspace Role Editor's WAREHOUSES group, labelled **Observe warehouse performance**. Not reserved                                                                                           | `ujNPP` tile 2     |
| One Warehouse left to show (§8)           | Presented unchanged, comparing what there is. Three Panels reduce to a comparison of one and none says so; Order Flow is unaffected                                                                                         | `ujNPP` tile 3     |
| Stale Warehouse link (AC-09)              | **Not redesigned.** Served by the shipped `shared/components/WarehouseEntryRefusal` and `guards/landing.guard.ts`, unchanged                                                                                                | —                  |
| Loading                                   | The route loader awaits every permitted figure before the surface paints (§6 read shape). No per-Panel skeleton, because no Panel paints before the others                                                                  | —                  |
| Empty                                     | There is no empty state. A Panel with no rows draws its frame, its legend and its axis with no marks; it is not withheld                                                                                                    | —                  |
| Hover                                     | A per-mark tooltip is permitted and **gates nothing**: every value is already readable as a direct label, a numeric column or an axis tick. No tooltip is keyed by a Customer, a Customer name or a Delivery Address (§6.1) | —                  |
| Controls, filters, drill-through, refresh | **None.** Read on entering; no date range, no configuration, no route out of a figure (§3)                                                                                                                                  | —                  |

## Accessibility

- **Heading.** Neither surface draws a visible page heading (AC-01). Each carries a visually-hidden
  `h1` and each Panel a visible `h2`, so the heading order is `h1 → h2 × n`.
- **Never colour alone** (§6 legibility target). Every multi-series chart carries a legend whose keys
  are text; every stacked segment's value is readable as a printed count, a numeric column, or an axis
  tick; every scatter mark is direct-labelled with its Warehouse name. Removing colour entirely loses
  no figure.
- **Text never wears the data colour.** Labels, values, legends and axis text use
  `$foreground/foreground` or `$foreground/muted`. The one exception is a count set inside a filled
  segment, where the ink is chosen by the fill's luminance: `$accent/foreground` on `ramp-4a`/`4b`,
  `$foreground/foreground` on `4c`/`4d`.
- **Numbers.** `tabular-nums` in every column of figures; proportional figures nowhere, because there
  is no hero number on either surface.
- **Structure.** Row-oriented Panels are tables with a header row, not stacks of divs, so a screen
  reader announces the Item or Reason with each figure. Charts expose an accessible summary naming
  what they plot and the counts they exclude — the same text the footnote shows.
- **Contrast.** Every text token pair clears WCAG AA. The palest ordinal steps (`ramp-3c`, `ramp-4d`)
  sit at 2.30:1 against the surface, which is the ordinal light-end rule, not the 3:1 mark rule: they
  are never the sole carrier of a value, each being accompanied by a printed figure.
- **Focus and keyboard.** Nothing on either surface is interactive, so neither takes focus beyond the
  shell's own navigation. If a hover tooltip ships, its trigger must be focusable and show the same
  content on focus as on hover.
- **Motion.** None. No entry animation, no transition, no polling.

## Implementation constraints

- **Read-only.** Neither surface offers any control that changes a record, and opening one records
  nothing (§6 read-only guarantee).
- **A Panel the actor may not read is absent, never empty.** Absence must not be inferable from a gap,
  a frame, a title, a zero or the layout. The reflow rule exists precisely so the remaining Panels
  occupy the surface as though the withheld one had never been part of it.
- **The denial discloses nothing.** One copy string for every cause; it must not name the Panel, the
  Permission, or anything the Warehouse holds.
- **Charting library is still open.** §8's default is d3 recorded in an ADR, owed by the Tech Lead
  before `design`. This design does not depend on the choice: every mark is a rectangle, ellipse or
  1 px hairline at a computed pixel offset, so plain SVG or CSS boxes satisfy it. Whatever is chosen
  must not introduce its own colour palette — the `chart/*` tokens above are the palette.
- **Reuse, do not re-create:** `Card` for every Panel, `ArchivedWarehouseChip` for the archived mark,
  `SidebarNavItem` for the new entry, the shipped denial pattern for both denials, and
  `shared/icons` for every glyph.
- **Copy.** Every string is new `common`/`dashboards` namespace copy; no literal reaches a component
  (`guides/adding-and-maintaining-web-localization.md`).
- **Truncation.** A Rejection Reason longer than about 21 characters, or an Item name longer than about
  24, truncates with an ellipsis in its column on desktop; it wraps to nothing on mobile, where the
  name owns its own line.

## Approved deviations

- **No page masthead.** Every other destination in the product opens with an `h1`, a lede and a
  `max-w-5xl` column. Both Dashboards use `max-w-none`, 24 px padding and no heading, because AC-01
  admits no words beyond each Panel's own labels and because the 639 px grid needs the space.
- **Frame width 1280, not 1440.** Every previously approved desktop frame is 1440 wide. These two are
  drawn at 1280 × 800 so that the §6 one-screen requirement is verified at its threshold rather than
  above it. The Required-States boards are 1160-wide review boards.
- **A footer is drawn.** The approved frames of earlier features omit the shell's 33 px footer; these
  include it, because it is subtracted from the one-screen budget.

## Open questions

- [x] Which bucket holds a Purchase Draft in Ready for Ordering whose Expected Arrival Date has
      already passed? **Ruled at the `tasks` gate on 2026-09-21: the first bucket, beside the Overdue
      demand, as drawn in `z8UrQP`.** No frame changes. — owner: PM + Tech Lead
- [x] How does a Warehouse-keyed Panel behave beyond about eight Warehouses? **Ruled at the `tasks`
      gate on 2026-09-21: list rows flex 20–26 px, then the Panel scrolls internally while the
      surface does not.** The `spec.md` §6 amendment is owed by task T23. — owner: Tech Lead
- [ ] Does the archived-Warehouse chip belong above the grid, or beside nothing at all? It costs 26 px
      and compresses every list row to 20 px on a surface that disables no control.
      _Default now:_ the chip above the grid, no warning Alert, as drawn in `G4JNMV` tile 4. — owner:
      PM, due: before `implement`
- [x] Does a hover tooltip ship in this release? **Ruled at the `tasks` gate on 2026-09-21: no
      tooltip in this release.** Every value is already a direct label, a numeric column or an axis
      tick, so no Panel task carries a tooltip and none takes focus. Adding one later changes no
      frame. — owner: Frontend Lead
- [x] Inherited from spec §8 and unresolved here: the charting-library ADR — **Accepted
      2026-09-21, no dependency** ([ADR 0002](./adr/0002-charting-without-a-charting-dependency.md));
      the deployment timezone and week start — **`APP_TIMEZONE`, default `UTC`, weeks from Monday**
      (`data-model.md` § Time, timezone and the week); and the staleness mechanism behind AC-26 —
      **refetch on entry, not tag invalidation** (`sad.md` §8 "Freshness"). None changed this
      design.
