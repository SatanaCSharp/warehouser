---
status: pending-approval
design_file: ../../mockups/app.pen
approved_frame: 'Access / Administration / Desktop / v3'
approved_node_id: 'd5ZBj'
approved_frames:
  - name: 'Access / Registration / Desktop / v3'
    node_id: 'UnZdn'
  - name: 'Access / Registration / Mobile / v3'
    node_id: 'sVWRO'
  - name: 'Access / Administration / Desktop / v3'
    node_id: 'd5ZBj'
  - name: 'Access / Administration / Mobile / v3'
    node_id: 'ZsDbl'
superseded_at: '2026-08-09'
superseded_by: 'change-request:design-migration'
baseline_revision: 'a7b0c9b5edb27b90b9fc348e9a0547bba18cdede'
migrated_from:
  - name: 'Archive / Access / Registration / Desktop / v1'
    node_id: 'f4Icg'
  - name: 'Archive / Access / Registration / Mobile / v1'
    node_id: 'jtBOB'
  - name: 'Archive / Access / Administration / Desktop / v1'
    node_id: 'W48Rk'
  - name: 'Archive / Access / Administration / Mobile / v1'
    node_id: 'G0Yvp'
  - name: 'Access / Administration / Desktop / v2'
    node_id: 'zQ4S5'
previously_approved_at: '2026-08-03'
previously_approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1440x900', 'mobile 390x844']
---

# UI design handoff: access

## Decision

- **Migrated by [`change-request:design-migration`](../../change-requests/design-migration/change.md) on 2026-08-09.**
  The frames listed in `approved_frames` are rebuilt from the `HeroUI/*` components on the
  `HeroUI v3 · Design System` board (`CdGdS`) and bind only the themed `semantic: light | dark`
  tokens. Information hierarchy, control order, states, and visible copy are carried over unchanged
  from the frames in `migrated_from`; the primitives rendering them changed. `status` is
  `pending-approval` until the user re-approves these frames. The pre-migration frames listed in
  `migrated_from` are **retained permanently** in `docs/mockups/app.pen` under their `Archive / `
  names and original node IDs — they are the record of what was approved and when, and must not be
  deleted. The top-level `Version history` frame indexes every current ↔ superseded pair.

- Selected design direction: focused warehouse access workspace built on the existing Warehouser auth shell and HeroUI visual system.
- Approval evidence: the user explicitly approved all four `v1` frames in the design review conversation on 2026-08-03.
- Canonical source: `docs/mockups/app.pen`; preserve the approved frame names and node IDs above. Any visible revision requires a new named frame/version.
- Versioning: an approved frame is immutable. A revision creates a **new** versioned frame; the
  superseded one is renamed with an `Archive / ` prefix and kept forever, keeping its node ID so
  `migrated_from` pins keep resolving. Never delete an archived frame, and never delete a token it
  still binds. The top-level `Version history` frame in `docs/mockups/app.pen` is the index.
- Preview files: `previews/UnZdn.png`, `previews/sVWRO.png`, `previews/d5ZBj.png`, and `previews/ZsDbl.png`.

### As-implemented pass (2026-08-09)

A second pass under `change-request:design-migration` rebuilt the frames that `apps/web` actually
ships, so this handoff records shipped UI rather than intent that drifted. The pass-1 frames are
archived, not deleted. What changed to match the code: segmented tabs at both viewports, plain
(icon-less) outcome lists, a `Show` text affordance instead of an eye icon on password reveal, and a
bordered trust box instead of a soft-surface alert.

## Component mapping

| Pencil component/node            | Existing code primitive                                            | Adaptation allowed                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Minimal/Mobile Header            | `shared/layouts/RootLayout.tsx`; HeroUI `Link`                     | Extend the authenticated shell with warehouse/access navigation while preserving current brand, height, border, and responsive behavior.                                       |
| Auth Text Field / Warehouse name | HeroUI `Input` in `modules/auth/sign-up/components/SignUpForm.tsx` | Use the shared contract and visible label/help/error slots; do not duplicate server validation rules.                                                                          |
| Primary actions                  | HeroUI `Button`                                                    | Labels may localize; size, primary emphasis, loading behavior, and focus treatment must remain equivalent.                                                                     |
| Access tabs                      | HeroUI `Tabs`                                                      | Segmented treatment at **both** viewports (`Tabs.ListContainer` + `Tabs.Indicator`), matching the shipped `AccessWorkspace.tsx`. Preserve the Roles/Members/Permissions order. |
| Role cards and editor            | HeroUI `Card`, `Input`, `Checkbox`, `Chip`, `Button`               | Selected, protected, disabled, and reserved states must remain visually distinct.                                                                                              |
| Role search                      | HeroUI `Input` with Lucide `search` icon                           | Filtering may be local or server-backed, but the visible field and empty result behavior remain the same.                                                                      |
| Permission rows                  | HeroUI `Checkbox` plus semantic text                               | The reserved manager-transfer Permission is disabled and explanatory; it must never look selectable for custom Roles.                                                          |
| Status and explanatory callouts  | HeroUI `Card`/`Chip` using semantic colors                         | Copy may localize; meaning, icon, and prominence must remain equivalent.                                                                                                       |
| Destructive confirmations        | HeroUI `Modal`/`AlertDialog`, `Select`, and danger `Button`        | Assigned-Role deletion requires replacement selection; manager transfer requires recipient and former-manager replacement Role.                                                |

