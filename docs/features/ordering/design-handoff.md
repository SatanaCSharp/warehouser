---
status: approved
design_file: ../../mockups/app.pen
approved_frame: 'Ordering / Demand / Desktop / v1'
approved_node_id: 'G6jhw'
approved_frames:
  - name: 'Ordering / Demand / Desktop / v1'
    node_id: 'G6jhw'
    viewport: 'desktop 1440×929'
  - name: 'Ordering / Purchase Drafts / Desktop / v1'
    node_id: 'yGhkK'
    viewport: 'desktop 1440×1891'
  - name: 'Ordering / Frozen Draft / Desktop / v1'
    node_id: 'F0SpRx'
    viewport: 'desktop 1440×1742'
  - name: 'Ordering / Items / Desktop / v1'
    node_id: 'XIvAZ'
    viewport: 'desktop 1440×889'
  - name: 'Ordering / Demand / Mobile / v1'
    node_id: 'SjdPo'
    viewport: 'mobile 390×1622'
  - name: 'Ordering / Purchase Draft / Mobile / v1'
    node_id: 'O42LHI'
    viewport: 'mobile 390×2234'
  - name: 'Ordering / Items / Mobile / v1'
    node_id: 'VHU6r'
    viewport: 'mobile 390×1392'
  - name: 'Ordering / Dialogs / Desktop / v1'
    node_id: 's5EPi'
    viewport: 'review board 1600×3010'
  - name: 'Ordering / Dialogs / Mobile / v1'
    node_id: 'blZtz'
    viewport: 'review board 1360×1178'
  - name: 'Ordering / Required States / Desktop / v1'
    node_id: 'hWFRW'
    viewport: 'review board 1500×1894'
approved_at: '2026-08-25'
reapproved_at: '2026-08-25 — reaffirmed with previews present'
approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1440', 'mobile 390']
design_system_board: 'HeroUI v3 · Design System (CdGdS)'
previews_status: 'captured 2026-08-25 — see § Preview evidence'
---

# UI design handoff: ordering

## Decision

- Selected design direction: three warehouse-scoped destinations — **Demand**, **Purchase drafts**,
  **Items** — added to the shipped authenticated shell (header + 240px sidebar), each gated by its
  own watch Permission. One direction only; no alternatives were produced.
- Approval evidence: the user replied **“approved”** on 2026-08-25 to the design review message that
  named all ten frames above by name and node ID. Reaffirmed later the same day, after the ten
  previews were captured and reviewed: the user chose to keep the `v1` frames as approved and carry
  the four preview-only layout defects as implementation notes (§ Open questions).
- Canonical source: `docs/mockups/app.pen`. The frame names and node IDs in `approved_frames` are the
  contract; previews are review evidence only.
- Versioning: an approved frame is immutable. A revision creates a **new** versioned frame; the
  superseded one is renamed with an `Archive / ` prefix and keeps its node ID so `migrated_from` pins
  keep resolving. Never delete an archived frame.
- Every frame is composed from `HeroUI/*` components on board `CdGdS` and binds only the themed
  `semantic: light | dark` variables. This design adds **no new variables**. It adds nine
  `Ordering/*` components, listed in § Component mapping.

### Preview evidence

**Captured 2026-08-25.** All ten frames are exported at 1x to
`docs/features/ordering/previews/<node_id>.png`. The earlier session could not capture them because
it looked for the standalone `get_screenshot` / `export_nodes` / `export_html` MCP tools, which Pen
1.2.7 no longer exposes — rendering moved _inside_ `execute` as `TakeScreenshot(nodeIds)` and
`Export(nodeIds, format, outputPath, options)`. There was never a wedged renderer; the tools had
been relocated.

Structural sweep, re-run against the same ten frames: **485 nodes, 0 zero-size, 0 `ctx.problems`.**
All ten node IDs still resolve to the exact frame names and dimensions pinned in `approved_frames`.

The renders confirm the design system holds — one shell, one HeroUI vocabulary, consistent density
and responsive logic across desktop and mobile, and the three review boards read cleanly. They also
surfaced four defects a structural sweep cannot detect, because each is a text run overflowing a
sibling inside a `fit_content` row rather than escaping its parent. They are recorded in
§ Open questions as mockup-layout defects, not design changes.

