---
status: approved
design_file: ../../mockups/app.pen
approved_frame: 'Delivery Addresses / Customers / Desktop / v1'
approved_node_id: 'KRDln'
approved_frames:
  - name: 'Delivery Addresses / Customers / Desktop / v1'
    node_id: 'KRDln'
    viewport: 'desktop 1440×1280'
    preview: 'previews/customers-desktop-v1.html'
  - name: 'Delivery Addresses / Demand / Desktop / v1'
    node_id: 'Kvxj3'
    viewport: 'desktop 1440×1027'
    preview: 'previews/demand-desktop-v1.html'
  - name: 'Delivery Addresses / Purchase Draft / Desktop / v1'
    node_id: 'cvX6h'
    viewport: 'desktop 1440×2336'
    preview: 'previews/purchase-draft-desktop-v1.html'
  - name: 'Delivery Addresses / Frozen Draft / Desktop / v1'
    node_id: 'TVcmE'
    viewport: 'desktop 1440×2330'
    preview: 'previews/frozen-draft-desktop-v1.html'
  - name: 'Delivery Addresses / Incoming Lines / Desktop / v1'
    node_id: 'zj46c'
    viewport: 'desktop 1440×1038'
    preview: 'previews/incoming-lines-desktop-v1.html'
  - name: 'Delivery Addresses / Warehouse Address / Desktop / v1'
    node_id: 'e12gwk'
    viewport: 'desktop 1440×1422'
    preview: 'previews/warehouse-address-desktop-v1.html'
  - name: 'Delivery Addresses / Customers / Mobile / v1'
    node_id: 'b7gaH9'
    viewport: 'mobile 390×1430'
    preview: 'previews/customers-mobile-v1.html'
  - name: 'Delivery Addresses / Purchase Draft / Mobile / v1'
    node_id: 'b4NNRD'
    viewport: 'mobile 390×2858'
    preview: 'previews/purchase-draft-mobile-v1.html'
  - name: 'Delivery Addresses / Demand / Mobile / v1'
    node_id: 'g505i3'
    viewport: 'mobile 390×1786'
    preview: 'previews/demand-mobile-v1.html'
  - name: 'Delivery Addresses / Dialogs / Desktop / v1'
    node_id: 'ee6Ez'
    viewport: 'review board 1600×2360'
    preview: 'previews/dialogs-desktop-v1.html'
  - name: 'Delivery Addresses / Required States / Desktop / v1'
    node_id: 'okRzd'
    viewport: 'review board 1500×1990'
    preview: 'previews/required-states-desktop-v1.html'
approved_at: '2026-09-01'
approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1440', 'mobile 390']
design_system_board: 'HeroUI v3 · Design System (CdGdS)'
previews_status: 'published 2026-09-01 — 11 Tailwind HTML pages, one per approved frame'
---

# UI design handoff: delivery-addresses

## Decision

- Selected design direction: one new warehouse destination — **Customers** — carrying a customer
  with its Delivery Addresses and everything it awaits; a per-line **Delivery** block on the Purchase
  Draft line; per-line **endings** replacing the whole-draft arrival; a **By line** view that splits
  frozen lines by where their goods actually go; and the Warehouse's own Delivery Address on the
  existing Workspace administration surface. One direction only; no alternatives were produced.
- Approval evidence: the user replied **“approved, all eleven v1 frames”** on 2026-09-01 to the
  design review message that named all eleven frames above by name and node ID, with all eleven
  previews published and rendered.
- Canonical source: `docs/mockups/app.pen`. The frame names and node IDs in `approved_frames` are the
  contract; the `previews/*.html` files are review evidence only and are **never** an implementation
  source.
- Versioning: an approved frame is immutable. A revision creates a **new** versioned frame; the
  superseded one is renamed with an `Archive / ` prefix and keeps its node ID so `migrated_from` pins
  keep resolving. Never delete an archived frame.