## Tokens

Every migrated frame binds only the themed `semantic: light | dark` variables on the
`HeroUI v3 · Design System` board (`CdGdS`). Those variables are the HeroUI v3 default theme, so each
one maps to a CSS variable that `@heroui/styles` already ships — the application implements them in
`apps/web/src/styles/global.css` rather than redefining them.

| Purpose                 | Pencil variable (board `CdGdS`)               | HeroUI v3 CSS variable / utility             |
| ----------------------- | --------------------------------------------- | -------------------------------------------- |
| Page background         | `$background/background`                      | `--background` / `bg-background`             |
| Card and header surface | `$surface/surface`                            | `--surface` / `bg-surface`                   |
| Subtle surface          | `$surface/secondary`                          | `--surface-secondary`                        |
| Primary text            | `$foreground/foreground`                      | `--foreground` / `text-foreground`           |
| Secondary text          | `$foreground/muted`                           | `--muted`                                    |
| Field background        | `$field/background`                           | `--field-background`                         |
| Field placeholder       | `$field/placeholder`                          | `--field-placeholder`                        |
| Primary action, focus   | `$accent/accent`, `$accent/foreground`        | `--accent`, `--accent-foreground`, `--focus` |
| Soft accent             | `$accent/soft`                                | `--accent-soft`                              |
| Neutral control         | `$default/default`, `$default/foreground`     | `--default`, `--default-foreground`          |
| Segmented control       | `$segment`, `$foreground/segment`             | `--segment`, `--segment-foreground`          |
| Error                   | `$danger/danger`, `$danger/soft`              | `--danger`, `--danger-soft`                  |
| Success                 | `$success/success`                            | `--success`                                  |
| Warning                 | `$warning/warning`                            | `--warning`                                  |
| Borders                 | `$border/border`                              | `--border`                                   |
| Separators              | `$separator/separator`                        | `--separator`                                |
| Overlay / backdrop      | `$overlay`, `$backdrop`                       | `--overlay`, `--backdrop`                    |
| Radii                   | `$radius/sm` … `$radius/3xl`, `$radius/field` | `--radius` scale, `--field-radius`           |
| Spacing                 | `$spacing/1` … `$spacing/16`                  | `--spacing` scale                            |
| Typography              | `$typography/font-sans`, `$font-size/*`       | Application sans stack (Inter intent)        |

The retired flat variables (`$bg`, `$surface`, `$text`, `$muted`, `$primary`, `$radius-lg`,
`$space-4`, …) are no longer referenced by any migrated frame. No token maps to
`apps/web/src/styles/hero.ts`; that file does not exist and never did.

## Responsive behavior

- At desktop widths, keep the page heading and primary action on one row, show Roles as a left list and the selected Role editor as the larger right pane, and use the authenticated application shell.
- Tabs use the segmented HeroUI treatment at every viewport. **Amended 2026-08-09:** this previously
  specified an underline treatment on desktop; the shipped code always rendered segmented, and the
  owner resolved the mismatch in favour of the code during the as-implemented pass.
- Between desktop and mobile, collapse the split view before either pane becomes too narrow. Selecting a Role navigates from the list to a full-width editor with a clear back action.
- At the 390px mobile viewport, retain the same information priority: page identity, primary create action, Roles/Members/Permissions navigation, search, then records. Use a compact icon button for creation with an accessible name.
- Mobile cards replace the desktop detail pane; the Role editor, member assignment, deletion, and manager-transfer forms open as full-width pages or bottom-sheet/modal surfaces without changing the underlying action hierarchy.
- Do not expose a dataset merely because room exists. `ROLES:WATCH` and `USERS:WATCH` independently control which tabs, requests, and retained data are available.

## States and interactions

