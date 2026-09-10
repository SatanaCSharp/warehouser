---
status: approved
design_file: ../../mockups/app.pen
approved_frame: 'Arrival Inspection / Ending Dialogs / Desktop / v1'
approved_node_id: 'W6TARi'
approved_frames:
  - name: 'Arrival Inspection / Ending Dialogs / Desktop / v1'
    node_id: 'W6TARi'
    viewport: 'review board 1600×2729'
    preview: 'previews/ending-dialogs-desktop-v1.html'
  - name: 'Arrival Inspection / Closed Draft / Desktop / v1'
    node_id: 'MaRvu'
    viewport: 'desktop 1440×2989'
    preview: 'previews/closed-draft-desktop-v1.html'
  - name: 'Arrival Inspection / Required States / Desktop / v1'
    node_id: 'N4IoNS'
    viewport: 'review board 1500×2130'
    preview: 'previews/required-states-desktop-v1.html'
  - name: 'Arrival Inspection / Ending Dialog / Mobile / v1'
    node_id: 'kejd2'
    viewport: 'mobile 390×2760'
    preview: 'previews/ending-dialog-mobile-v1.html'
  - name: 'Arrival Inspection / Closed Draft / Mobile / v1'
    node_id: 'aqFhl'
    viewport: 'mobile 390×3937'
    preview: 'previews/closed-draft-mobile-v1.html'
approved_at: '2026-09-07'
approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1440', 'mobile 390']
design_system_board: 'HeroUI v3 · Design System (CdGdS)'
previews_status: 'published 2026-09-07 — 5 Tailwind HTML pages, one per approved frame'
---

# UI design handoff: arrival-inspection

## Decision

- Selected design direction: the **Arrival Inspection is part of the line's ending, not a step after
  it**. One condition block, always visible, sits between the presented quantity and the assignments
  in both ending modals; a supplier's-instruction judgement sits below it with nothing pre-selected;
  and a closed draft reads the whole account back per line. One direction only; no alternatives were
  produced.
- Approval evidence: the user replied **“approved, all five v1 frames”** on 2026-09-07 to the design
  review message that named all five frames above by name and node ID, with all five previews
  published and rendered.
- Canonical source: `docs/mockups/app.pen`. The frame names and node IDs in `approved_frames` are the
  contract; the `previews/*.html` files are review evidence only and are **never** an implementation
  source.
- Versioning: an approved frame is immutable. A revision creates a **new** versioned frame; the
  superseded one is renamed with an `Archive / ` prefix and keeps its node ID. Never delete an
  archived frame.
- Every frame is composed from `HeroUI/*` components on board `CdGdS` and binds only the themed
  `semantic: light | dark` variables. This design adds **no new variables**. It adds six
  `Inspection/*` components, listed in § Component mapping.

### Preview evidence

**Published 2026-09-07.** Five standalone Tailwind pages under `previews/`, one per approved frame,
each opened and confirmed to render. They carry the HeroUI v3 semantic tokens copied from
`apps/web/node_modules/@heroui/styles/dist/themes/{default/variables.css,shared/theme.css}` — including
the `--{default,accent,success,warning,danger}-soft-foreground` declarations, which the skill's
`templates/preview.html` token block omits. No image, PDF, `<img>`, `background-image` or data-URI
appears in `previews/`.

Structural sweep across the five frames: **1 569 nodes, 0 zero-size introduced by this design.** The
five zero-size nodes reported inside `MaRvu` are the disabled `Trailing` slots inherited from
`HeroUI/Sidebar Item` (`tvD98`); the approved `TVcmE` reports the same five. All five node IDs
resolve to the exact frame names and dimensions pinned above, and every previously approved frame was
verified unchanged (`KRDln`, `Kvxj3`, `cvX6h`, `TVcmE`, `zj46c`, `e12gwk`, `b7gaH9`, `b4NNRD`,
`g505i3`, `ee6Ez`, `okRzd`, `s5EPi`, `jnl1h`).