- Every frame is composed from `HeroUI/*` components on board `CdGdS` and binds only the themed
  `semantic: light | dark` variables. This design adds **no new variables**. It adds eight
  `Delivery/*` components, listed in § Component mapping.

### Preview evidence

**Published 2026-09-01.** Eleven standalone Tailwind pages under `previews/`, one per approved frame,
each opened and confirmed to render. They carry the HeroUI v3 semantic tokens copied from
`apps/web/node_modules/@heroui/styles/dist/themes/{default/variables.css,shared/theme.css}` — including
the `--{default,accent,success,warning,danger}-soft-foreground` declarations, which the skill's
`templates/preview.html` token block omits and which every soft-toned chip, alert and button needs
for legible contrast. No image, PDF or `<img>` appears in `previews/`.

Structural sweep across the eleven frames: **522 nodes, 0 zero-size.** All eleven node IDs resolve to
the exact frame names and dimensions pinned in `approved_frames`.

### The two review boards

`ee6Ez` and `okRzd` are review boards, not viewports. They hold the dialogs and the non-happy-path
states at their true rendered widths (440px form modal, 720px per-line ending modal, 440px tile) so
each can be inspected in isolation. Implementation renders their contents inside the desktop and
mobile shells above, never as a board.

## Information architecture

| Destination                | Sidebar entry     | Gate                        | Frames                              |
| -------------------------- | ----------------- | --------------------------- | ----------------------------------- |
| Customers                  | `Customers`       | `CUSTOMERS:WATCH`           | `KRDln`, `b7gaH9`                   |
| Consolidated demand        | `Demand`          | `CUSTOMER_ORDERS:WATCH`     | `Kvxj3`, `g505i3`                   |
| Purchase drafts            | `Purchase drafts` | `PURCHASE_DRAFTS:WATCH`     | `cvX6h`, `TVcmE`, `zj46c`, `b4NNRD` |
| Warehouse delivery address | — (Workspace)     | `WAREHOUSES:ADDRESS_UPDATE` | `e12gwk`                            |

`Customers` is a **single new entry** in the shipped warehouse nav list, placed between `Items` and
`Access` so the two reference registries sit together: Dashboard, Demand, Purchase drafts, Items,
Customers, Access. It is **absent** — not disabled, not empty — when `CUSTOMERS:WATCH` is missing,
matching the rule `Sidebar.tsx` already applies to `Access` and to the three ordering entries
(`okRzd` tile `xARSD`, AC-09). No count, badge or total appears on it, because a count answers
“does this exist” as effectively as the record does.

The Warehouse's own Delivery Address adds **no destination**. It is a section inside the existing
Workspace administration → Warehouses → warehouse detail pane (`e12gwk`), between the warehouse-name
field and the people list, because its subject is the Warehouse record and `WAREHOUSES:ADDRESS_UPDATE`
is a Workspace Permission (spec §6.1).

## Component mapping

