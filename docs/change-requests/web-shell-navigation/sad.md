---
status: Draft
owner: 'YuriiH'
reviewers: ['Product Owner', 'Tech Lead']
updated_at: '2026-08-07'
feature_size: 'M'
target_surfaces: ['web-frontend']
change_record: './change.md'
---

# Software Architecture Description — change-request: web-shell-navigation

## 1. Context and quality goals

The authenticated web shell (`apps/web/src/shared/layouts/RootLayout.tsx`) today renders a
header-only chrome: a brand link, one conditional inline "Access" link gated on
`ROLES_WATCH`/`USERS_WATCH`, and a sign-out button — no sidebar, no footer, no language control.
The members list (`MemberList.tsx`) renders up to three separate icon buttons per row at every
viewport. Neither can scale: the header has room for exactly one nav link, and the per-row buttons
already crowd at narrow widths while diverging from what the originally approved design intended
(desktop icons / mobile kebab). `change.md` §1–§3 (CH-01–CH-06) is the authoritative old-to-new
trace; this document places that trace inside the system architecture.

The architecture must satisfy these quality goals, in priority order:

1. Every existing action, handler, permission predicate, dialog, and route keeps behaving exactly
   as before — this is a presentation-only change with no API, contract, or authorization impact
   (CR-RG-01, CR-RG-02).
2. The auth-route (login/sign-up) shell and the chrome-less (not-authenticated, non-auth-route)
   branch render exactly as today, byte-for-byte in effect — new chrome only reaches the
   `isAuthRoute === false && isAuthenticated === true` branch (CR-RG-03, CR-RG-04).
3. The new sidebar drawer, kebab menu, and language selector are keyboard- and screen-reader
   operable to the same standard this app already holds its dialogs to: accessible names, focus
   trap/return, Escape-to-close, arrow-key menu navigation (CR-AC-03, CR-AC-09, CR-AC-10).
4. The full header control set and the members-list kebab affordance fit without horizontal
   overflow or clipping from 390px through 1440px+ (spec.md §6 NFR table).
5. No new i18next namespace, no new Redux slice, no persisted-state migration, and no telemetry —
   the change stays inside the existing centralized-i18n, RTK, and logging boundaries (CR-AC-11,
   change.md §4).

The change-request specification is Draft, pending clarify/review per the pipeline; the design
question this document must not re-litigate is visual/behavioral intent — that is already resolved.
Because this change adds/replaces user-visible web surfaces, a Pencil `design-ui` gate applies; it
was already run and approved before this SAD (`design-handoff.md` at this work-item root, approved
`2026-08-07`, five named frames covering the desktop/mobile shell, the member-actions menu, the
mobile nav drawer, and the language selector — see §9 for why this ordering is still valid). No
further `design-ui` pass is required unless a visible detail changes from what that handoff already
approved.

## 2. Constraints inherited from `docs/system`

- The repository stays a browser SPA plus NestJS modular monolith
  ([architecture map](../../system/architecture-map.md)); this change touches only `apps/web` — no
  `apps/server`, `packages/contracts`, or persisted-schema surface is in scope (spec.md §4: API and
  events, N/A).
- The bootstrap/provider chain and route tree are fixed: `main.tsx → RootLayout → matched module
page` ([frontend architecture](../../system/frontend-architecture.md) §"Runtime foundation").
  This change extends `RootLayout`'s existing branch structure; it does not add a route, a second
  root layout, or a parallel shell.
- Stable platform boundaries — root layout, route constants, and comparable cross-route chrome —
  "may start outside a feature" per `shared/layouts/` ([frontend architecture](../../system/frontend-architecture.md)
  §"Source structure"). The new `Sidebar`, `Footer`, and `LanguageSelector` components follow that
  precedent and live beside `RootLayout.tsx` in `shared/layouts/`, not inside a feature module,
  because every authenticated route consumes them, not one module.
- `apps/web/src/shared/constants/routes.ts` is consumed read-only (`ROUTES.HOME`, `ROUTES.ACCESS`);
  no new route or path literal is introduced ([frontend architecture](../../system/frontend-architecture.md)
  §"Guards and paths").
