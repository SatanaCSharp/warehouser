---
status: approved
design_file: ../../mockups/app.pen
approved_frame: 'Workspaces / Workspace Administration / Desktop / v1'
approved_node_id: 'GiJ7U'
approved_frames:
  - name: 'Workspaces / Workspace Administration / Desktop / v1'
    node_id: 'GiJ7U'
    viewport: 'desktop 1440×953'
  - name: 'Workspaces / Workspace Administration / Mobile / v1'
    node_id: 'kpwkB'
    viewport: 'mobile 390×1679'
  - name: 'Workspaces / Workspace Roles / Desktop / v1'
    node_id: 'smALe'
    viewport: 'desktop 1440×1540'
  - name: 'Workspaces / Workspace Members / Desktop / v1'
    node_id: 'nh8oh'
    viewport: 'desktop 1440×1033'
  - name: 'Workspaces / Dialogs / Desktop / v1'
    node_id: 'ZfNnP'
    viewport: 'review board 1600×1227'
  - name: 'Workspaces / Dialogs / Mobile / v1'
    node_id: 'QidCt'
    viewport: 'review board 1330×857'
  - name: 'Workspaces / Required States / Desktop / v1'
    node_id: 'mXHZS'
    viewport: 'review board 1600×1678'
approved_at: '2026-08-11'
approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1440', 'mobile 390']
design_system_board: 'HeroUI v3 · Design System (CdGdS)'
---

# UI design handoff: workspaces

## Decision

- Selected design direction: the Workspace administration level built on the **shipped** authenticated
  shell — header plus 240px sidebar — with the Warehouse switcher added to the shell and a Workspace
  navigation entry added beside Access. One direction only; no alternatives were produced.
- Approval evidence: the user approved all seven frames by name in the design review conversation on
  2026-08-11.
- Canonical source: `docs/mockups/app.pen`. The frames and node IDs in `approved_frames` are the
  contract; previews are review evidence only.
- Preview files: `previews/GiJ7U.png`, `previews/kpwkB.png`, `previews/smALe.png`,
  `previews/nh8oh.png`, `previews/ZfNnP.png`, `previews/QidCt.png`, `previews/mXHZS.png`.
- Versioning: an approved frame is immutable. A revision creates a **new** versioned frame; the
  superseded one is renamed with an `Archive / ` prefix and kept forever, keeping its node ID so
  `migrated_from` pins keep resolving. Never delete an archived frame, and never delete a token it
  still binds.
- Every frame is composed from `HeroUI/*` components on board `CdGdS` and binds only the themed
  `semantic: light | dark` variables. This design added **no** new components and **no** new
  variables.

### The three review boards

`ZfNnP`, `QidCt` and `mXHZS` are review boards, not viewports. They hold the dialogs and the
non-happy-path states at their true rendered widths (440px modal, 390px sheet, 440px tile content)
so each can be inspected in isolation. Implementation renders their contents inside the desktop and
mobile shells above, not as a board.

## Component mapping