| Pencil component / node                                   | Existing code primitive                                        | Adaptation allowed                                                                                                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header (copied from `GuxtL`), Context Bar                 | `shared/layouts/RootLayout.tsx`, `WarehouseSwitcher.tsx`       | Unchanged. This feature adds nothing to the header at either viewport.                                                                                                                  |
| Sidebar + `HeroUI/Sidebar Item` (`tvD98`)                 | `shared/layouts/Sidebar.tsx`                                   | **One** entry added to `warehouseNavList`, at index 4, inside its own `WarehousePermissionGate` for `CUSTOMERS:WATCH`. Active state stays `accent-soft` + `accent-soft-foreground`.     |
| `Delivery/Customer Card` (`r80F1`)                        | **New**, `modules/customer/components/`                        | 340px list card: name, meta line, optional `Inactive` chip. Selected = 2px `accent/accent` stroke, matching the draft and warehouse cards.                                              |
| `Delivery/Address Row` (`LdZmY`)                          | **New**, `modules/customer/components/`                        | Address text, access notes, `Main` / `Inactive` chips, kebab. The address and the notes are **text**, never markup and never a link (spec §6.1 abuse cases).                            |
| `Delivery/Awaiting Row` (`zw3n9`)                         | **New**, `modules/customer/components/`                        | Four cells: item, outstanding, needed by, going to. `Going to` carries the address **and** why it is that address (main / stated on this order / now inactive).                         |
| `Delivery/Awaiting Card Mobile` (`XXFuv`)                 | **New**, `modules/customer/components/`                        | Mobile counterpart of `zw3n9`, same four facts in the same priority order.                                                                                                              |
| `Delivery/Customer Order Row` (`GGjUJ`)                   | **New**, `modules/demand/components/`                          | Replaces `Ordering/Customer Order Row` (`s17RG`) on this feature's demand frames. Adds the destination line under the customer name; the pin icon is **absent** on a typed-name order.  |
| `Delivery/Customer Order Card Mobile` (`T0O6LF`)          | **New**, `modules/demand/components/`                          | Mobile counterpart of `GGjUJ`. Same absent-pin rule.                                                                                                                                    |
| `Delivery/Draft Line` (`jnl1h`)                           | **New**, `modules/purchase-draft/components/`                  | One component for the editable **and** the frozen line, as `Ordering/Draft Line` was. Adds the `DELIVERY` block. Frozen = HeroUI disabled field treatment; never a read-only lookalike. |
| `Delivery/Dock Line Row` (`DFncO`)                        | **New**, `modules/purchase-draft/components/`                  | The `By line` view's row. Height is `fit_content` so a wrapping destination never clips; cells are vertically centred.                                                                  |
| `Ordering/Draft Card` (`l5QF7B`)                          | `modules/purchase-draft/components/PurchaseDraftCard.tsx`      | Reused unchanged. Its `Drift Row` child now also carries address drift on a **direct** line (AC-18a).                                                                                   |
| `Ordering/Link Row` (`BSmrU`)                             | `modules/purchase-draft/components/PurchaseDraftLinkRow.tsx`   | Reused. Serves four jobs now: a draft-line link, a frozen link with its drift chip, an **assignment** row in either ending dialog. Only the field label and trailing control differ.    |
| `HeroUI/Tabs` (`Hh6Al`)                                   | HeroUI `Tabs`                                                  | Three jobs: the customers `Active / Inactive` filter, the shipped draft state tabs, and the **segmented delivery-mode control** inside a draft line. Segmented at both viewports.       |
| `HeroUI/Modal` (`w0Rcd`)                                  | `shared/components/FormModalDialog.tsx`                        | Cancel always precedes the primary in DOM and keyboard order. Destructive primaries are solid `danger`. Both ending modals are 720px; every other modal is 440px.                       |
| Confirm-only dialogs (`E71Vi`, `Zzn8c`)                   | `shared/components/ConfirmAlertDialog.tsx`                     | Deactivate-a-customer and deactivate-an-address validate nothing, so they take the alert dialog, not the form dialog.                                                                   |
| `HeroUI/Field` (`nIpP2`)                                  | `shared/components/FormTextField.tsx`, `FormSelectField.tsx`   | Visible label, description and error slots are the contract. Address and access notes are the 56px-tall variant. Do not duplicate server validation rules client-side.                  |
| `HeroUI/Alert` (`A0acua`)                                 | HeroUI `Alert` + `shared/alerts/api-feedback.ts` copy          | Address drift, the freeze note, every refusal, the archived-warehouse notice, the “a draft cannot be made ready” note. Meaning must survive localization.                               |
| `HeroUI/Toast` (`oEWEj`)                                  | `shared/alerts/toast.ts` + `shared/alerts/mutation-actions.ts` | Success copy states the outcome that committed **and** its invisible consequence — that a redirection created drift, that a direct delivery moved no stock.                             |
| `HeroUI/Chip` (`s1kAL`)                                   | HeroUI `Chip`                                                  | `Main`, `Inactive`, `Active`, `Via warehouse`, `Direct to customer`, `Arrived …`, `Delivered …`, drift chips, `Archived warehouse`.                                                     |
| `HeroUI/Button` (`KyxMx`), `· Icon Only` (`IhRwb`)        | HeroUI `Button`                                                | Primary / outline / soft-danger / dimmed-disabled as drawn. Row kebabs are 32×32 (28×28 in nested rows).                                                                                |
| `HeroUI/Skeleton` (`gTR3X`), `HeroUI/Separator` (`q4Imu`) | `shared/components/DatasetCard.tsx`, HeroUI `Separator`        | Reuse the existing loading/empty/error card contract per dataset.                                                                                                                       |
| `HeroUI/Card` (`XqCT2`)                                   | `modules/workspace/.../WarehouseDetailPane.tsx`                | The warehouse detail pane keeps its three slots; the Delivery address section is inserted into the content slot, above the people list.                                                 |