- Redux Toolkit is the only cross-module client-state owner, and a slice is added "only for state
  used across modules or needed globally across routes"
  ([frontend architecture](../../system/frontend-architecture.md) §"Redux Toolkit infrastructure").
  Drawer-open, kebab-menu-open, and language-selector-open are single-component interaction state
  and stay as local React state; the language _value_ is owned by i18next
  (`i18n.resolvedLanguage`), not duplicated into Redux, per CH-05. No new slice is added.
- `apps/web/src/i18n.ts`'s centralized boundary, 8 namespaces, and `LanguageDetector` are unchanged;
  new strings join the existing `common`/`access` namespaces with `en`/`uk` key parity
  ([localization guide](../../system/guides/adding-and-maintaining-web-localization.md), CR-AC-11).
- HeroUI plus `src/styles/hero.ts` tokens remain the sole visual system — "there is no Warehouser UI
  wrapper package... do not invent imports from one"
  ([frontend architecture](../../system/frontend-architecture.md) §"Components"). The kebab menu and
  language-selector menu use HeroUI `Dropdown`/`Menu` directly; this is the first use of that HeroUI
  primitive in the codebase, not a new component system.
- Component/rendering/local-UI-state ownership follows the existing Page/Component split
  ([frontend architecture](../../system/frontend-architecture.md) §"Layer responsibilities");
  `MemberList` keeps owning its own row/menu interaction state exactly as it owns today's per-row
  buttons.
- Structured Pino logging remains the only diagnostic mechanism; no telemetry SDK, analytics call,
  or usage tracking is added for navigation, menu, or language-selector interaction (`AGENTS.md`,
  `CLAUDE.md`, spec.md §3 non-goals).
- Any user-visible web interface change is gated by the Pencil `design-ui` workflow
  ([frontend architecture](../../system/frontend-architecture.md) §"UI design boundary"); the
  approved design controls visual/behavioral intent, this document controls code ownership and
  architecture — an approved handoff does not authorize bypassing modules, tokens, RTK boundaries,
  or accessibility conventions.

## 3. Scope and target surfaces

`target_surfaces: ['web-frontend']` — every affected source in `change.md` frontmatter is under
`apps/web` or `docs/`; no backend, worker, or contract surface changes.

In scope:

- `apps/web/src/shared/layouts/RootLayout.tsx` — amend the authenticated branch only.
- `apps/web/src/shared/layouts/Sidebar.tsx` — new.
- `apps/web/src/shared/layouts/Footer.tsx` — new.
- `apps/web/src/shared/layouts/LanguageSelector.tsx` — new.
- `apps/web/src/modules/access/components/access-administration/MemberList.tsx` — amend row
  actions only; identity stack, spacing, and row height are unchanged (CH-03).
- `apps/web/public/locales/{en,uk}/{common,access}.json` — add/rename keys; no new namespace
  (CR-AC-11).
- `docs/mockups/app.pen`, this work item's `design-handoff.md` — already updated (design-ui ran
  before this SAD; see §9).

Explicitly out of scope: `apps/web/src/i18n.ts` (consumed, not modified), `routes.ts` (read-only),
the auth-route header branch, the chrome-less branch, `EditEmailDialog`/`ResetPasswordDialog`/
`DeleteMemberDialog` internals (only their trigger affordance moves), any server module, and
`docs/features/users-management/design-handoff.md` / `docs/features/access/design-handoff.md`
(reconciled only at ship time per §8 below, unchanged by this design pass).

## 4. Solution strategy

- **Extend, don't replace, `RootLayout`'s branch structure.** The component already switches on
  `isAuthRoute` and `isAuthenticated`; this change adds sidebar/footer/language-selector markup
  only inside the existing `isAuthRoute === false && isAuthenticated === true` branch and leaves
  the other two branches untouched. This avoids introducing a second layout component or route
  wrapper, keeping one bootstrap chain per `frontend-architecture.md`.
