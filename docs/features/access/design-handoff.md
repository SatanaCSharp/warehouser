---
status: approved
design_file: ../../mockups/app.pen
approved_frame: 'Access / Administration / Desktop / v1'
approved_node_id: 'W48Rk'
approved_frames:
  - name: 'Access / Registration / Desktop / v1'
    node_id: 'f4Icg'
  - name: 'Access / Registration / Mobile / v1'
    node_id: 'jtBOB'
  - name: 'Access / Administration / Desktop / v1'
    node_id: 'W48Rk'
  - name: 'Access / Administration / Mobile / v1'
    node_id: 'G0Yvp'
approved_at: '2026-08-03'
approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1440x900', 'mobile 390x844']
---

# UI design handoff: access

## Decision

- Selected design direction: focused warehouse access workspace built on the existing Warehouser auth shell and HeroUI visual system.
- Approval evidence: the user explicitly approved all four `v1` frames in the design review conversation on 2026-08-03.
- Canonical source: `docs/mockups/app.pen`; preserve the approved frame names and node IDs above. Any visible revision requires a new named frame/version.
- Preview files: `previews/f4Icg.png`, `previews/jtBOB.png`, `previews/W48Rk.png`, and `previews/G0Yvp.png`.

## Component mapping

| Pencil component/node            | Existing code primitive                                            | Adaptation allowed                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal/Mobile Header            | `shared/layouts/RootLayout.tsx`; HeroUI `Link`                     | Extend the authenticated shell with warehouse/access navigation while preserving current brand, height, border, and responsive behavior. |
| Auth Text Field / Warehouse name | HeroUI `Input` in `modules/auth/sign-up/components/SignUpForm.tsx` | Use the shared contract and visible label/help/error slots; do not duplicate server validation rules.                                    |
| Primary actions                  | HeroUI `Button`                                                    | Labels may localize; size, primary emphasis, loading behavior, and focus treatment must remain equivalent.                               |
| Access tabs                      | HeroUI `Tabs`                                                      | Desktop uses an underline treatment; mobile uses a compact segmented treatment. Preserve the Roles/Members/Permissions order.            |
| Role cards and editor            | HeroUI `Card`, `Input`, `Checkbox`, `Chip`, `Button`               | Selected, protected, disabled, and reserved states must remain visually distinct.                                                        |
| Role search                      | HeroUI `Input` with Lucide `search` icon                           | Filtering may be local or server-backed, but the visible field and empty result behavior remain the same.                                |
| Permission rows                  | HeroUI `Checkbox` plus semantic text                               | The reserved manager-transfer Permission is disabled and explanatory; it must never look selectable for custom Roles.                    |
| Status and explanatory callouts  | HeroUI `Card`/`Chip` using semantic colors                         | Copy may localize; meaning, icon, and prominence must remain equivalent.                                                                 |
| Destructive confirmations        | HeroUI `Modal`/`AlertDialog`, `Select`, and danger `Button`        | Assigned-Role deletion requires replacement selection; manager transfer requires recipient and former-manager replacement Role.          |

## Tokens

| Purpose              | Pencil variable                          | Code token                                              |
| -------------------- | ---------------------------------------- | ------------------------------------------------------- |
| Page background      | `$bg` / `$background/background`         | HeroUI `bg-background`                                  |
| Surface/card         | `$surface` / `$surface/surface`          | HeroUI `bg-content1`                                    |
| Soft surface         | `$surface-soft` / `$surface/secondary`   | HeroUI `bg-content2`                                    |
| Primary action/focus | `$primary`                               | HeroUI `primary` configured in `src/styles/hero.ts`     |
| Primary foreground   | `$primary-foreground`                    | HeroUI primary foreground                               |
| Body text            | `$text` / `$foreground/foreground`       | HeroUI `text-foreground`                                |
| Muted text           | `$muted` / `$foreground/muted`           | HeroUI `text-foreground-500`                            |
| Borders              | `$border` / `$separator/separator`       | HeroUI `border-divider`                                 |
| Destructive state    | `$danger` / `$danger/danger`             | HeroUI `danger`                                         |
| Success state        | `$success` / `$success/success`          | HeroUI `success`                                        |
| Radii                | `$radius-sm`, `$radius-md`, `$radius-lg` | HeroUI small/medium/large radii in `src/styles/hero.ts` |
| Typography           | `$font` / `$typography/font-sans`        | Existing Inter/sans application stack                   |

## Responsive behavior

- At desktop widths, keep the page heading and primary action on one row, show Roles as a left list and the selected Role editor as the larger right pane, and use the authenticated application shell.
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
- Use HeroUI directly, semantic tokens from `src/styles/hero.ts`, Lucide icons already represented by the design, centralized i18n resources, and existing normalized feedback adapters. Do not introduce a parallel component or styling system.
- Preserve the protected Manager presentation, reserved transfer Permission treatment, responsive information hierarchy, and atomic-action explanations shown in the approved frames.
- The approved design establishes the visual foundation for Role administration. The specified member assignment, assigned-Role replacement, and manager-transfer dialogs must use the same shell, tokens, density, component treatments, and interaction hierarchy.

## Approved deviations

N/A. Implementation must report any visible deviation for approval.

## Open questions

N/A.