### Icons

The design uses these Lucide glyphs: `layout-dashboard`, `clipboard-list`, `file-text`, `package`,
`contact`, `shield-check`, `warehouse`, `building-2`, `plus`, `search`, `info`, `triangle-alert`,
`circle-check`, `chevron-down`, `chevron-left`, `ellipsis`, `x`, `calendar`, `lock`, `truck`,
`corner-down-right`, `map-pin`, `package-check`.

`apps/web/src/shared/icons/` already exports all but **three**: `contact`, `map-pin`,
`package-check`. Hand-roll these following the existing `shared/icons/` pattern and Lucide geometry —
the same decision recorded and shipped for `workspaces` and `ordering`.

`map-pin` is load-bearing, not decorative: on a demand sub-row and on a mobile order card its
**absence** is what says “this order was recorded by typed name and has no delivery address”
(AC-24). It must never be rendered for a typed-name order, and the accompanying text must carry the
same meaning for a screen reader.

## Tokens

Every frame binds only the themed `semantic: light | dark` variables on board `CdGdS` — the HeroUI v3
default theme already implemented in `apps/web/src/styles/global.css`. Do not redefine them. The base
mapping is the one recorded in [`../access/design-handoff.md`](../access/design-handoff.md) § Tokens
and is not duplicated here. Tokens this feature leans on:

| Purpose                                              | Pencil variable (board `CdGdS`)                                 | HeroUI v3 CSS variable                                     |
| ---------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `Main` address chip, `Direct to customer` chip       | `$accent/soft`, `$accent/soft-foreground`                       | `--accent-soft`, `--accent-soft-foreground`                |
| Active customer, recorded ending chip                | `$success/soft`, `$success/soft-foreground`                     | `--success-soft`, `--success-soft-foreground`              |
| Address drift, archived warehouse, “will drift” note | `$warning/soft`, `$warning/soft-foreground`, `$warning/warning` | `--warning-soft`, `--warning-soft-foreground`, `--warning` |
| Every refusal, cancelled link, destructive primary   | `$danger/soft`, `$danger/soft-foreground`, `$danger/danger`     | `--danger-soft`, `--danger-soft-foreground`, `--danger`    |
| Frozen field, inactive address, `Via warehouse` chip | `$default/default`, `$default/soft`, `$border/secondary`        | `--default`, `--default-soft`, `--border-secondary`        |
| The `DELIVERY` block, link rows, table headers       | `$surface/secondary`                                            | `--surface-secondary`                                      |
| Segmented control track / selected pill              | `$default/default`, `$segment`, `$foreground/segment`           | `--default`, `--segment`, `--segment-foreground`           |

The `*-soft-foreground` tokens are the ones to reach for on a soft background. `--danger-foreground`
is near-white and is only correct on a **solid** danger surface; using it on `--danger-soft` produces
unreadable text, which is exactly the defect the first preview pass surfaced.

