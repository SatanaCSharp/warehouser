---
status: approved
design_file: ../../mockups/app.pen
approved_frame: 'Users / Administration / Desktop / v1'
approved_node_id: 'e4e0H'
approved_frames:
  - name: 'Users / Administration / Desktop / v1'
    node_id: 'e4e0H'
  - name: 'Users / Create Member / Desktop / v1'
    node_id: 'hIpfH'
  - name: 'Users / Administration / Mobile / v1'
    node_id: 'GjSFa'
  - name: 'Users / Create Member / Mobile / v1'
    node_id: 'bzV6e'
approved_at: '2026-08-06'
approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1440x900', 'mobile 390x844']
---

# UI design handoff: users-management

## Decision

- Selected design direction: the Members tab of the existing Access Administration page — reserved
  as a tab by the Access feature but never built out — populated with a full member lifecycle
  workspace (list, create, and per-member actions), built on the same Warehouser HeroUI shell and
  visual system as the approved Access design.
- Approval evidence: the user explicitly approved all four `v1` frames in the design review
  conversation on 2026-08-06.
- Canonical source: `docs/mockups/app.pen`; preserve the approved frame names and node IDs above.
  Any visible revision requires a new named frame/version.
- Preview files: `previews/e4e0H.png`, `previews/hIpfH.png`, `previews/GjSFa.png`, and
  `previews/bzV6e.png`.

## Component mapping

| Pencil component/node                                         | Existing code primitive                                                                                                         | Adaptation allowed                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal/Mobile Header, Page Heading, HeroUI Tabs              | `shared/layouts/RootLayout.tsx`; `modules/access/components/access-administration/AccessAdministration.tsx`                     | Reuse the same page shell, heading, and tab row already approved for Access; the Members tab must become functionally wired (see Implementation constraints).                |
| `HeroUI Search`                                               | `modules/access/components/access-administration/RoleList.tsx` search `Input`                                                   | Same visible field, icon, and placeholder pattern; filtering may be local or server-backed.                                                                                  |
| `HeroUI Card / Member Row`, `HeroUI Card / Member Row Mobile` | New: e.g. `modules/access/components/access-administration/MemberList.tsx` / `MemberRow.tsx`, replacing `MemberRoleActions.tsx` | Avatar-initials circle, email, and role text are content; row structure, spacing, and the 72px (68px mobile) height must remain equivalent.                                  |
| `HeroUI Icon Action Button` (mail / key / trash-2)            | HeroUI `Button` (icon variant)                                                                                                  | Three per-row actions — edit email, reset password, delete — map 1:1 to AC-04/06/08. Icons and danger color for delete must remain equivalent.                               |
| `Protected Chip`, `You Chip`                                  | HeroUI `Chip`, matching `jb0SL` "Protected" chip already used in `RoleList.tsx`                                                 | The Warehouse Manager row shows "Protected" (AC-13/14) and the acting member's own row shows "You" (AC-18); both replace the action buttons, never show them alongside them. |
| Mobile trailing `ellipsis-vertical` icon                      | HeroUI `Dropdown`/`Menu` triggered by an icon `Button`                                                                          | Opens the same three actions as the desktop icon group; menu item labels and danger styling for delete must remain equivalent.                                               |
| `Create Member Modal` / `Create Member Sheet`                 | HeroUI `Modal` (desktop) / bottom-sheet-style `Modal` (mobile), following the pattern in `RoleDialog.tsx`/`DeletionDialog.tsx`  | Same shell for the not-yet-drawn edit-email, reset-password, and delete-confirmation dialogs — see States and interactions.                                                  |
| Email / Initial password fields                               | HeroUI `Input`, matching `IplNB` "Auth Text Field" already used in `SignUpForm.tsx`                                             | Password field must expose the same visibility-toggle affordance shown in the design.                                                                                        |
| Role field                                                    | HeroUI `Select`                                                                                                                 | Options are the actor's own Warehouse's custom Roles whose Permissions do not exceed the actor's own (AC-16); the reserved Warehouse Manager Role is never offered (AC-20).  |
| Primary/secondary buttons                                     | HeroUI `Button`, matching `L80Scv` "Primary Button" already used across Access                                                  | Labels may localize; size, primary emphasis, loading behavior, and focus treatment must remain equivalent.                                                                   |