**One limit on the visual verification.** Pencil's canvas renderer returned blank screenshots for
several tall, narrow frames (`kejd2`, `N4IoNS`, and instance roots generally). Those frames were
verified by resolved bounds, by per-section canvas screenshots, and by the rendered HTML preview —
not by a whole-frame canvas screenshot.

### The two review boards

`W6TARi` and `N4IoNS` are review boards, not viewports. They hold the dialogs and the non-happy-path
states at their true rendered widths (720px per-line ending modal, 440px form modal, 440px state
tile) so each can be inspected in isolation. Implementation renders their contents inside the desktop
and mobile shells, never as a board.

## Information architecture

This feature adds **no destination, no route and no nav entry.** Everything it does happens on
surfaces `ordering` and `delivery-addresses` already shipped:

| Where                                        | Surface                             | Gate                                                                                  | Frames                          |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| Recording a line's ending at the dock        | `LineEndingDialog` (arrival)        | `PURCHASE_DRAFTS:RECEIVE`, plus `REJECTIONS:CREATE` when the ending carries a refusal | `W6TARi` cell `H0jcSr`, `kejd2` |
| Recording a directly delivered line's ending | `LineEndingDialog` (directDelivery) | same pair                                                                             | `W6TARi` cell `Q1Fnj`           |
| Reading a closed draft's condition           | Purchase drafts detail pane         | `PURCHASE_DRAFTS:WATCH`; refusal detail additionally `REJECTIONS:WATCH`               | `MaRvu`, `aqFhl`                |
| Amending a refusal                           | Row dialog from a refusal's menu    | `REJECTIONS:UPDATE`                                                                   | `W6TARi` cell `Ue4xn`           |

`ROUTE_SEGMENTS` and `ROUTES` are untouched.

## Component mapping