## Responsive behavior

- **Desktop (1440).** Header 80px + 240px sidebar + 48px-padded main. Customers and Purchase drafts
  are a 340px list and a fill detail pane with a 24px gap, matching Access, Workspaces and the
  shipped drafts page. Demand and the `By line` view are full-width tables at 1104px.
- **Mobile (390).** Header 68px, then the full-width warehouse context bar, then 20px-padded main.
  - Customers and Purchase drafts collapse list-and-detail into two screens; the detail screen opens
    with a `chevron-left` back affordance (“All customers”, “All purchase drafts”).
  - The customer detail keeps the **same order** as desktop: identity → delivery addresses → what
    they await. The awaiting table becomes cards carrying the same four facts in the same priority
    order: item → outstanding → needed by → going to.
  - Demand sub-rows become cards carrying name → address → quantity/date/state, the same order the
    desktop row uses.
  - Page actions and footer actions become full-width; the primary sits **above** the destructive one.
- **The three deliberate mobile differences**, each a width consequence rather than a redesign:
  1. A draft line's field row (item / quantity / packaging) stacks vertically, and so does the
     `DELIVERY` block's mode-control-and-destination row.
  2. A link row narrows its quantity field to 96px and **wraps the customer name** rather than moving
     the unlink control. Interaction is identical at both viewports.
  3. The draft detail drops its outer card frame — at 390px the viewport _is_ the pane.
- Do not expose a dataset merely because room exists. `CUSTOMERS:WATCH`, `CUSTOMER_ORDERS:WATCH` and
  `PURCHASE_DRAFTS:WATCH` independently control which nav entries, requests and retained data exist.

## States and interactions

Drawn on `okRzd` unless noted.

- **Loading** (`yX9ZT`): search field plus skeleton rows, announced as “Loading customers”. Nothing
  is requested for a dataset the actor may not read.
- **Empty — no customers yet** (`S9TOH`, AC-01): names why the list is empty and offers the one
  action that fills it.
- **No `CUSTOMERS:WATCH`** (`xARSD`, AC-09): the Customers entry is absent and the destination is
  unreachable. The denial names no customer, address, quantity or item, and exposes no count.
- **Customer identity withheld** (`Icfl4`, AC-09a): a member holding the draft and demand Permissions
  but not `CUSTOMERS:WATCH` reads drafts, demand and drift with **every** customer name withheld — a
  Customer's and one typed onto an order alike — together with addresses and access notes.
  Quantities, dates and items stay visible.
- **Archived warehouse** (`z3zpD2`, AC-23): `Archived warehouse` chip, explanatory alert, mutating
  controls visible-and-disabled with their reason exposed. Watch capabilities keep reading on exactly
  the terms that applied before archiving.
- **Cross-warehouse refusal** (`qIh14`, AC-12): never discloses that the customer or the address
  exists elsewhere.
- **Last active address** (`pb4Yx`, AC-07): the refusal names the rule and states the order the
  member must follow — add the replacement, then deactivate.
- **Main address moved automatically** (`QRFjQ`, AC-06b): a toast naming which address became the
  main one. Never left for the member to discover on the next order.
- **Inactive address not offered** (`u12PYn`, AC-06a): absent from the picker rather than shown and
  disabled, with a line saying so.
- **Direct line, demand elsewhere** (`cdIW2`, AC-15 / AC-15a): every disagreeing link is named and
  none is withdrawn — which one to drop is the member's decision. The same check runs when the link
  is made, when the line is revised, and again at Ready for ordering.
- **Own address on a direct line** (`IcUGb`, AC-14): the error is bound to the `Goes to` field and
  names the rule, not the request.
- **Ready refused, no warehouse address** (`eOhKY`, AC-16a): nothing changes, adding and revising
  lines keeps working, and the capability that unblocks it is named.