### The three review boards

`s5EPi`, `blZtz` and `hWFRW` are review boards, not viewports. They hold the dialogs and the
non-happy-path states at their true rendered widths (440px modal, 720px arrival modal, 390px sheet,
440px tile) so each can be inspected in isolation. Implementation renders their contents inside the
desktop and mobile shells above, never as a board.

## Information architecture

| Destination         | Sidebar entry     | Gate                    | Frames                      |
| ------------------- | ----------------- | ----------------------- | --------------------------- |
| Consolidated demand | `Demand`          | `CUSTOMER_ORDERS:WATCH` | `G6jhw`, `SjdPo`            |
| Purchase drafts     | `Purchase drafts` | `PURCHASE_DRAFTS:WATCH` | `yGhkK`, `F0SpRx`, `O42LHI` |
| Item catalogue      | `Items`           | `ITEMS:WATCH`           | `XIvAZ`, `VHU6r`            |

The three entries join `Dashboard` and `Access` in the existing warehouse-context nav list, in that
order. Each is **absent** — not disabled, not empty — when its watch Permission is missing, matching
the rule `Sidebar.tsx` already applies to `Access` (`hWFRW` tile `eHcB7`).

`Purchase drafts` carries a **drift count** in the `HeroUI/Sidebar Item` trailing slot, rendered only
when the count is greater than zero. This is the one affordance that serves US-08 (“I find out before
the goods arrive rather than at the truck”) from outside the drafts page. It reads from the same
drafts projection the destination uses; it is not a second request.

## Component mapping