| Pencil component/node                                        | Existing code primitive                                                          | Adaptation allowed                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header shell (`TFanG` / `Vkw1J`)                             | `shared/layouts/RootLayout.tsx`                                                  | Brand, 80px/68px height, bottom border and responsive behavior stay as shipped. Only the switcher is added.                                              |
| Warehouse switcher (`n7Th5` desktop, `ciqhD` mobile)         | **New**, owned by `shared/layouts/`; reads `shared/api/workspace-context-api.ts` | Must render as a select (12px radius), never a pill button. Desktop sits in the header; mobile moves to a full-width context bar under it.               |
| Switcher popover (`XbWdw`)                                   | HeroUI `Popover` or `Select` listbox                                             | Archived entries stay listed, dimmed, not selectable, and labelled `Archived · not selectable`. Current entry carries a check, not colour alone.         |
| Sidebar + nav items (`wLPP8`, `HeroUI/Sidebar Item` `tvD98`) | `shared/layouts/Sidebar.tsx`                                                     | Workspace entry gated by a **workspace-level** gate, never `PermissionGate`. Active state is `accent-soft` background + `accent-soft-foreground`.        |
| Tabs (`HeroUI/Tabs` `Hh6Al`, `Tab Item` `d45RZp`)            | HeroUI `Tabs` as used in `modules/access/.../AccessWorkspace.tsx`                | Segmented at both viewports. Order Warehouses / Workspace roles / Members / Permissions. Mobile shortens "Workspace roles" to "Roles" only.              |
| Warehouse list card (`HeroUI/Card` `XqCT2`, in `mY6Hb`)      | HeroUI `Card`, mirroring `modules/access/.../roles/RoleList.tsx`                 | Selected = 2px accent stroke. Archived = neutral chip plus meta text; never colour alone.                                                                |
| Warehouse detail pane (`NATgU` / `m6hDj`)                    | **New** under `modules/workspace/components/`                                    | Name field, people list, and the footer action pair are the contract. It must not display any person's Role inside that warehouse (see §Level boundary). |
| Workspace role list + editor (`sDL1Q`, `AmkoM`)              | Mirrors `modules/access/.../roles/RoleDirectory.tsx` and `RoleEditor.tsx`        | Same list/editor split, same footer button order (soft-danger delete left, Cancel + primary right).                                                      |
| Permission rows (`HeroUI/Checkbox` `woPxV`)                  | `modules/access/.../roles/PermissionCheckbox.tsx` equivalent                     | Checked = `accent/soft` row; unchecked = `surface/secondary` row. The reserved row is disabled, muted, and carries an `Owner only` chip.                 |
| Workspace member rows (`edPx9`, `VrGa3`)                     | HeroUI `Card` + `Avatar`, mirroring `modules/access/.../members/MemberRow.tsx`   | Owner row shows `Protected` and offers transfer instead of Change role / Remove.                                                                         |
| Modals (`HeroUI/Modal` `w0Rcd`)                              | `shared/components/FormModalDialog.tsx`                                          | Cancel always precedes the primary in DOM and keyboard order. Destructive primaries use solid `danger`.                                                  |
| Bottom sheets (`l8hdYQ`, `Naijq`, `BZqCt`)                   | HeroUI `Drawer` (as `Sidebar.tsx` already uses)                                  | Same copy and field order as the desktop modal; primary becomes full-width and sits **above** Cancel.                                                    |
| Fields (`HeroUI/Field` `nIpP2`)                              | `shared/components/FormTextField.tsx`, `FormSelectField.tsx`                     | Visible label, description and error slots are the contract. Do not duplicate server validation rules client-side.                                       |
| Alerts (`HeroUI/Alert` `A0acua`)                             | HeroUI `Alert` with `shared/alerts/api-feedback.ts` copy                         | Icon + title + description; meaning and prominence must survive localization.                                                                            |
| Toasts (`HeroUI/Toast` `oEWEj`)                              | `shared/alerts/toast.ts`                                                         | Success copy states the outcome that committed, in workspace vocabulary.                                                                                 |
| Skeletons (`HeroUI/Skeleton` `gTR3X`)                        | `shared/components/DatasetCard.tsx`                                              | Reuse the existing loading/empty/error card contract per dataset.                                                                                        |
| Chips (`HeroUI/Chip` `s1kAL`)                                | HeroUI `Chip`                                                                    | `Protected`, `Archived`, `In operation`, `Owner only`, role names, warehouse names.                                                                      |
| Buttons (`HeroUI/Button` `KyxMx`)                            | HeroUI `Button`                                                                  | Primary / outline / soft-danger / dimmed-disabled treatments as drawn.                                                                                   |
| Separator (`HeroUI/Separator` `q4Imu`), Avatar (`w2OR26`)    | HeroUI `Separator`, `Avatar`                                                     | As shipped.                                                                                                                                              |

### Icons

The design uses these Lucide icons: `warehouse`, `building-2`, `archive`, `user-plus`, `pencil`,
`arrow-right-left`, `chevron-left`, `chevron-down`, `triangle-alert`, `info`, `shield`, `shield-x`,
`circle-check`, `check`, `x`, `plus`, `search`, `menu`, `layout-dashboard`, `shield-check`,
`trash-2`.

`apps/web/src/shared/icons/` currently exports only `Check`, `ChevronDown`, `Dashboard`, `Globe`,
`Kebab`, `Key`, `LogOut`, `Mail`, `Menu`, `Plus`, `Search`, `ShieldCheck`, `Trash`. Implementation
must add the missing ones as hand-rolled components following the existing file pattern, matching
the Lucide geometry. This gap predates this feature — the approved Access v3 frames already render a
`warehouse` brand mark that has no `shared/icons` component.

## Tokens