- **New chrome lives in `shared/layouts/`, not a feature module.** `Sidebar`, `Footer`, and
  `LanguageSelector` are consumed by every authenticated route, not owned by one module — the same
  reasoning that already places `RootLayout` there. `Sidebar`'s two nav items reuse `ROUTES.HOME`
  and `ROUTES.ACCESS` and the existing `canReviewAccess` predicate verbatim (moved, not
  reimplemented) from `RootLayout` into `Sidebar`, so gating logic has exactly one owner.
- **Replace the per-row button cluster with one HeroUI `Dropdown`/`Menu` trigger, owned by
  `MemberList`.** No new component boundary is introduced for this — it is the same component
  swapping its action-rendering branch (three conditionally-rendered `Button`s → one trigger +
  conditionally-rendered `DropdownItem`s), reusing the same `canEditEmail`/`canResetPassword`/
  `canDeleteMember` props and the same `onEditEmail`/`onResetPassword`/`onDeleteMember` callbacks
  MemberList already receives. Protected/self-row handling (CH-04) is an unchanged early branch.
- **All new interaction state is component-local.** Drawer open/closed (`Sidebar`/`RootLayout`),
  per-row menu open/closed (`MemberList`), and language-selector open/closed
  (`LanguageSelector`) are `useState` inside the owning component — none crosses a module boundary
  or needs to survive a route change, so none qualifies for a Redux slice under the system's
  slice-admission rule.
- **Language value flows through i18next only.** `LanguageSelector` reads
  `i18n.resolvedLanguage` for its displayed value and calls `i18n.changeLanguage()` on selection; it
  holds no independent language state, satisfying CR-AC-07 by construction rather than by added
  synchronization logic.
- **No new persistence, API, or contract surface.** Every action the kebab menu exposes already has
  a working handler/dialog/request; this change only relocates the trigger. Server-side
  authorization, capability projection, and RTK Query cache invalidation are untouched (CR-RG-02).

## 5. Building blocks and ownership

### Retained (unchanged)

| Building block                                                 | Current behavior kept as-is                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `RootLayout.tsx` auth-route branch                             | Header-only shell, brand + opposite-route link (CR-RG-03)                              |
| `RootLayout.tsx` chrome-less (`null`) branch                   | No header/sidebar/footer (CR-RG-04)                                                    |
| `modules/access/api`, RTK Query capability projection          | Drives every gating predicate consumed by `Sidebar` and `MemberList`'s menu; untouched |
| `EditEmailDialog`, `ResetPasswordDialog`, `DeleteMemberDialog` | Same components, same props, same server calls (CR-RG-01)                              |
| `apps/web/src/i18n.ts`                                         | Namespaces, `supportedLngs`, fallback, detection/caching config unchanged              |
| `shared/constants/routes.ts`                                   | Consumed read-only; no new path                                                        |

### Modified

| Building block                                | Current → target                                                                                                                                                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RootLayout.tsx` authenticated branch         | Header-only (brand, inline "Access" link, sign-out) → header (brand, language selector, sign-out, drawer toggle below `sm`) + persistent/off-canvas sidebar + footer landmark (CH-01)                                                                       |
| `MemberList.tsx` row actions                  | Up to 3 inline icon buttons per row, every viewport → 1 kebab trigger per row opening a `Dropdown`/`Menu`, every viewport (CH-03); protected/self rows keep rendering only their `Chip`, now with no trigger at all (CH-04)                                 |
| `public/locales/{en,uk}/{common,access}.json` | `members.editEmail`/`members.resetPassword`/`members.deleteMember` interpolated a11y-name keys removed; replaced by plain-label menu-item keys + a trigger accessible-name key + new sidebar/footer/language-selector keys, same 8-namespace set (CR-AC-11) |

### Added

| Building block                        | Ownership and responsibility                                                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared/layouts/Sidebar.tsx`          | Owns the "Dashboard"/"Access" nav list, the `ROLES_WATCH ∪ USERS_WATCH` gating predicate (moved from `RootLayout`), persistent rendering at/above `sm`, and — below `sm` — the off-canvas drawer body, its scrim, focus trap, and focus-return-to-toggle behavior (CH-02, CR-AC-09). |
| `shared/layouts/Footer.tsx`           | Renders the `<footer>` landmark at every breakpoint; content beyond an empty conforming minimum is an open question (§9, spec.md §8).                                                                                                                                                |
| `shared/layouts/LanguageSelector.tsx` | Renders the header's language control; reads `i18n.resolvedLanguage`, calls `i18n.changeLanguage()`, lists fixed native-name labels "English"/"Українська", collapses to icon-only below `sm` (CH-05). No local language state.                                                      |
| `MemberList.tsx` kebab trigger + menu | Single trailing icon-only `Button` (HeroUI `Dropdown` trigger) per eligible row with a per-member accessible name, opening `DropdownItem`s gated by the same three capability props MemberList already receives (CH-03, CR-AC-10).                                                   |