| Pencil component / node                                                 | Existing code primitive                                                                                  | Adaptation allowed                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HeroUI/Modal` (`w0Rcd`) — both ending modals, 720px (`Geado`, `qAaUQ`) | `shared/components/FormModalDialog.tsx` via `LineEndingDialog.tsx`                                       | Extended in place. Stays `size="wide"`, `scroll="inside"`. Cancel keeps preceding the primary in DOM and keyboard order.                                                                                                                                                                                                                                     |
| `Modal · Amend this refusal` (`iNstk`), 440px                           | `shared/components/FormModalDialog.tsx`                                                                  | **New** dialog. It validates a description and a disposition, so it is `FormModalDialog`, never `ConfirmAlertDialog` (`web-dialogs.md` §1). Opened from a row → `useActionDialog` + `ActionDialogHost` (`web-action-dialogs.md`), with its own `Kind` union owned by the closed-line surface.                                                                |
| `Inspection/Condition Summary` (`bllT3`) / `· Mobile` (`M9G5z`)         | **New**, `modules/purchase-draft/components/`                                                            | Four figures: ordered, presented (`DELIVERED` on a direct line), refused, accepted. Refused is `--danger`; accepted is plain `--foreground` — the normal outcome is not celebrated in green. Desktop is one row of four; mobile is 2×2. In the ending dialog it is a **live region**, replacing nothing — the existing assignment summary live region stays. |
| `Inspection/Rejection Row` (`H6tv5L`)                                   | **New**, `modules/purchase-draft/components/.../line-ending-dialog/components/`                          | The editable refusal: quantity (`FormTextField`), reason (`FormSelectField`), remove (icon button), then description (`FormTextAreaField`). Desktop puts quantity + reason on one row; mobile stacks them. Field-error slots are the contract.                                                                                                               |
| `Inspection/Refusal Read Row` (`n4Ue8`) / `· Mobile` (`Jm3OQ`)          | **New**, `modules/purchase-draft/components/`                                                            | The read-only refusal on a closed line: quantity, reason, description, source chip, disposition chip, kebab. Mobile stacks the chips under the description.                                                                                                                                                                                                  |
| `Inspection/Closed Line` (`FYfEa`)                                      | **New**, `modules/purchase-draft/components/` — derived from the shipped `Delivery/Draft Line` (`jnl1h`) | One component serves **both** delivery modes; the direct-line rendering is an instance override, not a second component. Adds the `CONDITION ON ARRIVAL` block between the value-adding note and the links. `jnl1h` itself is untouched and still serves the editable and frozen draft.                                                                      |
| Condition block (`CEgQO` dock / `PgmvR` direct / `LZx6B` mobile)        | **New**, inside `LineEndingFieldset.tsx`                                                                 | Head row carries the micro-label, the **source chip** (derived from the line's Delivery Mode, never a field), and the `Refuse some of this` control. Followed by the summary, the refusal rows, and the explanatory footnote.                                                                                                                                |
| `Refuse some of this` — `HeroUI/Button` (`KyxMx`) with `package-x`      | HeroUI `Button`                                                                                          | Neutral `--default` fill, 32px, **always present** for a member holding `REJECTIONS:CREATE`. Never destructive-styled, never inside a menu, never behind a disclosure. Absent — not disabled — without the Permission (`WarehousePermissionGate`).                                                                                                           |
| Conformance block (`upEnS` / `lBacq` / `B00NU`)                         | **New**, inside `LineEndingFieldset.tsx`                                                                 | Frozen-instruction read-out (lock + packaging type + value-adding note), then a real `radiogroup` of Met / Not met / Not applicable, then the note field shown only under Not met.                                                                                                                                                                           |
| `HeroUI/Radio` (`LfvzU`)                                                | HeroUI `RadioGroup` / `Radio`                                                                            | The judgement is a radio group with **no default selection**. Horizontal on desktop, vertical on mobile. The option the line cannot take is rendered dimmed-and-unavailable, and the reason is exposed once for the group.                                                                                                                                   |
| `HeroUI/Checkbox` (`woPxV`) — `Acknowledgement` (`BW7Xy`)               | HeroUI `Checkbox`                                                                                        | Direct-delivery ending only. Required; the primary action is disabled until it is ticked.                                                                                                                                                                                                                                                                    |
| `HeroUI/Field` (`nIpP2`)                                                | `shared/components/FormTextField.tsx`, `FormSelectField.tsx`, `FormTextAreaField.tsx`                    | Visible label, description and error slots are the contract. Description fields are the 56px variant (84–96px at mobile). Do not duplicate server validation client-side beyond what the form already parses.                                                                                                                                                |
| `HeroUI/Alert` (`A0acua`)                                               | HeroUI `Alert` + `shared/alerts/api-feedback.ts` copy                                                    | Every note, every refusal, the closure summary, the finality acknowledgement, and every state tile on `N4IoNS`. Meaning must survive localization.                                                                                                                                                                                                           |
| `EndingRefusalAlert` position (`W6TARi` modal top)                      | `.../line-ending-dialog/components/EndingRefusalAlert.tsx`                                               | Reused unchanged for the server's refusals; extended with this feature's new refusal codes. It stays the one place a refused submission is explained.                                                                                                                                                                                                        |
| `Ordering/Link Row` (`BSmrU`)                                           | `modules/purchase-draft/components/PurchaseDraftLinkRow.tsx`                                             | Reused for the assignment rows and for the closed line's `SERVED, AS FROZEN` rows. Only the field label (`Assign to them` / `Assigned`) and the trailing control differ. Quantity field narrows to 96–110px at mobile.                                                                                                                                       |
| `HeroUI/Chip` (`s1kAL`)                                                 | HeroUI `Chip`                                                                                            | `Inspected at your dock`, `Reported by the customer`, `Inspected`, `Customer-reported`, `Undecided`, `Held for return`, `Refused at delivery`, `Scrapped on site`, `Accepted N of M presented`, `Closed`.                                                                                                                                                    |
| `HeroUI/Button · Icon Only` (`IhRwb`)                                   | HeroUI `Button`                                                                                          | Refusal-row remove is 36×36; the read row's kebab is 28×28. Each needs an accessible name identifying its subject.                                                                                                                                                                                                                                           |
| Header, sidebar, context bar, tabs, draft cards (`MaRvu`, `aqFhl`)      | `shared/layouts/RootLayout.tsx`, `Sidebar.tsx`, `PurchaseDraftCard.tsx`, `PurchaseDraftWorkspace.tsx`    | Reused unchanged. This feature adds nothing to the shell at either viewport.                                                                                                                                                                                                                                                                                 |

### Icons

The design uses these Lucide glyphs: `lock`, `info`, `triangle-alert`, `circle-check`, `circle-x`,
`package-x`, `clipboard-check`, `x`, `check`, `ellipsis`, `chevron-down`, `chevron-left`, `calendar`,
`map-pin`, `warehouse`, `package`, `contact`, `shield-check`, `file-text`, `clipboard-list`,
`layout-dashboard`.

`apps/web/src/shared/icons/` already exports all but **three**: `circle-x`, `package-x` and
`clipboard-check`. Hand-roll these following the existing `shared/icons/` pattern and Lucide
geometry — the same decision recorded and shipped for `workspaces`, `ordering` and
`delivery-addresses`.

None of the three is load-bearing: each accompanies text that carries the same meaning on its own.

## Tokens

Every frame binds only the themed `semantic: light | dark` variables on board `CdGdS` — the HeroUI v3
default theme already implemented in `apps/web/src/styles/global.css`. Do not redefine them. The base
mapping is the one recorded in [`../access/design-handoff.md`](../access/design-handoff.md) § Tokens
and is not duplicated here. Tokens this feature leans on:

| Purpose                                                                      | Pencil variable (board `CdGdS`)                                 | HeroUI v3 CSS variable                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Refused quantity, every blocked submission, the conformance `Not met` panel  | `$danger/danger`, `$danger/soft`, `$danger/soft-foreground`     | `--danger`, `--danger-soft`, `--danger-soft-foreground`    |
| Recorded-ending chip, conformance `Met` panel, success toasts                | `$success/soft`, `$success/soft-foreground`                     | `--success-soft`, `--success-soft-foreground`              |
| The finality acknowledgement, the over-assignment warning, `Held for return` | `$warning/soft`, `$warning/soft-foreground`                     | `--warning-soft`, `--warning-soft-foreground`              |
| `Direct to customer` chip, selected radio, informational notes               | `$accent/accent`, `$accent/soft`, `$accent/soft-foreground`     | `--accent`, `--accent-soft`, `--accent-soft-foreground`    |
| `Refuse some of this`, source chips, `Undecided`, neutral notes              | `$default/default`, `$default/soft`, `$default/soft-foreground` | `--default`, `--default-soft`, `--default-soft-foreground` |
| Condition summary ground, frozen-instruction read-out, refusal read rows     | `$surface/secondary`, `$border/secondary`                       | `--surface-secondary`, `--border-secondary`                |
| Condition and conformance block ground inside a modal                        | `$surface/surface`, `$border/border`                            | `--surface`, `--border`                                    |
| Modal and sheet ground                                                       | `$overlay`, `$radius/3xl`                                       | `--overlay`, `--radius` ×3                                 |
| Accepted quantity, every figure a member reads                               | `$foreground/foreground`, `$foreground/muted`                   | `--foreground`, `--muted`                                  |

The `*-soft-foreground` tokens are the ones to reach for on a soft background. `--danger-foreground`
is near-white and is only correct on a **solid** danger surface.

## Responsive behavior

- **Desktop (1440).** Header 80px + 240px sidebar + 48px-padded main, exactly as shipped. The
  purchase-drafts destination keeps its 340px list and 740px detail pane with a 24px gap. Both ending
  modals stay 720px — the widest modal the application opens; every other modal stays 440px.
- **Mobile (390).** Header 68px, full-width warehouse context bar, 20px-padded main.
  - The ending modal becomes a **bottom sheet** at full width, with a grabber, the same content in
    the same order, and full-width footer actions. The primary sits above Cancel visually; Cancel
    still precedes it in DOM and keyboard order.
  - The closed draft collapses list-and-detail into two screens; the detail screen opens with a
    `chevron-left` back affordance (“All purchase drafts”), matching `delivery-addresses`.
- **The five deliberate mobile differences**, each a width consequence rather than a redesign:
  1. A line's field row (item / quantity / packaging) stacks vertically, and so does the delivery
     mode-control-and-destination row — the rule `delivery-addresses` already set.
  2. The condition summary becomes **2×2** instead of one row of four. Same four figures, same order,
     same labels.
  3. A refusal row stacks: quantity above reason above description in the editor; quantity + reason
     on one line with the chips beneath in the read row.
  4. The judgement radio group becomes vertical.
  5. Description fields grow from 56px to 84–96px so a member's own prose is not clipped at the
     narrower measure.
- Information hierarchy, action priority, component identity and interaction behaviour are identical
  at both viewports. Nothing is present at one viewport and absent at the other.

## States and interactions

Drawn on `N4IoNS` unless noted.

- **The condition block is never optional and never collapsed.** It renders on every ending for a
  line where something was received, with the summary reading `presented · 0 refused · presented