Every frame binds only the themed `semantic: light | dark` variables on board `CdGdS`. Those are the
HeroUI v3 default theme, already implemented in `apps/web/src/styles/global.css`; do not redefine
them. The mapping is identical to the one recorded in
[`../access/design-handoff.md`](../access/design-handoff.md) § Tokens and is not duplicated here.
Tokens this feature relies on that Access did not:

| Purpose                       | Pencil variable (board `CdGdS`)             | HeroUI v3 CSS variable / utility              |
| ----------------------------- | ------------------------------------------- | --------------------------------------------- |
| Warehouse in operation        | `$success/soft`, `$success/soft-foreground` | `--success-soft`, `--success-soft-foreground` |
| Unnamed workspace placeholder | `$warning/soft`, `$warning/soft-foreground` | `--warning-soft`, `--warning-soft-foreground` |
| Archived / unchecked row      | `$default/default`, `$surface/secondary`    | `--default`, `--surface-secondary`            |
| Sheet backdrop                | `$backdrop`                                 | `--backdrop`                                  |

## The level boundary is part of the design

The warehouse detail pane (`NATgU`, `m6hDj`) deliberately shows **who** has access to a warehouse
but never **what role they hold there**, and carries the line: _"What they may do inside it is
decided by that role, not by the workspace — manage those roles on the warehouse's Access page."_

This is a requirement, not a styling choice. `WORKSPACE_MEMBERS:WATCH` covers the Users of the
workspace and the warehouses they belong to (AC-33); it does not cover their Warehouse Roles.
Rendering a role there would either exceed the read the actor holds or invite the level confusion
AC-31 forbids. Implementation must not "improve" this pane by joining in Warehouse Role data.

## Responsive behavior

- **Desktop (1440).** Header (80px) + 240px sidebar + 40px-padded main. Page heading and its
  primary action share one row. List (340px) and detail pane sit side by side with a 24px gap.
- **Mobile (390).** Header drops to 68px and keeps only brand plus the menu trigger. The Warehouse
  switcher moves out of the header into a full-width context bar directly beneath it — same
  component identity, same information, different placement, because the switcher is the highest
  priority control on the page and must not compete for a 68px row.
- Between the two, the split view collapses before either pane becomes too narrow: the list becomes
  full-width cards, and selecting one navigates to a full-width detail screen with a `chevron-left`
  "All warehouses" back affordance.
- Tab labels shorten on mobile ("Workspace roles" → "Roles"); order and count never change.
- Page actions stack full-width on mobile in the same priority order; footer action pairs stack with
  the primary above the destructive one.
- Do not expose a dataset merely because room exists. `WORKSPACE_ROLES:WATCH`, `WORKSPACE_MEMBERS:WATCH`
  and `WAREHOUSES:WATCH` independently control which tabs, requests and retained data exist.

## States and interactions

Drawn on `mXHZS` unless noted.

- **Loading** (`j9Y6bX`): search field plus skeleton rows, announced as "Loading warehouses". Nothing
  is requested for a dataset the actor may not read.
- **Switcher open** (`XbWdw`): memberships listed, current one checked, archived listed but dimmed,
  disabled and labelled. Selecting writes presentation state only.
- **No Active Warehouse** (`p2NiLo`, AC-03b): explicit empty state. Nothing is chosen on the member's
  behalf when more than one membership exists.
- **Selection ended** (`pUVt0`): the warehouse was archived or the membership withdrawn. The member
  lands on a stated fallback with a way forward; the effective selection is re-derived on every read
  per `sad.md` §4, so a stale selection can never outlive the membership behind it.
- **Archived warehouse, read-only** (`N840R`, AC-12 / AC-12a): `Archived` chip, explanatory alert,
  mutating controls disabled with their reason exposed, `Restore warehouse` still available because
  its subject is the warehouse record.
- **Last non-archived warehouse refused** (`yUU5P`, AC-11a): danger alert, archive action disabled,
  the constructive alternative offered.
- **No workspace capability** (`b7j4A`, AC-30): the Workspace nav entry is **absent**, not disabled
  or empty, and the destination is unreachable.
- **Authority lost mid-session** (`OD62T`): safe explanation, capability state refreshed, existence
  of the target never disclosed.
- **Invalid input** (`ONjLw`, AC-08 / AC-15a / AC-29a): error bound to its field, naming the rule
  that failed; exact-name conflicts state that differently cased names are distinct.
- **Success** (`yyKA2`): toasts state the outcome that committed. Failures say nothing changed rather
  than implying a partial result.