`RootLayout.tsx` becomes a composition point: it decides which branch renders and passes existing
data (`canReviewAccess`'s data source, or the predicate itself) into `Sidebar`, rather than
inlining nav markup itself.

## 6. Runtime view

### 6.1 Authenticated page render (shell composition)

1. `RootLayout` evaluates `isAuthRoute` from the router pathname and `isAuthenticated` from the
   Redux store, in today's existing order (auth-route branch takes precedence regardless of
   authentication state — CR-RG-03).
2. In the `isAuthRoute === false && isAuthenticated === true` branch, `RootLayout` renders the
   header (brand, `LanguageSelector`, sign-out, and — below `sm` — a drawer-toggle button),
   `Sidebar`, `Footer`, and `Outlet`, in that composed order.
3. `Sidebar` independently evaluates the existing `currentAccess` query's
   `permissionIds.some(ROLES_WATCH | USERS_WATCH)` predicate to decide whether "Access" renders;
   "Dashboard" always renders when this branch is reached.
4. At or above `sm`, `Sidebar` renders persistently in the layout flow. Below `sm`, it renders only
   its drawer-toggle affordance in the header; activating the toggle mounts the drawer overlay
   (scrim + panel), which traps focus until closed and returns focus to the toggle on close
   (CR-AC-09).
5. The other two `RootLayout` branches (auth-route, chrome-less) render exactly as before this
   change — no `Sidebar`/`Footer`/`LanguageSelector` involvement (CR-RG-03, CR-RG-04).

### 6.2 Act on a member row via the kebab menu

1. `MemberList` renders each row exactly as today up through the protected/self branch; a
   protected or self row still renders only its `Chip`, no trigger (CH-04).
2. For an eligible row, `MemberList` renders one kebab trigger only if at least one of
   `canEditEmail`/`canResetPassword`/`canDeleteMember` is true for that row; otherwise no trigger
   renders (CR-AC-04).
3. Activating the trigger (click/tap, or Enter/Space while focused) opens a `Dropdown`/`Menu`
   listing only the items whose capability is true, as plain labels; Delete keeps its danger
   treatment.
4. Escape or an outside click/tap closes the menu and returns focus to the trigger; Arrow Up/Down
   move focus among items (CR-AC-03).
5. Selecting an item closes the menu immediately and invokes the same
   `onEditEmail`/`onResetPassword`/`onDeleteMember` callback `MemberList` already receives, which
   opens the corresponding existing dialog (`EditEmailDialog`/`ResetPasswordDialog`/
   `DeleteMemberDialog`) unchanged (CR-RG-01). When that dialog is dismissed, focus returns to the
   row's kebab trigger.
6. The dialog's submit path is unchanged: it calls the same RTK Query mutation, the server enforces
   authorization exactly as before (CR-RG-02), and the same cache-invalidation tags refresh the
   list.

### 6.3 Switch the interface language

1. `LanguageSelector` reads `i18n.resolvedLanguage` on every render — its displayed value is never
   independent local state.
2. Opening the selector lists "English" and "Українська" as fixed, non-translated native-name
   labels (CR-AC-06).
3. Selecting an option calls `i18n.changeLanguage(lng)`. `react-i18next` triggers a re-render of
   every consuming component; any namespace not yet loaded for the target language is fetched by
   the existing `i18next-http-backend`, producing a brief fallback-text flash, not a full reload
   (CR-AC-07).
4. `i18next-browser-languagedetector`'s existing (implicit-default) caching persists the choice
   across reload without any new persistence code.