## Tokens

| Purpose                    | Pencil variable                          | Code token                                              |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| Page background            | `$bg`                                    | HeroUI `bg-background`                                  |
| Surface/card               | `$surface`                               | HeroUI `bg-content1`                                    |
| Soft surface (avatar bg)   | `$surface-soft`                          | HeroUI `bg-content2`                                    |
| Primary action/focus       | `$primary`                               | HeroUI `primary` configured in `src/styles/hero.ts`     |
| Primary foreground         | `$primary-foreground`                    | HeroUI primary foreground                               |
| Body text                  | `$text`                                  | HeroUI `text-foreground`                                |
| Muted text                 | `$muted`                                 | HeroUI `text-foreground-500`                            |
| Field background           | `$field`                                 | HeroUI input background                                 |
| Borders                    | `$border`                                | HeroUI `border-divider`                                 |
| Destructive state (delete) | `$danger`                                | HeroUI `danger`                                         |
| Radii                      | `$radius-sm`, `$radius-md`, `$radius-lg` | HeroUI small/medium/large radii in `src/styles/hero.ts` |
| Typography                 | `$font`                                  | Existing Inter/sans application stack                   |

## Responsive behavior

- At desktop widths, keep the page heading and "Create member" primary action on one row, and show
  the Members workspace as a single full-width list of row cards (no split pane — unlike Roles,
  members have no secondary editor pane to show alongside the list).
- Between desktop and mobile, member rows collapse to the compact mobile card treatment already
  established for Roles: a 38px icon/avatar circle, a two-line identity stack, and a single trailing
  affordance. Desktop shows three inline icon actions per row; mobile collapses them into one
  `ellipsis-vertical` trigger that opens the same three actions in a menu, since three icon buttons
  do not fit legibly at 390px.
- At the 390px mobile viewport, retain the same information priority as desktop: page identity,
  primary create action (compact icon button, matching the existing Roles "+" treatment), tab
  navigation, search, then records.
- The Create Member flow opens as a centered modal on desktop and a bottom sheet on mobile, matching
  the pattern already documented for Access's Role/Assignment/Deletion/Transfer dialogs. The
  not-yet-drawn edit-email, reset-password, and delete-confirmation dialogs must follow the same
  per-viewport shell.
- Do not expose the Members tab, its data, or its actions merely because room exists. `USERS:WATCH`
  independently controls whether the tab, its requests, and its retained data are available, exactly
  as already documented for Access.

## States and interactions

- Member list: loading skeleton, empty state, search-empty state, protected Warehouse Manager row
  (chip, no actions — AC-13/14), acting member's own row (chip, no actions — AC-18), and read-denied
  state when `USERS:WATCH` is absent.
- Create member: default, field focus, inline email/password/role validation, submitting/loading,
  success confirmation, and normalized server error (invalid email/password per AC-02, duplicate
  email per AC-05, Role exceeding the actor's own Permissions per AC-16, attempted Warehouse Manager
  Role selection blocked per AC-20 by never listing it as an option).
