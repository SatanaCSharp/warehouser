---
status: approved
design_file: ../../mockups/app.pen
approved_frame: 'Shell / Access Administration / Desktop / v1'
approved_node_id: 'tCIFz'
approved_frames:
  - name: 'Shell / Access Administration / Desktop / v1'
    node_id: 'tCIFz'
  - name: 'Shell / Access Administration / Mobile / v1'
    node_id: 'b2FYL'
  - name: 'State / Member Actions Menu / Open'
    node_id: 'YozAg'
  - name: 'State / Mobile Navigation Drawer / Open'
    node_id: 'jUVaK'
  - name: 'State / Language Selector / Open'
    node_id: 'ZQ4vO'
approved_at: '2026-08-07'
approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1440x900', 'mobile 390x844']
---

# UI design handoff: change-request:web-shell-navigation

## Decision

- Selected design direction: extend the existing Access Administration page (built on the approved
  `Access / Administration` and `Users / Administration` frames) with a persistent header + sidebar
  - footer shell, replacing the members-list per-row icon buttons with a single kebab menu at every
    viewport, and adding a language selector to the header. One coherent flow, no alternative
    variants.
- Approval evidence: the user explicitly approved all five `v1` frames listed above in the design
  review conversation on 2026-08-07.
- Canonical source: `docs/mockups/app.pen`; preserve the approved frame names and node IDs above.
  Any visible revision requires a new named frame/version.
- Preview files: `previews/tCIFz.png`, `previews/b2FYL.png`, `previews/YozAg.png`,
  `previews/jUVaK.png`, `previews/ZQ4vO.png`.
- This handoff supersedes, for the authenticated shell and members-list row actions only, the
  guidance in `docs/features/users-management/design-handoff.md` and
  `docs/features/access/design-handoff.md`. Those documents are reconciled to match only after this
  change request reaches review PASS (see `change.md` §6/§8) — this file is the authoritative source
  in the meantime.

## Component mapping

| Pencil component/node                                                                                                        | Existing code primitive                                                                                                              | Adaptation allowed                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Authenticated Header` / `Authenticated Header Mobile`                                                                       | `shared/layouts/RootLayout.tsx` (authenticated branch only — `isAuthRoute === false && isAuthenticated === true`)                    | Reuse the existing `Brand` and `SignOutButton`; add the language selector and, on mobile, the drawer-toggle icon button. Auth-route and chrome-less branches unchanged.                                                                                                                          |
| `Language Selector Trigger` (desktop) / `Language Icon Button` (mobile), `State / Language Selector / Open`                  | New: e.g. `shared/layouts/LanguageSelector.tsx`, HeroUI `Dropdown`/`Menu` triggered by a `Button` (ghost/outline)                    | Desktop shows globe icon + native-name label + chevron; mobile collapses to an icon-only trigger. Menu lists "English" / "Українська" as fixed native-name labels (not translated), reflecting `i18n.resolvedLanguage`.                                                                          |
| `Sidebar`, `Nav Item / Dashboard`, `Nav Item / Access`                                                                       | New: e.g. `shared/layouts/Sidebar.tsx`                                                                                               | Exactly two items, `HeroUI Link`/`Button` styled as a nav row. Active-item tint reuses the same `#E6E5FB` swatch as the existing "Protected" chip; icon/text switch to `$primary`. Below `sm` (640px), replaced by `State / Mobile Navigation Drawer / Open`, toggled by `Drawer Toggle Button`. |
| `Drawer Toggle Button` (mobile header), `State / Mobile Navigation Drawer / Open`                                            | New: HeroUI `Button` (icon variant, `menu` icon) opening a `Modal`/off-canvas `Drawer`-style overlay reusing the `Sidebar` nav items | Opens over a dimmed scrim; closes via scrim tap, Escape, or item selection. Panel content (Dashboard/Access) is identical to the desktop sidebar's.                                                                                                                                              |
| `Footer` / `Footer Copy`                                                                                                     | New: e.g. `shared/layouts/Footer.tsx`                                                                                                | Illustrated with "© Warehouser" text for review visibility; an empty non-interactive `<footer>` landmark is an equally conforming minimum per `change.md` §9's open question. Non-interactive either way.                                                                                        |
| `Member Actions Trigger` (replaces the 3 inline icon buttons)                                                                | HeroUI `Button` (icon variant), reusing the existing `HeroUI Icon Action Button` (`heckb`) sizing, with `ellipsis-vertical`          | Same 32×32 hit target as the prior per-action buttons, at every viewport (no more desktop/mobile split). Accessible name identifies the member, e.g. "Actions for mariia.blyzniuk@warehouser.io".                                                                                                |
| `State / Member Actions Menu / Open` (`Member Actions Menu`, `Edit Email Item`, `Reset Password Item`, `Delete Member Item`) | HeroUI `Dropdown`/`Menu`, reusing the existing `Menu Item/Default` and `Menu Item/Danger` components                                 | Same three actions (Edit email / Reset password / Delete member), same handlers/dialogs as today; each item present only when its capability (`canEditEmail`/`canResetPassword`/`canDeleteMember`) is true; danger color preserved for delete.                                                   |
| `Protected Chip`, `You Chip` (unchanged rows)                                                                                | HeroUI `Chip`, matching the existing chips in `MemberList.tsx`                                                                       | No change — these rows still show only their chip, no kebab trigger renders for them.                                                                                                                                                                                                            |