| Pencil component / node                                     | Existing code primitive                                           | Adaptation allowed                                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header (copied from `GuxtL`), Context Bar (`jvcCO`)         | `shared/layouts/RootLayout.tsx`, `WarehouseSwitcher.tsx`          | Unchanged. This feature adds nothing to the header at either viewport.                                                                                            |
| Sidebar + `HeroUI/Sidebar Item` (`tvD98`)                   | `shared/layouts/Sidebar.tsx`                                      | Three entries added to `warehouseNavList`, each in its own `WarehousePermissionGate`. Active state stays `accent-soft` + `accent-soft-foreground`.                |
| `Ordering/Demand Row` (`prm7R`)                             | **New**, `modules/demand/components/`                             | Six cells: item, outstanding, earliest needed by, on hand, covered by, actions. The `Item Meta` node is swapped per row for the meta + disclosure control.        |
| `Ordering/Customer Order Row` (`s17RG`)                     | **New**, `modules/demand/components/`                             | The expanded sub-row under a demand line. Indented 48px, `surface/secondary`. Never rendered for a fulfilled or cancelled order.                                  |
| `Ordering/Demand Card Mobile` (`XYIfs`)                     | **New**, `modules/demand/components/`                             | Same five facts as the desktop row, re-flowed. Identical disclosure and kebab behaviour.                                                                          |
| `Ordering/Customer Order Card Mobile` (`eGKuW`)             | **New**, `modules/demand/components/`                             | Mobile counterpart of `s17RG`.                                                                                                                                    |
| `Ordering/Draft Card` (`l5QF7B`)                            | **New**, `modules/purchase-draft/components/`                     | List card. Selected = 2px `accent/accent` stroke. The `Drift Row` child is enabled only when the draft carries a drift signal (AC-16a) and is icon **plus text**. |
| `Ordering/Draft Line` (`ehtEw`)                             | **New**, `modules/purchase-draft/components/`                     | One component for both the editable and the frozen line. Frozen = HeroUI disabled field treatment; never a read-only lookalike. The `Link Rows` child is a slot.  |
| `Ordering/Link Row` (`BSmrU`)                               | **New**, `modules/purchase-draft/components/`                     | Serves three jobs: a draft-line link, a frozen link with its drift chip, and an arrival assignment row. Only the field label and the trailing control differ.     |
| `Ordering/Item Row` (`xEIH0`), `Item Card Mobile` (`QSHsy`) | **New**, `modules/item/components/`                               | On-hand cell carries the figure **and** its reason line — the reason is part of the contract, not decoration.                                                     |
| `HeroUI/Modal` (`w0Rcd`)                                    | `shared/components/FormModalDialog.tsx`                           | Cancel always precedes the primary in DOM and keyboard order. Destructive primaries are solid `danger`. The arrival modal is 720px; every other modal is 440px.   |
| Confirm-only dialogs (`OInpR`, `qk4x2`, `mqvJT`)            | `shared/components/ConfirmAlertDialog.tsx`                        | Nothing is validated in these three, so they take the alert dialog, not the form dialog.                                                                          |
| Mobile sheets (`f0bOO`, `tEpfk`, `fa8f3`)                   | HeroUI `Drawer` (as `Sidebar.tsx` already uses)                   | Same copy, same field order, same validation as the desktop modal. Primary becomes full-width and sits **above** Cancel.                                          |
| `HeroUI/Field` (`nIpP2`)                                    | `shared/components/FormTextField.tsx`, `FormSelectField.tsx`      | Visible label, description and error slots are the contract. Do not duplicate server validation rules client-side.                                                |
| `HeroUI/Alert` (`A0acua`)                                   | HeroUI `Alert` with `shared/alerts/api-feedback.ts` copy          | Used for the coverage note, the freeze note, the drift signal, the archived-warehouse notice and the frozen refusal. Meaning must survive localization.           |
| `HeroUI/Toast` (`oEWEj`)                                    | `shared/alerts/toast.ts` + `shared/alerts/mutation-actions.ts`    | Success copy states the outcome that committed. A failure says nothing changed rather than implying a partial result.                                             |
| `HeroUI/Tabs` (`Hh6Al`)                                     | HeroUI `Tabs` as used in `modules/access/.../AccessWorkspace.tsx` | Drafts only: `Being worked on` / `Ready for ordering` / `Closed`. Segmented at both viewports; order and count never change.                                      |
| `HeroUI/Skeleton` (`gTR3X`)                                 | `shared/components/DatasetCard.tsx`, `RoutePendingState.tsx`      | Reuse the existing loading/empty/error card contract per dataset.                                                                                                 |
| `HeroUI/Chip` (`s1kAL`)                                     | HeroUI `Chip`                                                     | `Draft`, `Ready for ordering`, `Active`, `Inactive`, `Archived warehouse`, coverage refs, urgency, drift and cancellation labels.                                 |
| `HeroUI/Button` (`KyxMx`), `· Icon Only` (`IhRwb`)          | HeroUI `Button`                                                   | Primary / outline / soft-danger / dimmed-disabled treatments as drawn. Row kebabs are 32×32 (28×28 in nested rows).                                               |
| `HeroUI/Separator` (`q4Imu`)                                | HeroUI `Separator`                                                | As shipped.                                                                                                                                                       |

### Icons

The design uses these Lucide glyphs: `layout-dashboard`, `clipboard-list`, `file-text`, `package`,
`shield-check`, `warehouse`, `plus`, `search`, `info`, `triangle-alert`, `circle-check`, `archive`,
`shield`, `shield-x`, `chevron-down`, `chevron-up`, `chevron-left`, `ellipsis`, `x`, `calendar`,
`lock`, `truck`, `corner-down-right`.

`apps/web/src/shared/icons/` already exports the equivalents of all but **eight**: `clipboard-list`,
`file-text`, `package`, `chevron-up`, `calendar`, `lock`, `truck`, `corner-down-right`. Hand-roll
these following the existing `shared/icons/` pattern and Lucide geometry — the same decision recorded
and shipped for `workspaces` (`design-handoff.md` § Open questions, T32).

## Tokens

Every frame binds only the themed `semantic: light | dark` variables on board `CdGdS` — the HeroUI v3
default theme already implemented in `apps/web/src/styles/global.css`. Do not redefine them. The
mapping is the one recorded in [`../access/design-handoff.md`](../access/design-handoff.md) § Tokens
and is not duplicated here. Tokens this feature leans on that earlier features did not:

