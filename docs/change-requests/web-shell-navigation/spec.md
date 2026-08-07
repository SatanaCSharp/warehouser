---
kind: change-request
status: Draft
owner: 'YuriiH'
reviewers: ['Tech Lead']
updated_at: '2026-08-07'
feature_size: 'M'
change_record: './change.md'
---

# Change-request specification — web-shell-navigation

## 1. Context

The Warehouser web app's authenticated shell is currently a single header (brand, one conditional
"Access" link, sign-out) with no sidebar and no footer. The members list
(`apps/web/src/modules/access/components/access-administration/MemberList.tsx`) renders up to
three separate icon buttons per row for edit email / reset password / delete member. The app ships
English and Ukrainian translations (`apps/web/src/i18n.ts`) but offers no visible way to switch
between them.

This change request makes authoritative: a persistent header + sidebar + footer layout with
"Dashboard" and "Access" navigation in the sidebar; a single 3-dot ("kebab") action menu per member
row, applied at all viewports, replacing the separate icon buttons; and a header language selector
for English/Ukrainian. See `change.md` §3 for the full old-to-new override map (CH-01–CH-06).

## 2. Goals

- An authenticated user can navigate between "Dashboard" and "Access" from a persistent sidebar,
  without relying on a single inline header link.
- An authorized user can act on a member row (edit email / reset password / delete member) through
  one trailing 3-dot menu, consistently at any viewport width.
- A user can switch the app's display language between English and Ukrainian from the header, and
  the choice is reflected immediately across the UI.

## 3. Non-goals

- No new sidebar destinations beyond "Dashboard" and "Access" (CH-02); further navigation items are
  out of scope and would need a separate change or feature.
- No active-route visual indicator (highlight, `aria-current`) is pinned by an acceptance
  criterion; that presentation detail is resolved during `design-ui`.
- No change to member-row markup outside the action affordance — identity stack, spacing, and row
  height are unchanged; this change only replaces the action buttons with a kebab trigger.
- No change to member-action authorization logic, capability projection, or server-side permission
  enforcement (CH-03, CH-04) — only the trigger affordance changes.
- No language selector on the auth-route shell (login/sign-up) or on the not-authenticated /
  non-auth-route branch; this change applies to the authenticated shell only (CR-RG-03, CR-RG-04).
- No new persisted language preference (e.g., account-level locale field); language selection
  continues to rely on `i18next-browser-languagedetector`'s implicit default caching behavior
  (CH-05) — `apps/web/src/i18n.ts` configures no explicit `detection` block — which this change
  relies on for persistence but does not reconfigure.
- No new languages beyond English and Ukrainian; both are already fully supported by the existing
  i18next configuration, and no new i18next namespace is introduced — new strings join the existing
  `common`/`access` namespaces.
- No edits to `apps/web/src/i18n.ts` — its namespaces, `supportedLngs`, and fallback stay as
  configured; `i18next-browser-languagedetector` is used with no explicit `detection` block (its
  implicit defaults, including `localStorage` caching, apply). This change relies on those
  defaults for CR-AC-07's reload-persistence and does not add a `detection` block, even as a
  fallback if the defaults prove insufficient — that would be a follow-up change, not this one.
- No telemetry is added for navigation, menu, or language-selector usage.
- Component/file structure (e.g. whether the sidebar, footer, and selector become separate
  components) is an implementation decision left to `design`/`tasks`, not pinned by this spec.
- Producing the new named `design-ui` frames and reconciling `design-handoff.md` prose are separate
  pipeline steps (see change.md §6, §8); this spec's CR-AC-08 only requires the frames exist and be
  referenced by the reconciled docs after PASS, not that this change-request stage edit those docs
  itself.

## 4. Changed user stories

### CR-US-01: Navigate via a persistent sidebar

**As an** authenticated user
**I want** a persistent sidebar with "Dashboard" and "Access" entries
**So that** I can move between authenticated areas without depending on a single inline header link

### CR-US-02: Act on a member through one menu

**As a** user authorized to manage members
**I want** a single 3-dot menu at the end of each member row listing the actions I'm allowed to
perform
**So that** I can act on a member without the row being crowded by separate icon buttons at any
screen width

### CR-US-03: Choose the interface language

**As a** user
**I want** to explicitly pick English or Ukrainian from the header
**So that** I see the app in my preferred language regardless of what the browser detects

## 5. Acceptance criteria

### CR-AC-01 (CR-US-01, CH-01) — shell structure