- **Ending already recorded** (`fpRfr`, AC-20a) and **wrong ending for this line** (`fssB1`, AC-20):
  each names when and by whom, or which of the two ways that line's goods travelled.
- **Address drift** (`TVcmE` node `jOf9j`, AC-18 / AC-18a): a warning alert naming each linked order
  that moved, the address frozen for it, and the address the demand now expects, with the line
  “Nothing on the draft has changed and nothing will.” Per-link drift also surfaces as a chip on the
  frozen link row. On a **direct** line the drift additionally appears on the draft **list card**;
  on a via-warehouse line it appears only once the draft is opened.
- **Success** (`LDc7S`): toasts state what committed, including the consequence a member could not
  otherwise see.
- **Dialogs** (`ee6Ez`): record a customer, add a delivery address, deactivate a customer, record a
  customer order, redirect a customer order, deactivate a delivery address, record a delivery to the
  customer, record an arrival at the dock. Each names what changes and what is preserved.
- Use HeroUI hover, pressed, focus-visible, loading, disabled, success, warning and danger
  treatments. Avoid decorative motion; every state change must be understandable with reduced motion.

## Accessibility

- Semantic headings, a navigation landmark for the sidebar, `tabs`/`tabpanel` semantics for the
  customers filter and the draft state tabs, `radiogroup` semantics for the delivery-mode segmented
  control, lists for customer, address and awaiting collections, labelled form controls.
- The delivery-mode control is a real radio group, not two buttons: its accessible name is “How it
  travels” and each option announces its own label. Frozen, it is `aria-disabled` with the reason
  exposed once for the whole line by the lock strip, not repeated per field.
- Row kebabs need an accessible name identifying their subject — “Actions for Hafenstraße 14, 20457
  Hamburg”, “Actions for Nordwind Logistik GmbH” — matching the convention already documented for
  Users Management.
- The demand row's disclosure is a real button exposing `aria-expanded` and controlling the
  customer-order group; its accessible name includes the item.
- Keyboard order follows the visual hierarchy: header → switcher → sidebar → page heading → page
  action → tabs → list → detail → address rows → awaiting table; and on a draft: line head → fields →
  delivery mode → destination → note → links → ending action.
- Visible focus rings use the focus token. Main/inactive addresses, delivery mode, drift, refusals,
  recorded endings, archived warehouses and disabled controls are **never** communicated by colour
  alone — each carries text, a chip, or an icon plus a label.
- **A missing delivery address must be announced, not merely absent.** A typed-name order's row
  carries the text “Recorded by typed name — no delivery address”; a screen-reader user must not have
  to infer the distinction from a missing icon.
- Each ending dialog's running total (“1 180 arrived · 1 180 assigned · 0 left unassigned”) is a live
  region, announced as quantities change.
- Validation and server errors are associated with their field; form-level outcomes are announced
  through a live region. Focus moves to the first invalid field, or to the dialog heading, after
  submission.
- Dialogs and sheets trap focus, support Escape when dismissal is safe, return focus to the invoking
  control, and place the non-destructive action before the destructive one in keyboard order.
- Support localized text expansion and Unicode customer, address and access-note text without
  clipping. An address is long by nature — every surface that renders one must wrap it, never
  truncate it into ambiguity.

## Implementation constraints

- Add `CUSTOMERS: 'customers'` to `ROUTE_SEGMENTS` and `WAREHOUSE_CUSTOMERS` to `ROUTES` in
  `shared/constants/routes.ts`; route visibility is advisory UI behavior, never the server
  authorization boundary.
- Place the new module at `modules/customer/`, following the shipped `modules/item/` shape
  (`route.tsx`, `page.tsx`, `components/customer-directory/`). Demand and draft changes stay inside
  `modules/demand/` and `modules/purchase-draft/`. Endpoints go through the shared RTK Query API
  slice, never a Redux slice.
- Gate every control with `WarehousePermissionGate` / `WorkspacePermissionGate` (or a
  `usePermittedItems` descriptor inside a React Aria collection) per the declarative-permission-gates
  ADR. There is no capability table and no component takes a capability as a prop.