## 7. Data and interface impact

- **API/contracts:** none. No endpoint, `packages/contracts` schema, or event changes (spec.md §4).
- **Persisted data:** none. Language choice continues through the detector's existing
  cache/detection behavior, not a new store (spec.md §4, §3 non-goals).
- **Client state shape:** no new Redux slice or `RootState` field; no changes to any RTK Query
  endpoint or cache tag.
- **Locale resources:** key-level changes only, within the existing `common`/`access` namespaces —
  `members.editEmail`/`members.resetPassword`/`members.deleteMember` (interpolated a11y-name keys)
  are removed and replaced by plain menu-item labels, a trigger accessible-name key, and new
  sidebar/footer/language-selector keys, added with full `en`/`uk` parity in both files (CR-AC-11).
  No namespace is added to `apps/web/src/i18n.ts`'s `ns` list.

## 8. Cross-cutting concerns

### Accessibility

- Sidebar/drawer nav uses a navigation landmark with a list of links; active-item `aria-current`
  treatment is a visual-only detail left to implementation, not pinned by an acceptance criterion
  (spec.md §3).
- The kebab trigger's accessible name must identify the target member (e.g. "Actions for
  `{email}`"), consistent with this app's existing per-row accessible-naming convention
  (CR-AC-10).
- The drawer traps focus while open and returns focus to the toggle button on close, matching this
  app's existing dialog-focus-return convention (same pattern as `DeleteMemberDialog.tsx`).
- Icon-only header controls below `sm` (language selector, drawer toggle) each carry their own
  accessible name; none communicates state by color alone (danger menu item keeps its label, not
  just its color).

### Security and privacy

- No new data exposure: kebab-menu item visibility mirrors the same capability projection the
  buttons already used; hide-not-disable semantics are preserved (CR-AC-04).
- Server-side authorization is untouched; client-side visibility remains advisory only, and a
  denied action still surfaces existing error handling (CR-RG-02).

### Responsive layout

- Sidebar: fixed 240px persistent width at/above `sm`; fully drawer-collapsed below `sm` so it
  never reduces content width at 390px (spec.md §6 NFR table).
- Header: at 390px the full control set (drawer toggle, brand, language selector, sign-out) must
  fit without overflow — achieved by collapsing the language selector and sign-out control to
  icon-only presentation below `sm`.
- Kebab trigger: ≥32×32px hit target at every viewport, matching today's per-action icon buttons;
  row `min-h-[72px]` floor is unchanged (may grow, never shrinks).

### Internationalization