- Registration: default, field focus, inline Warehouse-name validation, submitting/loading, atomic success with immediate session, and atomic failure. Failure must not imply that a partial Account or Warehouse exists.
- Role list: loading skeleton, empty state, search-empty state, selected Role, protected Manager Role, and read-denied state.
- Role editor: unchanged/disabled save, dirty save, submitting, success confirmation, normalized server error, concurrent-revocation denial, and reserved Permission disabled state.
- Role creation and rename use trimmed Unicode names, explain the 1–100 user-perceived-character rule, and surface exact-name conflicts without implying case-insensitive uniqueness.
- Member assignment hides the protected Warehouse Manager Role and prevents ordinary reassignment of the current manager.
- Deleting an unassigned Role asks for confirmation only. Deleting an assigned Role requires a same-Warehouse replacement Role, summarizes the affected-member count, and performs one atomic action.
- Manager transfer is available only to the current protected manager. The confirmation identifies the recipient and requires a custom replacement Role for the former manager; self-selection and cross-Warehouse choices are never offered.
- Capability controls disappear when the refreshed current-access projection removes permission. A denial caused by a race presents a safe explanation and refreshes visible capability state.
- Use HeroUI hover, pressed, focus-visible, loading, disabled, success, warning, and danger treatments. Avoid decorative motion; state changes should remain understandable with reduced motion enabled.

## Accessibility

- Use semantic headings, navigation landmarks, tabs/tabpanels, lists or tables as appropriate, labelled form controls, and native button semantics.
- Preserve a logical keyboard order following the visual hierarchy. On mobile, the compact add button requires an accessible name such as “Create role.”
- Maintain visible focus rings using the primary/focus token. Never communicate protected, selected, denied, success, or destructive states by color alone.
- Associate validation and server errors with their fields and announce form-level outcomes through an appropriate live region. Move focus to the first invalid field or modal heading after submission.
- Confirmation dialogs trap focus, support Escape when dismissal is safe, return focus to the invoking control, and place the non-destructive action before the destructive action in keyboard order.
- Permission descriptions remain programmatically associated with their checkboxes. Reserved permissions expose both disabled state and the reason.
- Support localized text expansion and Unicode warehouse/Role names without clipping. Respect reduced-motion preferences and do not require animation to perceive state changes.

## Implementation constraints

- Extend `modules/auth/sign-up` for `warehouseName`; keep the current auth shell and submit the shared registration contract.
- Add the access route/page/components under `modules/access`, with endpoints injected through the shared RTK Query API described by the SAD.
- Add the access path to `shared/constants/routes.ts`; route visibility is advisory UI behavior, never the server authorization boundary.
- Render and request Roles/catalogue only with `ROLES:WATCH`; render and request members/assignments only with `USERS:WATCH`. Do not fetch or retain unauthorized datasets.
- Derive mutation controls from the current capability projection and independently handle server denial for every action.
- Use HeroUI directly, the semantic tokens implemented in `apps/web/src/styles/global.css`, Lucide icons already represented by the design, centralized i18n resources, and existing normalized feedback adapters. Do not introduce a parallel component or styling system.
- Preserve the protected Manager presentation, reserved transfer Permission treatment, responsive information hierarchy, and atomic-action explanations shown in the approved frames.
- The approved design establishes the visual foundation for Role administration. The specified member assignment, assigned-Role replacement, and manager-transfer dialogs must use the same shell, tokens, density, component treatments, and interaction hierarchy.

## Approved deviations

None approved for the current `… / v3` frames. Implementation must report any visible deviation for
approval.

### Resolved

- **Desktop tab treatment — closed 2026-08-09.** The handoff specified underline on desktop; the
  shipped `AccessWorkspace.tsx` rendered the segmented pill at both viewports. The owner resolved it
  in favour of the code, so § Component mapping and § Responsive behavior above now specify segmented
  everywhere and the `… / v3` frames are drawn that way. The underline intent is preserved for the
  record in `Archive / Access / Administration / Desktop / v1` and `… / v2`.

- **Role editor action row — carried into v3, closed 2026-08-09.** Approved 2026-08-07 against
  `Access / Administration / Desktop / v2` (node `zQ4S5`, Role Editor card node `fMJla`): the Role
  editor's Save/Delete actions are compact `sm`-sized buttons (32px height, `[8,14]` padding, 13px
  label) instead of the v1 fixed-width 44px Save button. Delete role uses a soft danger treatment
  (`$danger-soft` background, `$danger` text, no fixed width) and sits left of Save inside a "Role
  Editor Actions" row (8px gap), matching the button order used in code. The v3 migration rebuilds
  this row from `HeroUI/Button` (`variant="ghost"` danger + `variant="primary"`), so the deviation
  is now the design, not a deviation from it. Desktop-only: mobile never had a distinct Role editor
  screen mocked.

## Open questions

N/A.