**Given** a user who is authenticated and on a route that is not the login or sign-up route
(`isAuthRoute === false && isAuthenticated === true`, matching today's `RootLayout.tsx` branch
order — the auth-route branch takes precedence regardless of authentication state, see CR-RG-03)
**When** the page renders
**Then** the layout shows a header, a sidebar, and a footer, arranged with the sidebar to the left
of the main content column at or above `sm` and the footer as a full-width bar at the bottom of the
viewport at every breakpoint; the header retains its existing brand link and sign-out control and
adds the language selector, with the sidebar's drawer-toggle control present in the header on
narrow viewports (CR-AC-09); the login/sign-up route keeps the existing header-only shell unchanged
(CR-RG-03) regardless of authentication state

### CR-AC-02 (CR-US-01, CH-02) — sidebar navigation, gating, and responsive behavior

**Given** an authenticated user
**When** the sidebar renders
**Then** it shows exactly "Dashboard" (linking to the existing home page) always, and "Access"
(linking to the existing access/roles/permissions/members area) only when the user has
`ROLES_WATCH` or `USERS_WATCH` — reproducing today's `currentAccess.data?.permissionIds.some(...)`
predicate exactly, including its falsy/loading-window behavior (no skeleton state added); and the
header no longer renders a separate inline "Access" link

### CR-AC-09 (CR-US-01, CH-02) — sidebar collapses on narrow viewports

**Given** an authenticated user
**When** the viewport is narrower than the app's existing `sm` (640px) breakpoint
**Then** the sidebar is not persistently visible; it collapses to an off-canvas drawer opened by a
header-hosted toggle control, and at or above `sm` it renders persistently. The drawer opens over a
dimmed scrim, traps focus while open, closes via scrim tap, Escape, or selecting a nav item, and
returns focus to the toggle control on close, matching this app's existing dialog-focus-return
convention

### CR-AC-03 (CR-US-02, CH-03) — kebab trigger and menu contents

**Given** a member row a user is authorized to act on
**When** the user activates the row's trailing 3-dot trigger (click/tap, or Enter/Space when
focused)
**Then** a menu opens, in the same dropdown presentation at every viewport width, listing only the
actions the user's capabilities allow as plain labels (Edit email / Reset password / Delete
member; Delete member retains its existing danger color/treatment, the other two items carry no
color distinction); Escape or a click/tap outside the menu closes it and returns focus to the
trigger; Arrow Up/Down move focus among menu items; selecting an item closes the menu immediately
and opens the corresponding dialog, and once that dialog is dismissed, focus returns to the row's
kebab trigger

### CR-AC-04 (CR-US-02, CH-03) — capability-driven item and trigger visibility

**Given** a member row where the acting user lacks one of `canEditEmail`, `canResetPassword`, or
`canDeleteMember`
**When** the kebab menu opens for that row
**Then** the corresponding action is absent from the menu (hidden, not disabled); it is not
re-enabled by any client-side state, only by the underlying capability becoming true; and if the
row is non-protected, non-self, and all three capabilities are false, no kebab trigger renders for
that row either (no dead control)

### CR-AC-10 (CR-US-02, CH-03) — trigger accessible name

**Given** a member row's kebab trigger
**When** it renders
**Then** its accessible name identifies the target member (e.g. "Actions for
mariia.blyzniuk@warehouser.io"), consistent with this app's existing per-row accessible-naming
convention

### CR-AC-05 (CR-US-02, CH-04) — protected/self rows stay action-free

**Given** a member row that is protected (warehouse_manager role) or is the acting user's own row
**When** the members list renders
**Then** the row shows only its Chip ("Protected" or "You"); no kebab trigger or any other
focusable action control renders for that row

### CR-AC-06 (CR-US-03, CH-05) — language selector presence, options, and scope

**Given** an authenticated user viewing the app
**When** they open the header's language selector
**Then** it lists exactly two options, shown by fixed native-name labels — "English" and
"Українська" — identical regardless of the currently active language; the selector does not appear
on the auth-route (login/sign-up) shell or the not-authenticated/non-auth-route branch

### CR-AC-07 (CR-US-03, CH-05) — language selector reflects and drives i18next state

**Given** the app's current resolved i18next language (`i18n.resolvedLanguage`) is L
**When** the page renders
**Then** the selector's displayed value is L (never a value independent of i18next state, and a
region-variant detected language resolves to its base language for display), shown as the
native-name label from CR-AC-06 alongside a globe icon at or above the `sm` breakpoint, collapsing
to an icon-only trigger below `sm` with the value conveyed only through the accessible name; and
**when** the user picks a different language
**then** `i18n.changeLanguage()` is called, the whole UI re-renders in the chosen language (a brief
fallback/loading flash while a newly-needed namespace loads is acceptable; no full page reload is
required), and the choice persists across a subsequent reload via the detector's existing caching

### CR-AC-08 (CH-06) — design artifacts reconciled