- Read `docs/system/guides/writing-web-components.md` §6 before writing any conditional. Delivery
  mode (`Via warehouse` / `Direct to customer`) and line ending state are total `Record<…, ReactElement>`
  render lookups, not `if`/`else if` chains or ternary ladders.
- Warehouse-scoped cache entries are keyed by warehouse; switching refetches rather than reusing
  another warehouse's data. A Customer never crosses that boundary, in cache or in a picker.
- Derive mutation controls from the current capability projection **and** handle server denial
  independently for every action — including the direct-line agreement and the ending bounds, which
  the server re-checks at the moment the record is written rather than when the member composed it.
- New i18n namespaces under `public/locales/<language>/` with full `en`/`uk` key parity. Suggested:
  `customer.json`; extend `demand.json` and `purchase-draft.json` for the rest.
- Use HeroUI directly, the semantic tokens in `apps/web/src/styles/global.css`, and the existing
  normalized feedback adapters. Do not introduce a parallel component or styling system.
- Preserve the frozen treatment, the drift presentation split by delivery mode, the “absence means
  typed name” rule, the per-line ending model, and the responsive information hierarchy shown in the
  approved frames.

## Resolved here

- **Where the Warehouse's own Delivery Address is edited.** On the Workspace administration
  Warehouses tab, inside the existing warehouse detail pane — not as a warehouse-scoped screen —
  consistent with `WAREHOUSES:ADDRESS_UPDATE` being a Workspace Permission (spec §6.1) and with
  renaming and archiving already living there.
- **How AC-22 is expressed.** A `By draft / By line` segmented toggle in the Purchase drafts toolbar.
  The state tabs keep choosing _which drafts_; the toggle chooses _how you look at them_. This is a
  design decision the spec does not pin — see § Open questions.
- **Mobile context switcher.** These frames render the **selected** warehouse (“Central DC”), not
  “Choose a context”. This settles, for this feature's frames, the inconsistency the `ordering`
  handoff left open; the `ordering` frames themselves are untouched.

## Approved deviations

None. Implementation must report any visible deviation for approval.

## Open questions

- [ ] **The `By draft / By line` toggle is not pinned by an acceptance criterion.** AC-22 requires
      that the drafts surface separate dock-bound lines from directly-shipped ones, but names no
      mechanism. Decide whether the toggle keeps that shape and, if so, whether `spec.md` §5 should
      gain a criterion for it, rather than letting it ship as an unpinned behaviour. — owner: PM,
      due: before `tasks`
- [ ] **AC-09a depends on `spec.md` §8's first open question.** The `CUSTOMER IDENTITY WITHHELD` tile
      draws a surface that requires both its own Permission and `CUSTOMERS:WATCH`. If the
      authorization stage cannot be extended to compose two required Permissions, that tile is what
      breaks — the rest of the flow is unaffected. — owner: Tech Lead, due: before `design`
- [ ] **Nav position of `Customers`.** Placed between `Items` and `Access`, grouping the two
      reference registries. An equally defensible position is directly after `Demand`, since a
      customer is demand-side. Confirm before the sidebar change is written. — owner: Frontend Lead,
      due: before `implement`
- [ ] **`Ordering/Customer Order Row` (`s17RG`) is now superseded on every demand surface** by
      `Delivery/Customer Order Row` (`GGjUJ`). The `ordering` frames keep the old component, so both
      exist in the board. Decide at `tasks` whether the shipped
      `modules/demand` row component is extended in place or replaced. — owner: Frontend Lead, due:
      before `tasks`
- [ ] **`previews/` diverges from the four shipped features**, which carry `<node_id>.png` exports
      from before the skill required HTML. Nothing here depends on them being converted, but the
      repository now holds two kinds of review evidence. — owner: Frontend Lead, due: when those
      features are next revised