accepted` before any refusal is added. There is no “add condition” step, no disclosure, and no
  empty state — refusing nothing is a statement the member makes, not a step they skip.
- **Refusing costs one click and two fields** (`W6TARi` cell `H0jcSr`, spec §8). The
  `Refuse some of this` control is permanently visible in the block header, neutral-toned, never in a
  menu. Accepted is derived and updates live, so a refusal never makes a member retype anything.
- **The conformance judgement has no default** (`upEnS`). On a line frozen carrying a Packaging Type,
  a Value-adding Note, or both, the member must choose Met or Not met before the ending can be
  submitted — so the fastest path through the dock still requires looking at the goods. This is the
  interaction half of spec §8's “what makes a warehouse that never refuses anything visible”.
- **Condition is stated before assignment** (spec §8). Order in both modals is presented → condition
  → conformance → assign. The assignment head names the accepted figure (`ASSIGN WHAT YOU ACCEPTED ·
1 192 AVAILABLE`).
- **Refusing after assigning** (`W6TARi` cell `IcDGW`): the surface flags **the assignment field that
  overshoots**, not the refusal, keeps every figure the member typed, and states the shortfall in
  words. The cheapest recovery is redistribution, which is what the surface points at.
- **The direct-delivery ending is acknowledged as final** (`S9PcQ`, spec §8): a required checkbox
  above the footer, “The customer has told me what arrived”, with the consequence stated in full. The
  primary action is disabled until it is ticked. **No reporting window and no time-driven state is
  introduced.**
- **The Rejection Source is never a field** (`AC-25`). It is derived from the line's Delivery Mode and
  shown as a chip in the condition head, so a refusal read on its own says which it is.
- **No `REJECTIONS:CREATE`** (`wMzw5`, AC-01a / AC-01b): the refuse control is **absent**, not
  disabled; the summary shows presented and accepted as the same figure; an ending that refuses
  nothing records as before. Nothing hints at a capability the member does not hold.
- **Blocked submissions** (`b799Xv` AC-02/AC-03, `KOuxb` AC-09, `MBCzx` AC-07/AC-06, `Hy3k1` AC-16,
  `QS499` AC-17/AC-17a, `VReZH` AC-04, `XJ5GY` AC-25, `aNXAl` AC-11/AC-12): each names the rule it
  broke and states that **nothing of the submission was recorded**. The member's figures stay in front
  of them; nothing is cleared and nothing is half-saved.
- **Nothing arrived** (`vZpFV`, AC-04a): the condition block and the conformance block are both
  absent. A line where nothing came records neither.
- **Refusal detail withheld** (`sCdGZ`, AC-22): a member with `PURCHASE_DRAFTS:WATCH` but not
  `REJECTIONS:WATCH` reads ordered, presented, accepted and **one** total refused figure. Every
  reason, description and disposition is withheld, and so is the division of that total into separate
  refusals. **No placeholder, no “hidden” chip, no count, no greyed row** — a placeholder is itself a
  disclosure that can be probed. That a refusal happened stays visible, because presented and
  accepted differ; the protection is over the cause of a refusal, never over the fact of one.
- **Cross-warehouse** (`VfZCB`, AC-26): identical wording whether the refusal exists elsewhere, exists
  nowhere, or belongs to a warehouse where the actor holds a membership and the matching Permission.
- **Amendment limits** (`YPG0K`, AC-20 / AC-18a): without `REJECTIONS:UPDATE` the row's menu offers
  nothing. Once a disposition is decided, `Undecided` is **absent from the list** rather than shown
  and disabled.
- **Catalogue extension** (`GF7gq`, AC-23a / AC-23): a recorded refusal names its reason; a closed
  draft always reads as it was recorded.
- **Success** (`NLEI2`): toasts state what committed **and** its invisible consequence — that refused
  demand stayed outstanding, that a draft closed itself, that an amendment is attributed. Registered
  in `shared/alerts/mutation-actions.ts`, raised by `mutationFeedbackMiddleware`.
- Use HeroUI hover, pressed, focus-visible, loading, disabled, success, warning and danger treatments.
  Avoid decorative motion; every state change must be understandable with reduced motion.

## Accessibility

- The condition summary is a **live region** (`role="status"`, `aria-live="polite"`), announced as the
  presented figure and the refusals change, alongside the assignment summary the shipped modal
  already announces. It reports what the member entered and never refuses a figure — the bounds are
  the server's.
- The judgement is a real `radiogroup` with the accessible name “Did the supplier follow your
  instruction?”. Each option announces its own label. The option a line cannot take is
  `aria-disabled` with the reason exposed **once for the group**, not repeated per option.
- The refusal-row remove control and the read row's kebab each need an accessible name identifying
  their subject — “Remove the refusal of 5 damaged by packing”, “Actions for the refusal of 5 damaged
  by packing” — matching the convention documented for Users Management.
- The finality checkbox is a labelled control, not a styled div; its description is associated with it
  so a screen-reader user hears the consequence before ticking it.
- Keyboard order follows the visual hierarchy: dialog heading → presented quantity → refuse control →
  each refusal (quantity → reason → description → remove) → judgement → judgement note → each
  assignment → acknowledgement → Cancel → primary.
- Validation and server errors are associated with their field; form-level outcomes are announced
  through a live region. Focus moves to the first invalid field, or to the dialog heading, after
  submission.
- **Nothing is communicated by colour alone.** Refused and accepted carry their own labels; the
  conformance verdict carries its wording (“Supplier's instruction — Not met”) beside its icon;
  disposition and source are chips with text. A monochrome rendering of any frame is still complete.
- Dialogs and sheets trap focus, support Escape when dismissal is safe, return focus to the invoking
  control, and place the non-destructive action before the primary in keyboard order.
- Support localized text expansion and Unicode customer, address and free-text content without
  clipping. A member's description is prose by nature — every surface that renders one must wrap it,
  never truncate it into ambiguity.
- The Rejection description and the conformance note are rendered as **text**, never as markup and
  never as a link (spec §6.1 abuse cases).

## Implementation constraints

- No new route, no new `ROUTE_SEGMENTS` entry, no new nav item. Everything lands in
  `modules/purchase-draft/`.
- The two ending modals stay **one component**, `LineEndingDialog.tsx`, with `kind` choosing copy and
  parse — the arrangement its own file documents. The condition and conformance blocks go inside
  `LineEndingFieldset.tsx` or its own child components under
  `.../line-ending-dialog/components/`, per `placing-web-components.md`.
- The amend dialog is opened from a row, so it takes `useActionDialog` + `ActionDialogHost` with the
  closed-line surface's own `Kind` union (`web-action-dialogs.md`). No surface hands a dialog an
  `onClose` or keeps an `isOpen`.
- Gate every control with `WarehousePermissionGate` (or a `usePermittedItems` descriptor inside a
  React Aria collection) per the declarative-permission-gates ADR. There is no capability table and no
  component takes a capability as a prop. `PermissionId.PURCHASE_DRAFTS_RECEIVE`,
  `PermissionId.PURCHASE_DRAFTS_WATCH` and the three new keys are named at the surface that needs
  them.
- **The conditional two-Permission rule is a server decision the UI mirrors, never replaces.** The UI
  hides the refuse control without `REJECTIONS:CREATE`; the server still re-checks the pair at the
  moment the ending is written, and `EndingRefusalAlert` explains the refusal when it comes back.
- Read `docs/system/guides/writing-web-components.md` §6 before writing any conditional. Delivery
  mode, Rejection Source, Disposition and the conformance verdict are total
  `Record<State, ReactElement>` render lookups, not `if`/`else if` chains or ternary ladders. Use
  `shared/components/Conditional` for anything rendered only some of the time
  (`writing-web-conditional-components.md`).
- Mutations trigger the generated `use<Endpoint>Mutation` hooks directly; success copy is a registry
  entry in `shared/alerts/mutation-actions.ts`, field-error policy is the endpoint's
  `transformErrorResponse` (generated-mutation-hooks ADR).
- Extend `apps/web/public/locales/<language>/purchase-draft.json` and `validation.json` with full
  `en`/`uk` key parity. The Rejection Reason catalogue is server data, not translated copy in the
  client.
- Use HeroUI directly and the semantic tokens in `apps/web/src/styles/global.css`. Do not introduce a
  parallel component or styling system.
- Preserve the always-visible condition block, the un-defaulted conformance judgement, the
  condition-before-assignment order, the derived accepted quantity, the source-as-chip rule, the
  finality acknowledgement, and AC-22's trace-free withholding. Each is a decision this handoff
  records, not an incidental of the drawing.

## Approved deviations

N/A until implementation review. Any visible deviation from an approved frame must be reported for
approval before it ships.

## Open questions

- [ ] **The finality checkbox can be ticked reflexively.** It buys a deliberate pause on a direct
      line's ending, not a guarantee that the customer's account is settled. It is the only friction
      this design places on that act, and spec §8 leaves the mechanism to `design-ui`. Confirm it is
      the right instrument, or replace it, before the direct-delivery ending is built. — owner: PM,
      due: before `implement`
- [ ] **AC-22's withheld read gives its reader no signal that anything was withheld.** That is what
      §6.1 requires — a placeholder is probeable — but it means a member without `REJECTIONS:WATCH`
      cannot tell they are reading a partial record, and may act on it. Confirm the trade is accepted
      as drawn. — owner: Security Lead, due: before `implement`
- [ ] **`Inspection/Closed Line` (`FYfEa`) serves both delivery modes through instance overrides.**
      The direct-line rendering carries roughly forty override paths. It proves one visual system
      covers both, but a second component may be cheaper to maintain. Decide at `tasks` whether the
      React implementation is one component with a mode lookup or two. — owner: Frontend Lead, due:
      before `tasks`
- [ ] **Two mobile counterpart components** (`Inspection/Condition Summary Mobile`,
      `Inspection/Refusal Read Row Mobile`) follow the repo's existing `* Mobile` convention rather
      than stacking one component with overrides. In React these may well be one component with
      responsive classes; the frames do not constrain that, only the resulting information
      hierarchy. — owner: Frontend Lead, due: before `implement`
- [ ] **Three icons must be hand-rolled** (`circle-x`, `package-x`, `clipboard-check`) following the
      `shared/icons/` pattern. None is load-bearing. — owner: Frontend Lead, due: before `implement`
- [ ] **Whole-frame canvas verification is missing for `kejd2` and `N4IoNS`.** Pencil's renderer
      returned blank screenshots for those frames; they were verified by resolved bounds, section
      screenshots and the rendered previews instead. Re-check them in the desktop canvas when it
      cooperates. — owner: Frontend Lead, due: before `implement`