## Tokens

| Purpose                      | Pencil variable                                  | Code token                                              |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| Page background              | `$bg`                                            | HeroUI `bg-background`                                  |
| Surface/card, header, footer | `$surface`                                       | HeroUI `bg-content1`                                    |
| Soft surface (inactive nav)  | `$bg` (reused)                                   | HeroUI `bg-background`                                  |
| Active nav item background   | `#E6E5FB` (matches existing Protected chip fill) | Same custom swatch already used for the Protected chip  |
| Primary action/focus/active  | `$primary`                                       | HeroUI `primary` configured in `src/styles/hero.ts`     |
| Primary foreground           | `$primary-foreground`                            | HeroUI primary foreground                               |
| Body text                    | `$text`                                          | HeroUI `text-foreground`                                |
| Muted text                   | `$muted`                                         | HeroUI `text-foreground-500`                            |
| Borders                      | `$border`                                        | HeroUI `border-divider`                                 |
| Destructive state (delete)   | `$danger`                                        | HeroUI `danger`                                         |
| Radii                        | `$radius-sm`, `$radius-md`, `$radius-lg`         | HeroUI small/medium/large radii in `src/styles/hero.ts` |
| Typography                   | `$font`                                          | Existing Inter/sans application stack                   |

## Responsive behavior

- At or above the `sm` (640px) breakpoint, the sidebar renders persistently at 240px width, to the
  left of the main content column; the header shows the full language selector (icon + label +
  chevron) and a labeled "Sign out" button.
- Below `sm`, the sidebar is replaced by a header-hosted hamburger toggle; activating it opens
  `State / Mobile Navigation Drawer / Open` as an off-canvas panel over a dimmed scrim. The header's
  language selector and sign-out controls collapse to icon-only buttons to fit the width.
- The members list's kebab trigger and menu (`State / Member Actions Menu / Open`) are identical at
  every viewport — no separate mobile variant, unlike the row identity/avatar treatment which is
  unchanged from the existing approved frames.
- The footer renders as a thin, full-width bar at the bottom of the viewport at every breakpoint.
- Do not expose the sidebar's "Access" item, the Members tab, its data, or its actions merely
  because room exists — `ROLES_WATCH`/`USERS_WATCH` and the per-action capability flags independently
  control visibility, exactly as already documented for Access and Users Management.

## States and interactions

- Sidebar/drawer: default (Dashboard inactive, Access active while on `/access`), hover, focus-visible,
  and the drawer's open/closed states. The "Access" item is absent (not disabled) when
  `ROLES_WATCH`/`USERS_WATCH` are both absent, reproducing today's loading-window behavior (absent
  while the access query is in flight).
- Kebab trigger/menu: default, hover, focus-visible, open (`State / Member Actions Menu / Open`),
  and absent entirely for protected/self rows or a row where all three capabilities are false. Escape
  closes the menu and returns focus to the trigger; Arrow Up/Down move focus among items.