- Every new string added by this change (sidebar labels, kebab trigger/menu accessible names,
  selector's own accessible label, footer copy if any) is added to `common`/`access` in both `en`
  and `uk` with matching key shape, per the existing localization guide — no ad hoc/inline copy.

### Testing impact

- `MemberList.spec.tsx` and any `RootLayout` shell tests need new assertions for the kebab
  menu/sidebar/language-selector markup, replacing assertions on the three separate icon buttons.
- `AccessAdministration.spec.tsx` may need updated selectors if it queries row action buttons
  directly.
- Localization tests must confirm the removed per-action keys are gone and the new keys have full
  `en`/`uk` parity across all namespaces, per the localization guide's verification checklist.

## 9. ADR index

None. Every structural decision here is dictated by an existing system rule: extending
`RootLayout`'s branch structure and placing shared chrome in `shared/layouts/` follow
`frontend-architecture.md`'s documented precedent; using HeroUI `Dropdown`/`Menu` follows the
"HeroUI directly, no wrapper" rule; keeping all new interaction state local follows the slice-
admission rule; and no API/contract/persistence surface changes. None of these choices are costly
to reverse, none spans multiple applications or operational owners, and none leaves two
legitimate options after applying the inherited constraints — the blast-radius gate is not met.

The one out-of-band process fact worth recording here (not an architecture decision): `design-ui`'s
approval for this change (`design-handoff.md`, approved 2026-08-07) was produced before this SAD
existed, driven directly by `change.md`'s already-user-confirmed override map rather than by a
prior SAD draft. That is consistent with the change-request pipeline — `change.md` §3/§6 already
carried enough resolved detail (exact building blocks, breakpoints, component mapping) for
`design-ui` to run — and this SAD's job is to place that already-approved design inside the system
architecture, not to re-derive it. No visible detail in `design-handoff.md` is contradicted by any
constraint in §2; if a later step needs a visible change beyond what's approved, that requires a
new `design-ui` pass before implementation, same as any feature.

## 10. Verification strategy

| Level             | Required evidence                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Component unit    | `Sidebar` renders "Dashboard" always and "Access" only under the `ROLES_WATCH ∪ USERS_WATCH` predicate, including the loading-window/falsy case; drawer open/close, scrim dismiss, Escape, item-selection dismiss, and focus return. |
| Component unit    | `MemberList` kebab trigger renders only when ≥1 capability is true; menu lists only true-capability items as plain labels; Escape/outside-click/Arrow Up-Down/Enter-Space behavior; protected/self rows render no trigger.           |
| Component unit    | `LanguageSelector` displays `i18n.resolvedLanguage` (including region-variant → base-language resolution), calls `changeLanguage()` on selection, never holds independent state.                                                     |
| Shell integration | `RootLayout`'s three branches (auth-route, authenticated, chrome-less) each render their correct chrome and nothing else, at both `<sm` and `≥sm` viewport widths (CR-RG-03, CR-RG-04, CR-AC-01).                                    |
| Regression        | Selecting each kebab menu item still invokes the existing dialog/handler/request unchanged (CR-RG-01); a denied server response still surfaces existing error handling (CR-RG-02).                                                   |
| Localization      | `en`/`uk` key-set parity across all 8 namespaces after key removal/addition; no orphaned or missing key (CR-AC-11).                                                                                                                  |
| Manual/responsive | 390px: header control fit, kebab hit-target ≥32×32px, no menu viewport overflow, row height floor. 640px/1440px: persistent 240px sidebar, unconstrained content column.                                                             |
| Accessibility     | Focus trap and return for the drawer; Escape/Arrow key behavior for both menus; accessible names present on every icon-only control.                                                                                                 |

Trace these checks to every `CR-AC-*`/`CR-RG-*` in `spec.md` during `plan-tests`. Run the normal
web gate — `pnpm --filter @warehouser/web lint`, `pnpm --filter @warehouser/web test`,
`pnpm --filter @warehouser/web build` — after focused suites.

## 11. Risks and open questions

| Risk or question                                                                                                                                                                                                                               | Treatment / owner                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Footer content beyond an empty landmark is undecided (spec.md §8).                                                                                                                                                                             | Ship the empty, non-interactive `<footer>` landmark as the conforming default; revisit only if Product Owner specifies content before implementation. Product Owner.                                              |
| First use of HeroUI `Dropdown`/`Menu` in this codebase — behavior (focus management, keyboard nav) must be verified against CR-AC-03's exact requirements rather than assumed from HeroUI defaults.                                            | Component-unit-test the specific Escape/outside-click/Arrow-key/focus-return behavior instead of trusting default HeroUI behavior matches. Frontend Lead.                                                         |
| Moving the `ROLES_WATCH ∪ USERS_WATCH` predicate from `RootLayout` into `Sidebar` must reproduce identical falsy/loading-window behavior (no skeleton), or the sidebar's "Access" item could flicker differently than today's header link did. | Cover the predicate's loading-window state with the same test today's header-link behavior would need; do not add new loading UI (CR-AC-02).                                                                      |
| `docs/features/users-management/design-handoff.md` and `docs/features/access/design-handoff.md` still describe the pre-change shell/actions until ship-time reconciliation (change.md §8).                                                     | Do not treat those two documents as current guidance for this change's surfaces until reconciliation lands; this SAD and `design-handoff.md` at this work-item root are authoritative in the meantime. Tech Lead. |
| Tasks/implementation must not reintroduce the removed per-action interpolated locale keys or leave them orphaned.                                                                                                                              | `tasks` should include an explicit locale-key-removal step verified by the localization test suite, not just additions (CR-AC-11). Frontend Lead.                                                                 |