- Edit email / reset password (not separately drawn — reuse the Create Member modal/sheet shell with
  a single field): default, field focus, submitting, success confirmation ("existing sessions stay
  active" copy for email per AC-04; "sessions end" copy for password per AC-06), and normalized
  server error, including the protected-Manager-target block (AC-14) and the
  actor's-Permissions-exceeded-by-target block (AC-19).
- Delete member (not separately drawn — reuse the same `AlertDialog`/`Modal` danger-confirmation
  pattern as Access's `DeletionDialog.tsx`): confirmation, submitting, success confirmation, and
  blocked states for self-deletion (AC-11) and protected-Manager-target (AC-13).
- Per-row actions and the "Create member" button disappear when the refreshed current-access
  projection removes the matching Permission (`USERS:CREATE`, `USERS:EMAIL_UPDATE`,
  `USERS:PASSWORD_CHANGE`, `USERS:DELETE`). A denial caused by a race presents a safe explanation and
  refreshes visible capability state, matching Access's existing behavior.
- Use HeroUI hover, pressed, focus-visible, loading, disabled, success, warning, and danger
  treatments. Avoid decorative motion; state changes must remain understandable with reduced motion
  enabled.

## Accessibility

- Use a semantic list (or table) for the member list, labelled form controls for every dialog field,
  and native button semantics for every action, matching the conventions already used in
  `RoleList.tsx`/`RoleDialog.tsx`.
- Every icon-only action (edit email, reset password, delete, and the mobile `ellipsis-vertical`
  trigger) requires an accessible name that includes the target member's email, e.g. "Reset password
  for mariia.blyzniuk@warehouser.io" — icons alone never convey the action.
- Preserve a logical keyboard order following the visual hierarchy. Protected/self rows expose their
  chip as the only interactive-adjacent content — no focusable action controls render for those rows.
- Maintain visible focus rings using the primary/focus token. Never communicate protected, self,
  denied, success, or destructive states by color alone — every chip and icon carries a text label or
  accessible name.
- Associate validation and server errors with their fields and announce form-level outcomes through
  an appropriate live region. Move focus to the first invalid field or modal heading after
  submission.
- The delete-confirmation dialog traps focus, supports Escape when dismissal is safe, returns focus
  to the invoking row's action, and places the non-destructive action before the destructive action
  in keyboard order, matching `DeletionDialog.tsx`.
- Support localized text expansion and Unicode email/role names without clipping. Respect
  reduced-motion preferences.

## Implementation constraints

- This is the Members tab of the existing `/access` route — it does not introduce a new route.
  Implementation should extend `modules/access/components/access-administration/`, replacing the
  current sr-only `MemberRoleActions.tsx` placeholder with the new Members panel, rather than
  creating a separate top-level module.
- The Roles/Members/Permissions tab row in `AccessAdministration.tsx` is currently a static visual
  element with no real tab-switching logic — implementation must wire it to an actual HeroUI `Tabs`
  (or equivalent state) that shows the Roles workspace, the new Members workspace, or the Permissions
  catalogue exclusively, matching the approved frames' single-panel-per-tab behavior.
- Render and request the member list only with `USERS:WATCH`; derive every per-row action and the
  "Create member" button from the current capability projection (`USERS:CREATE`,
  `USERS:EMAIL_UPDATE`, `USERS:PASSWORD_CHANGE`, `USERS:DELETE`) and independently handle server
  denial for every action, exactly as Access already does for Roles.
- Add endpoints through the shared RTK Query API slice described by the SAD; do not fetch or retain
  unauthorized datasets.
- Use HeroUI directly, semantic tokens from `src/styles/hero.ts`, Lucide icons (`mail`, `key`,
  `trash-2`, `ellipsis-vertical`, `lock`, `eye`, `chevron-down` as shown in the approved frames),
  centralized i18n resources under an `access` (or feature-appropriate) namespace, and the existing
  normalized feedback adapters. Do not introduce a parallel component or styling system.
- Preserve the protected-Manager presentation, self-row presentation, responsive information
  hierarchy, and atomic-action explanations shown in the approved frames.
- The approved design establishes the visual foundation for member administration. The edit-email,
  reset-password, and delete-confirmation dialogs — specified in the spec but not separately drawn —
  must use the same shell, tokens, density, component treatments, and interaction hierarchy as the
  Create Member modal/sheet and Access's existing `RoleDialog.tsx`/`DeletionDialog.tsx`.

## Approved deviations

N/A. Implementation must report any visible deviation for approval.

## Open questions

N/A.