**Given** this change request has passed code review (PASS)
**When** the engineer running `ship` performs the ship-time canonical reconciliation step
(`change.md` §6 step 6, §8) — a post-PASS action, not a blocking condition of the review PASS
itself
**Then** `docs/features/users-management/design-handoff.md` and
`docs/features/access/design-handoff.md` are both updated to describe the new shell, navigation,
kebab menu, and language selector; both update their `approved_frame`/`approved_node_id` reference
to the new frames added to `docs/mockups/app.pen` during `design-ui` (at minimum one frame for the
authenticated shell and one for the members-list kebab menu); and both replace their "Approved
deviations: N/A" line with a record of this change request's explicit approval, backlinked to
`docs/change-requests/web-shell-navigation/change.md`

### CR-AC-11 (CR-US-03, CH-05) — no new i18n namespace

**Given** new UI strings introduced by this change (sidebar labels, kebab trigger/menu accessible
names, selector's own accessible label, and any footer copy if content is added per §9's open
question)
**When** they are added to the locale resources
**Then** they join the existing `common`/`access` namespaces in both `en` and `uk` with full key
parity; no new namespace is added to `apps/web/src/i18n.ts`; the three now-obsolete per-action
interpolated keys (`members.editEmail`, `members.resetPassword`, `members.deleteMember`) are
removed from all four locale files (`en`/`uk` × `common`/`access`) once the new plain-label and
trigger-accessible-name keys replace them

## 5.1 Regression boundaries

### CR-RG-01 — member action handlers and dialogs unchanged

**Given** the edit-email, reset-password, and delete-member dialogs
**When** any menu action is triggered from the new kebab menu
**Then** the same dialogs, handlers, and API calls fire as before this change; only the trigger
affordance changed

### CR-RG-02 — server-side authorization unchanged

**Given** any member action
**When** the client sends the request
**Then** server-side permission enforcement behaves exactly as before this change; client-side menu
visibility remains advisory only and a denied action still surfaces the existing error handling

### CR-RG-03 — auth routes shell unchanged

**Given** the login or sign-up route
**When** the page renders
**Then** the existing header-only shell (brand, opposite-route link) continues to render exactly as
before, with no sidebar, footer, or language selector added

### CR-RG-04 — chrome-less branch unchanged

**Given** a page renders while not authenticated and not on an auth route (`RootLayout`'s third,
`null`-header branch)
**When** the page renders
**Then** it continues to render no header, sidebar, or footer — unchanged from today

## 6. Non-functional requirements

| Aspect                      | Previous target                                | New target                                                                                                                                                                                                                                                                                   | Measurement                                             |
| --------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Row action affordance width | N/A (desktop-only icons, per design intent)    | At 390px viewport width: the kebab trigger's hit target is ≥32×32px (matching the existing per-action icon buttons' sizing), the opened menu does not overflow the viewport, and row height matches today's unchanged `min-h-[72px]` floor (may grow to fit content, never shrinks below it) | Manual verification at 390px viewport                   |
| Sidebar affordance width    | N/A (no sidebar today)                         | Below the `sm` (640px) breakpoint the sidebar is drawer-collapsed (CR-AC-09) so it does not reduce content width at 390px                                                                                                                                                                    | Manual verification at 390px viewport                   |
| Sidebar persistent width    | N/A (no sidebar today)                         | At or above the `sm` breakpoint the sidebar renders at a fixed 240px width, leaving the members-list content column unconstrained and non-wrapping                                                                                                                                           | Manual verification at 640px and 1440px viewport widths |
| Header control fit at 390px | N/A (header holds only brand + sign-out today) | At 390px viewport width the header's full control set (drawer toggle, brand, language selector, sign-out) fits without horizontal overflow or clipping, by collapsing the language selector and sign-out control to icon-only presentation below `sm`                                        | Manual verification at 390px viewport                   |
| Locale completeness         | `en`/`uk` parity across 8 namespaces           | Parity maintained across the same 8 namespaces (no new namespace added, CR-AC-11); new keys present in both `en` and `uk`                                                                                                                                                                    | Both locale directories hold identical key sets         |

## 6.1 Security / privacy

- **Data classification:** No change — no new personal or sensitive data is displayed or collected.
- **Personal data impact:** None — member email/role display is unchanged; only the action trigger
  changes.
- **Authorization impact:** None to server-side enforcement; client-side visibility continues to
  mirror existing capability flags exactly (CR-AC-04).
- **Security review:** N/A — presentation-only change, no new data exposure or authorization
  surface.

## 7. Metrics / KPIs

- **Design-artifact currency** — baseline: both `design-handoff.md` files describe the pre-change
  shell/actions, target: both updated to match shipped UI within this change request (CR-AC-08).

## 8. Open questions

- [ ] Exact footer content beyond an empty, non-interactive landmark? Default now: an empty
      `<footer>` landmark is a conforming minimum. — owner: Product Owner, due: implementation
      stage (updated from "design-ui stage," which has already completed per the approved
      `design-handoff.md`, without resolving this question)