- **Dialogs** (`ZfNnP`, `QidCt`): naming the workspace, adding a warehouse, archiving, giving
  warehouse access, transferring ownership, deleting an assigned role with replacement. Each names
  what changes, what is preserved, and what the boundary refuses.
- Disabled/unchanged save actions render dimmed and non-actionable, as on `NATgU` ("Save name").
- Use HeroUI hover, pressed, focus-visible, loading, disabled, success, warning and danger
  treatments. Avoid decorative motion; every state change must be understandable with reduced motion.

## Accessibility

- Semantic headings, a navigation landmark for the sidebar, `tabs`/`tabpanel` semantics, lists for
  member and warehouse collections, labelled form controls, native button semantics.
- The Warehouse switcher is a labelled combobox/select with an accessible name that includes the
  current warehouse, not just its value. Archived options expose `aria-disabled` **and** the reason.
- Keyboard order follows the visual hierarchy: header → switcher → sidebar → page heading → page
  action → tabs → tab actions → list → detail.
- Visible focus rings use the focus token. Protected, archived, selected, disabled, denied and
  destructive states are never communicated by colour alone — each carries text, a chip, or an icon.
- Validation and server errors are associated with their field; form-level outcomes are announced
  through a live region. Focus moves to the first invalid field, or to the dialog heading, after
  submission.
- Dialogs and sheets trap focus, support Escape when dismissal is safe, return focus to the invoking
  control, and place the non-destructive action before the destructive one in keyboard order.
- Reserved permissions expose both disabled state and the reason.
- Support localized text expansion and Unicode workspace, warehouse and role names without clipping.

## Implementation constraints

- Add the workspace route/page/components under `modules/workspace/` per `sad.md` §5; endpoints go
  through the shared RTK Query API slice, never a Redux slice.
- The Warehouse switcher and the actor-context read belong in `shared/`, not in one module — the
  application shell consumes them.
- Add the workspace path to `shared/constants/routes.ts`; route visibility is advisory UI behavior,
  never the server authorization boundary.
- Render and request each dataset only under its own watch permission. Do not fetch or retain a
  dataset the actor may not read.
- Derive mutation controls from the current capability projection **and** handle server denial
  independently for every action.
- Warehouse-scoped cache entries are keyed by warehouse; switching refetches rather than reusing
  another warehouse's data.
- Use HeroUI directly, the semantic tokens in `apps/web/src/styles/global.css`, centralized i18n
  resources under `public/locales/<language>/workspace.json`, and the existing normalized feedback
  adapters. Do not introduce a parallel component or styling system.
- Preserve the level-boundary presentation, archived treatment, reserved-permission treatment,
  responsive information hierarchy, and atomic-action explanations shown in the approved frames.

## Approved deviations

None. Implementation must report any visible deviation for approval.

## Open questions

- [ ] **Protected-manager flag in the memberships read.** Disabling "Withdraw access" on the
      warehouse manager's row (AC-25c) requires the read to mark which membership carries the
      protected Manager Role. `spec.md` AC-33 does not include that in the workspace-level read
      scope. Resolve in the contract rather than by widening the UI's read. — owner: Backend Lead,
      due: `api`
- [ ] **Missing icon components.** ~10 Lucide icons used by this design have no component in
      `apps/web/src/shared/icons/`. Decide whether to hand-roll them following the existing pattern
      or adopt `lucide-react`, and record it. — owner: Frontend Lead, due: `tasks`
- [ ] **Access v3 shell drift.** The approved `Access / … / v3` frames omit the sidebar that
      `RootLayout.tsx` ships and that these frames depict, so the two feature flows do not match side
      by side. Track as an Access re-migration; it is not a deviation in this feature. — owner:
      Frontend Lead, due: after this feature ships

### Resolved here

- **`spec.md` §8, second question — what a member is shown when their selected warehouse is archived
  or their membership withdrawn.** Answered by the `THE SELECTION ENDED` state on `mXHZS` (`pUVt0`):
  the member is told the warehouse is no longer available to them, is left with no selection, is
  offered the switcher, and is told their other access is unchanged. This follows `sad.md` §4's
  effective-selection derivation — stored selection, else AC-03b's single-membership rule, else none
  — rather than the spec's looser default of falling back to another membership, because choosing
  one of several memberships on the member's behalf is exactly what AC-03b forbids. `spec.md` §8
  should be updated to record this.