| Purpose                                   | Pencil variable (board `CdGdS`)                          | HeroUI v3 CSS variable                              |
| ----------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Drift signal, archived-warehouse notice   | `$warning/soft`, `$warning/soft-foreground`              | `--warning-soft`, `--warning-soft-foreground`       |
| Drift indicator on a list card            | `$warning/warning`                                       | `--warning`                                         |
| Active item status                        | `$success/soft`, `$success/soft-foreground`              | `--success-soft`, `--success-soft-foreground`       |
| Overdue demand, cancelled link, refusal   | `$danger/soft`, `$danger/soft-foreground`                | `--danger-soft`, `--danger-soft-foreground`         |
| Coverage chip                             | `$accent/soft`, `$accent/soft-foreground`                | `--accent-soft`, `--accent-soft-foreground`         |
| Frozen field, inactive item, neutral note | `$default/default`, `$default/soft`, `$border/secondary` | `--default`, `--default-soft`, `--border-secondary` |
| Table header/footer, link row, line block | `$surface/secondary`                                     | `--surface-secondary`                               |

## Responsive behavior

- **Desktop (1440).** Header 80px + 240px sidebar + 48px-padded main. Demand and Items are tables at
  1104px. Purchase drafts is a 340px list and a fill detail pane with a 24px gap, matching Access and
  Workspaces.
- **Mobile (390).** Header 68px, then the full-width warehouse context bar, then 20px-padded main.
  - Demand and Items become card lists carrying the **same facts in the same priority order** as
    their table columns: identity → outstanding → earliest needed by → on hand → coverage.
  - Purchase drafts collapses list-and-detail into two screens; the detail screen opens with a
    `chevron-left` “All purchase drafts” back affordance.
  - Page actions become full-width. Footer action pairs stack with the primary **above** the
    destructive one.
- **The three deliberate mobile differences**, each a width consequence rather than a redesign:
  1. The draft detail drops its outer card frame — at 390px the viewport _is_ the pane, and the line
     cards already carry the surface.
  2. A draft line's field row (item / quantity / packaging) stacks vertically.
  3. A link row keeps its horizontal shape and narrows the quantity field to 96px, so the **customer
     name wraps rather than the unlink action moving anywhere**. Interaction is identical at both
     viewports.
- Do not expose a dataset merely because room exists. `ITEMS:WATCH`, `CUSTOMER_ORDERS:WATCH` and
  `PURCHASE_DRAFTS:WATCH` independently control which nav entries, requests and retained data exist.

## States and interactions

Drawn on `hWFRW` unless noted.

- **Loading** (`EZn9c`): search field plus skeleton rows, announced as “Loading demand”. Nothing is
  requested for a dataset the actor may not read.
- **Empty — no demand** (`mEZpI`, AC-04) and **no items** (`Sv9md`, AC-06): each names why the list is
  empty and offers the one action that fills it. The items empty state is reachable from the demand
  page, because demand cannot be recorded before an item exists.
- **No `CUSTOMER_ORDERS:WATCH`** (`eHcB7`, AC-05): the Demand entry is absent and the destination is
  unreachable. A denial names no customer, item, quantity or date.
- **Archived warehouse** (`TPZTI`, AC-23): `Archived warehouse` chip, explanatory alert, mutating
  controls visible-and-disabled with their reason exposed. Watch capabilities keep reading on exactly
  the terms that applied before archiving.
- **Frozen draft, change refused** (`Boqs2`, AC-15): the refusal names the rule, not the request, and
  offers the two things still possible — confirm arrival, or close with a reason.
- **Drift signal** (`F0SpRx` node `G5PCcB`, AC-16 / AC-16a): a warning alert listing each linked
  customer order that moved, compared against the snapshot, with the line “Nothing on the draft has
  changed and nothing will.” Per-link drift also surfaces as a chip on the link row itself.
- **Amended then put back** (`rMoqb`, AC-16): reports no drift. Drift is a comparison, not a
  touch log.
- **Cross-warehouse refusal** (`UpLMs`, AC-03 / AC-11): “No item with that SKU exists in this
  warehouse.” Never discloses that it exists elsewhere.
- **SKU no longer correctable** (`A0OO9m`, AC-06c): error bound to the SKU field, naming what holds
  it. Description and unit stay correctable in the same dialog.