- Language selector: default (shows the active language), open (`State / Language Selector / Open`,
  a checkmark marks the active option), and the language change re-render. No loading state is drawn —
  a brief fallback-text flash while a new namespace loads is acceptable per `change.md` CH-05.
- Drawer overlay: open (dimmed scrim + panel), closes via scrim tap, Escape, or selecting a nav item.
- Use HeroUI hover, pressed, focus-visible, loading, disabled, success, warning, and danger
  treatments, consistent with the existing Access/Users frames. Avoid decorative motion; state
  changes must remain understandable with reduced motion enabled.

## Accessibility

- The sidebar and drawer use a navigation landmark with a list of links; the active item exposes
  `aria-current="page"` is left to `design`/`tasks` as a visual-only detail (not pinned by an
  acceptance criterion, see `spec.md` §3).
- The footer uses a `<footer>` landmark.
- The kebab trigger requires an accessible name that includes the target member's email (e.g.
  "Actions for mariia.blyzniuk@warehouser.io"), matching the existing per-row accessible-naming
  convention documented for Users Management. Icon-only header buttons (language, sign-out, drawer
  toggle) each need their own accessible name ("Change language", "Sign out", "Open navigation").
  the language selector's collapsed value must never disagree with `i18n.resolvedLanguage`.
- Protected/self rows expose only their chip — no focusable action control renders for those rows,
  matching the existing invariant.
- The drawer traps focus while open, supports Escape to dismiss, and returns focus to the toggle
  button on close, matching this app's existing dialog-focus-return convention (see
  `DeleteMemberDialog.tsx`).
- Maintain visible focus rings using the primary/focus token. Never communicate active, protected,
  self, or destructive states by color alone — every chip, active nav item, and danger menu item
  carries a text label.
- Support localized text expansion and Unicode member/warehouse names without clipping. Respect
  reduced-motion preferences.

## Implementation constraints

- This extends `apps/web/src/shared/layouts/RootLayout.tsx`'s authenticated branch only; the
  auth-route (login/sign-up) header and the not-authenticated/non-auth-route branch are unchanged
  (`CR-RG-03`, `CR-RG-04`).
- `apps/web/src/shared/constants/routes.ts` is consumed read-only (`ROUTES.HOME`, `ROUTES.ACCESS`);
  no new routes are added.
- `apps/web/src/i18n.ts` is not modified — its 8 namespaces, `supportedLngs`, fallback, and detection
  config stay as-is. New UI strings (sidebar labels, kebab accessible names, selector's own
  accessible label, and any footer copy) join the existing `common`/`access` namespaces in both `en`
  and `uk` with full key parity (`CR-AC-11`).
- Render and request the member list only with `USERS:WATCH`; derive the kebab menu's items from the
  current capability projection (`USERS:EMAIL_UPDATE`, `USERS:PASSWORD_CHANGE`, `USERS:DELETE`)
  exactly as today, and independently handle server denial for every action.
- Use HeroUI directly, semantic tokens from `src/styles/hero.ts`, Lucide icons as shown in the
  approved frames (`layout-dashboard`, `shield-check`, `menu`, `globe`, `log-out`, `chevron-down`,
  `ellipsis-vertical`, `mail`, `key`, `trash-2`, `check`), centralized i18n resources, and existing
  normalized feedback adapters. Do not introduce a parallel component or styling system.
- Component/file structure (e.g. whether the sidebar, footer, and language selector become separate
  components) is left to `design`/`tasks`.

## Approved deviations

This change request itself is the approved deviation from the previously approved
header-only-shell and viewport-split action-affordance frames referenced by
`docs/features/users-management/design-handoff.md` and `docs/features/access/design-handoff.md`.
Those documents record "Approved deviations: N/A" and are updated to reference this change request
and its frames only as part of ship-time canonical reconciliation (`change.md` §8) — not before.

## Open questions

- [ ] Exact footer content beyond an empty, non-interactive landmark — see `change.md`/`spec.md` §9.
      Default now: an empty `<footer>` landmark is a conforming minimum; the "© Warehouser" copy
      shown in the approved frames is illustrative. — owner: Product Owner, due: implementation