- **Inactive item not offered** (`P9c2Y1`, AC-06d): absent from the picker rather than shown and
  disabled, with a line saying so.
- **A closed draft stops covering** (`H9RB2`, AC-21a): before/after coverage chips.
- **Assignment refused** (`s5EPi` node `RyYa3`, AC-18): every failing bound listed, and “Nothing of
  this confirmation has been saved.”
- **Success** (`M6wbjW`): toasts state what committed, including which customer became fulfilled.
- **Dialogs** (`s5EPi`, `blZtz`): record demand, adjust on-hand, add an item, amend a customer order,
  cancel a customer order, move to Ready for ordering, close a frozen draft, discard a draft,
  deactivate an item, confirm an arrival. Each names what changes, what is preserved, and what the
  boundary refuses.
- Use HeroUI hover, pressed, focus-visible, loading, disabled, success, warning and danger
  treatments. Avoid decorative motion; every state change must be understandable with reduced motion.

## Accessibility

- Semantic headings, a navigation landmark for the sidebar, `tabs`/`tabpanel` semantics for the draft
  filters, lists for demand and draft collections, labelled form controls, native button semantics.
- The demand row's disclosure is a real button exposing `aria-expanded` and controlling the
  customer-order group; its accessible name includes the item (“Show the 2 customer orders for Pallet
  wrap, 500mm”).
- Row kebabs need an accessible name identifying their subject, e.g. “Actions for WH-100420 · Pallet
  wrap, 500mm”, matching the naming convention already documented for Users Management.
- Keyboard order follows the visual hierarchy: header → switcher → sidebar → page heading → page
  action → tabs → list → detail → line → link row.
- Visible focus rings use the focus token. Draft state, drift, overdue demand, inactive items,
  archived warehouses, cancelled links and disabled controls are **never** communicated by colour
  alone — each carries text, a chip, or an icon plus a label.
- Frozen fields expose disabled state **and** the reason; the lock strip states it once for the whole
  draft rather than repeating it per field.
- Validation and server errors are associated with their field; form-level outcomes are announced
  through a live region. Focus moves to the first invalid field, or to the dialog heading, after
  submission.
- The arrival modal's per-line assignment summary (“1 180 arrived · 1 000 assigned · 180 left
  unassigned”) is a live region, so the running total is announced as quantities change.
- Dialogs and sheets trap focus, support Escape when dismissal is safe, return focus to the invoking
  control, and place the non-destructive action before the destructive one in keyboard order.
- Support localized text expansion and Unicode customer, item and reason text without clipping.

## Implementation constraints

- Add routes under `ROUTES.WAREHOUSE`'s child segments in `shared/constants/routes.ts`; route
  visibility is advisory UI behavior, never the server authorization boundary.
- Place modules per `sad.md` §5 and the scope-of-exercise tiebreak ADR: `modules/demand/`,
  `modules/purchase-draft/`, `modules/item/`. Endpoints go through the shared RTK Query API slice,
  never a Redux slice.
- Gate every control with `WarehousePermissionGate` (or a `usePermittedItems` descriptor inside a
  React Aria collection) per the declarative-permission-gates ADR. There is no capability table and
  no component takes a capability as a prop.
- Trigger generated `use<Endpoint>Mutation` hooks directly from components; success toasts are
  registry entries in `shared/alerts/mutation-actions.ts`, field-error policy lives in the endpoint's
  `transformErrorResponse`.
- Read `docs/system/guides/writing-web-components.md` §6 before writing any conditional. Draft state
  (`Draft` / `Ready for ordering` / `Closed` / `Discarded`) is a total `Record<State, ReactElement>`
  render lookup, not an `if`/`else if` chain or a ternary ladder.
- Warehouse-scoped cache entries are keyed by warehouse; switching refetches rather than reusing
  another warehouse's data.
- Derive mutation controls from the current capability projection **and** handle server denial
  independently for every action — including the arrival bounds, which the server re-checks at the
  moment the confirmation is recorded rather than when the member composed it.
- New i18n namespaces under `public/locales/<language>/` with full `en`/`uk` key parity. Suggested:
  `demand.json`, `purchase-draft.json`, `item.json`.
- Use HeroUI directly, the semantic tokens in `apps/web/src/styles/global.css`, and the existing
  normalized feedback adapters. Do not introduce a parallel component or styling system.
- Preserve the frozen treatment, the drift presentation, the “coverage claims nothing” copy, the
  on-hand reason line, and the responsive information hierarchy shown in the approved frames.

## Resolved here

- **`spec.md` §8, fourth question — does the Value-adding Note need per-customer-order structure?**
  Answered with the spec's stated default: **free text at the purchase draft line**. The line editor
  (`ehtEw`) puts the note beside the packaging type as one pre-receipt requirement per line, and the
  `Links Note` under each line states the ordered-versus-intended totals, so a member who needs two
  customers labelled differently splits the line. Nothing in the design assumes per-link notes, and
  adding them later would not invalidate these frames.

## Approved deviations

None. Implementation must report any visible deviation for approval.

## Open questions

- [x] **Preview PNGs are captured.** All ten frames exported to `previews/<node_id>.png` on
      2026-08-25 (see § Preview evidence). Superseded by the four findings below.
- [x] **Four visual defects found in the previews — resolved 2026-08-25: leave them.** Each is a
      label overrunning a sibling in a `fit_content` row — invisible to `ctx.problems`, which only
      flags a node escaping its _parent_. All four are mockup-layout defects; none changes an
      approved interaction or information decision. The `v1` frames stay approved and unmodified;
      real HeroUI flex rows will not reproduce these collisions, so implementation lays the four rows
      out correctly and reports anything that still collides. They are listed here as
      **implementation notes, not deviations**: - `G6jhw` **Demand / Desktop** — on the expanded first row, the disclosure label
      “hide the 2 customer orders” overlaps “pieces outstanding”. The collapsed rows
      (“5 customer orders”) clear it; only the longer expanded string collides. - `O42LHI` **Purchase Draft / Mobile** — the info alert heading is clipped mid-word at the
      frame edge: “Move to Ready for ordering once you have told th…”. - `O42LHI` **Purchase Draft / Mobile** — in `SERVES`, the customer name
      “Nordwind Logistik GmbH” collides with the “For them” field label; “Baltic Freight OÜ” sits
      flush against it. - `VHU6r` **Items / Mobile** — the closing info block heading is clipped at the 390px edge:
      “A SKU is correctable only until something names…”.
- [x] **Sample-data inconsistency between `F0SpRx` and `s5EPi` — resolved 2026-08-25: left as is.**
      On the frozen draft, LINE 2 reads `WH-100420 · Pallet wrap, 500mm` at quantity `1 200` while
      its own footer reads “400 ordered”; the arrival dialog on `s5EPi` renders the same LINE 2 as
      `WH-100733 · Carton 600×400×300`, 400 ordered. Known fixture inconsistency in the mockup
      content. No acceptance criterion depends on which item LINE 2 names, so neither frame is
      corrected and neither is authoritative for test fixtures.
- [ ] **Mobile shell shows the context switcher unselected.** `SjdPo`, `O42LHI` and `VHU6r` render
      the switcher as “Choose a context” while every desktop frame shows “Central DC”. If that is the
      empty state drawn deliberately, say so here; otherwise the mobile frames should show the same
      selected warehouse, since these are the same session. — owner: Frontend Lead, due: before
      `implement`
- [ ] **The drift count badge on the `Purchase drafts` nav entry is not pinned by an acceptance
      criterion.** AC-16a requires only that the drafts list distinguish drafted-with-drift from
      matching drafts. The badge is a design addition serving US-08's stated motivation. Decide
      whether to keep it, and if so whether `spec.md` §5 should gain a criterion for it, rather than
      letting it ship as an unpinned behaviour. — owner: PM, due: before `tasks`
- [ ] **Demand-line paging.** `spec.md` §1 fixes the scale at roughly 2 000 items and 5 000
      unfulfilled customer orders per warehouse, returned whole rather than paged. The demand and
      items tables are drawn without pagination to match. `HeroUI/Pagination` (`XlxVA`) exists on the
      board and is the component to reach for when §6 is revisited. — owner: Tech Lead, due: when the
      §1 scale is outgrown
