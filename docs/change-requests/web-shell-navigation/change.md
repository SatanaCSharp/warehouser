---
kind: change-request
slug: 'web-shell-navigation'
status: Draft
owner: 'YuriiH'
reviewers: ['Product Owner', 'Tech Lead']
updated_at: '2026-08-07'
baseline_revision: '3c7b7a8f611c2d784e885a865b87959003bdc6f5'
compatibility: 'backward-compatible'
affected_sources:
  - apps/web/src/shared/layouts/RootLayout.tsx
  - apps/web/src/modules/access/components/access-administration/MemberList.tsx
  - apps/web/src/modules/auth/sign-out/components/SignOutButton.tsx (icon-only collapse below sm,
    required by spec.md §6's NFR row; RootLayout.tsx alone cannot satisfy it)
  - apps/web/src/shared/constants/routes.ts (read-only; consumed via ROUTES.HOME/ROUTES.ACCESS, no new routes added)
  - apps/web/public/locales/en/common.json
  - apps/web/public/locales/en/access.json
  - apps/web/public/locales/uk/common.json
  - apps/web/public/locales/uk/access.json
  - docs/mockups/app.pen (new named frames proposed pre-implementation via design-ui; not yet marked approved until ship-time reconciliation, see §6/§8)
  - docs/features/users-management/design-handoff.md
  - docs/features/access/design-handoff.md
---

# Change request — web-shell-navigation

## 1. Behavioral delta

When an authenticated user views any authenticated page, current behavior is a header-only shell
(brand link, one conditional inline "Access" link, sign-out button, no sidebar, no footer, no
language control); approved behavior will be a persistent layout of header + sidebar + footer,
where the sidebar carries primary navigation ("Dashboard", "Access") and the header additionally
hosts a language selector.

When an authorized user views the members list, current behavior is up to three separate inline
icon buttons (edit email / reset password / delete member) rendered per row at every viewport;
approved behavior will be a single trailing 3-dot ("kebab") trigger per row that opens a menu
listing the same actions, applied uniformly at all viewports.

When any authenticated user opens the web app, current behavior is a UI language chosen only by
`i18next-browser-languagedetector` with no visible control; approved behavior will additionally
offer an explicit language selector, in the authenticated header only, for English and Ukrainian
that reads from and writes to the same i18next state. The auth-route (login/sign-up) header and the
chrome-less branch are unaffected — see CH-01, CR-RG-03, CR-RG-04.

## 2. Motivation

The current header cannot scale beyond one inline link and duplicates as more sections
(roles/permissions/members under Access) are added. Per-row icon buttons in the members list
already crowd at narrow widths and are inconsistent between what code renders (icons at every
width) and what design intended (icons on desktop, single trigger on mobile) — consolidating to one
kebab menu at all viewports removes that drift and gives room for more actions later. The app
already ships English and Ukrainian translations but has no way for a user to choose between them,
leaving `i18next-browser-languagedetector`'s automatic detection as the only mechanism.

Requested and confirmed with the product owner (2026-08-07): sidebar contains exactly "Dashboard"
(existing home page, unchanged content) and "Access" (existing roles/permissions/members area);
the design deviation from the currently approved header-only frames is explicitly approved as part
of this change request, which also updates the design artifacts.

## 3. Override map

| ID    | Target/source                                                                                                                                       | Existing behavior                                                                                                                                                                                                                                                               | Operation | New behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Compatibility                                                                                                                                   | CR acceptance criteria                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| CH-01 | `apps/web/src/shared/layouts/RootLayout.tsx` — authenticated shell                                                                                  | Header only (brand link, conditional inline "Access" link, sign-out); no sidebar; no footer                                                                                                                                                                                     | AMEND     | Authenticated shell becomes header + sidebar + footer. Header keeps brand + sign-out, adds the new language selector, and — below the `sm` breakpoint only — the sidebar's drawer-toggle control (see CH-02); it drops the inline "Access" link (moved to sidebar). Footer is a footer landmark; an empty, non-interactive landmark is a conforming minimum (see §9). Applies only to the authenticated-shell branch, i.e. `isAuthRoute === false && isAuthenticated === true` in today's `RootLayout.tsx`; the auth-route (`isAuthRoute === true`, login/sign-up — takes precedence regardless of authentication state, matching today's evaluation order) and the not-authenticated/non-auth-route branch (currently no header at all) are unchanged.                                                                                                                                                                         | backward-compatible; unauthenticated/auth routes (login, sign-up) and the chrome-less branch keep today's rendering unchanged                   | CR-AC-01, CR-AC-02, CR-RG-03, CR-RG-04           |
| CH-02 | `apps/web/src/shared/layouts/RootLayout.tsx` — primary navigation                                                                                   | Single conditional "Access" link in header, gated on `ROLES_WATCH` ∪ `USERS_WATCH`                                                                                                                                                                                              | REPLACE   | Sidebar with exactly two items: "Dashboard" (→ `ROUTES.HOME`, always visible when authenticated) and "Access" (→ `ROUTES.ACCESS`, gated on `ROLES_WATCH` ∪ `USERS_WATCH`, identical predicate and identical loading-window behavior to today — no skeleton added). Header no longer renders the inline "Access" link. At or above the app's existing `sm` (640px) breakpoint the sidebar renders persistently; below it, it collapses to an off-canvas drawer opened by a header-hosted toggle. Active-item visual/`aria-current` treatment is a visual-design detail left to `design-ui`, not pinned by an acceptance criterion here.                                                                                                                                                                                                                                                                                          | backward-compatible; same permission predicate and loading behavior reused verbatim                                                             | CR-AC-02, CR-AC-09                               |
| CH-03 | `apps/web/src/modules/access/components/access-administration/MemberList.tsx` — row actions                                                         | Up to 3 separate inline icon buttons (mail / key / trash) per row, rendered identically at every viewport, each gated on `canEditEmail` / `canResetPassword` / `canDeleteMember`, each individually accessible-named with the member's email                                    | REPLACE   | Single trailing 3-dot ("kebab") trigger per row, at every viewport, opening the same dropdown/menu presentation (no viewport-specific bottom-sheet variant) listing the same actions (Edit email / Reset password / Delete member) as plain labels; each item still present only when its capability is true (hidden, not disabled); if all three capabilities are false for a non-protected, non-self row, no trigger renders for that row either. Trigger carries the per-row accessible name (e.g. "Actions for {email}"); opens on click/tap or Enter/Space when focused; Escape closes and returns focus to the trigger; Arrow Up/Down move focus among menu items. Row markup outside the action affordance (identity stack, spacing, height) is unchanged. Selecting a menu item still invokes the same dialogs/handlers/requests as today (CR-RG-01), and server-side authorization is untouched (CR-RG-02).            | backward-compatible; same three actions, same handlers, same permission predicates                                                              | CR-AC-03, CR-AC-04, CR-AC-10, CR-RG-01, CR-RG-02 |
| CH-04 | `apps/web/src/modules/access/components/access-administration/MemberList.tsx` — protected/self rows                                                 | Protected (warehouse_manager) and self rows render a Chip, no action buttons                                                                                                                                                                                                    | AMEND     | Protected and self rows continue to render only their Chip; no kebab trigger renders for those rows (no focusable action control at all)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | backward-compatible; preserves existing invariant                                                                                               | CR-AC-05                                         |
| CH-05 | header — language control (consumes `apps/web/src/i18n.ts`, does not modify it)                                                                     | Language chosen only by `i18next-browser-languagedetector` (browser/cached detection, fallback `en`); no visible selector; `i18n.ts`'s 8 namespaces and detection/fallback/caching config as-is                                                                                 | ADD       | Header hosts an openable language selector listing English and Ukrainian by fixed native-name labels (`English`, `Українська` — literal, not translation keys, identical regardless of active locale); selecting one calls `i18n.changeLanguage()`; selector's displayed value always reflects live i18next state via `i18n.resolvedLanguage` (no independent local state, and region variants resolve to their base language); the chosen language persists across reload via the detector's existing caching, unchanged from today's configuration. `i18n.ts` itself is not modified — its 8 namespaces, `supportedLngs`, fallback, and detection config stay as-is; any new UI strings this change needs are added to the existing `common`/`access` namespaces in both `en` and `uk`. A brief fallback/loading flash while a newly-needed namespace loads after a switch is acceptable; a full page reload is not required. | backward-compatible; detector/fallback/caching behavior unchanged, selector is additive; applies to the authenticated shell only (see CR-AC-06) | CR-AC-06, CR-AC-07, CR-AC-11                     |
| CH-06 | `docs/mockups/app.pen`, `docs/features/users-management/design-handoff.md`, `docs/features/access/design-handoff.md` — approved shell/action frames | `app.pen` holds the frames named/approved in both `design-handoff.md` docs' `approved_frame(s)`/`approved_node_id` front-matter, describing a header-only shell and viewport-split action affordance (desktop icons / mobile kebab); both docs state "Approved deviations: N/A" | REPLACE   | New named frames (at minimum: one covering the authenticated shell — sidebar+header+footer — and one covering the members-list kebab menu; exact names assigned during `design-ui`) are added to `app.pen` via `design-ui` **before** implementation — this versions the shared design source with new frames without yet changing which frame either `design-handoff.md` document _declares_ approved. That declaration — the `approved_frame`/`approved_node_id` reference and prose in both `design-handoff.md` documents, plus their "Approved deviations" line recording this change request's explicit approval — is canonical-documentation reconciliation and, per the change-request pipeline contract, happens only as the explicit shipping step after review PASS (§8), not during design-ui or implementation.                                                                                                     | documentation-only; no runtime behavior change beyond CH-01–CH-05; front-matter `compatibility` above describes runtime behavior only           | CR-AC-08                                         |

## 4. Impact analysis

| Area                         | State                                                                                                                                                                                    | Evidence and consequence                                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain invariants            | unchanged                                                                                                                                                                                | Permission predicates for member actions (`canEditEmail`/`canResetPassword`/`canDeleteMember`) and the protected/self exclusion are reused verbatim (CH-03, CH-04); no change to `USERS:*`/`ROLES:*` semantics.                           |
| Permissions                  | unchanged                                                                                                                                                                                | Sidebar "Access" gating reuses the exact `ROLES_WATCH ∪ USERS_WATCH` predicate already in `RootLayout.tsx`. Server-side authorization is untouched; UI visibility remains advisory only.                                                  |
| Workflows and state          | unchanged                                                                                                                                                                                | Edit email / reset password / delete member flows and dialogs (`EditEmailDialog`, `ResetPasswordDialog`, `DeleteMemberDialog`) are unchanged; only their trigger affordance moves into a menu.                                            |
| API and events               | N/A — reason: no endpoint, contract, or event changes; this is presentation-only.                                                                                                        |
| Persisted data               | N/A — reason: no schema or stored-data change; language choice persistence continues via `i18next-browser-languagedetector`'s existing detection/caching configuration, not a new store. |
| UI behavior                  | affected                                                                                                                                                                                 | New sidebar + footer layout, kebab-based row actions at all viewports, new language selector. See CH-01–CH-05.                                                                                                                            |
| Cross-feature behavior       | affected                                                                                                                                                                                 | `users-management` (members list actions) and `access` (navigation entry point, roles/permissions/members area) both consume the new shell and row-action affordance; their `design-handoff.md` docs are reconciled in §8.                |
| Security and privacy         | unchanged                                                                                                                                                                                | No new data exposure; kebab menu item visibility still derives from the same capability projection as today, hide-not-disable semantics preserved.                                                                                        |
| Operations and observability | N/A — reason: no telemetry is added or removed (project policy prohibits adding telemetry); no new operational surface.                                                                  |
| Tests                        | affected                                                                                                                                                                                 | `MemberList.spec.tsx` and any `RootLayout`/shell tests must be updated for the new markup (kebab menu, sidebar, language selector); `AccessAdministration.spec.tsx` may need updated selectors if it queries row action buttons directly. |
| Canonical documentation      | affected                                                                                                                                                                                 | `docs/features/users-management/design-handoff.md` and `docs/features/access/design-handoff.md` require reconciliation after PASS (§8).                                                                                                   |

## 5. Compatibility and transition

- **Compatibility:** Backward-compatible for runtime behavior — every existing action, handler, permission predicate, and route is preserved; only presentation changes. The design-artifact override (CH-06) is a breaking replacement of the previously approved frames, scoped to documentation only.
- **Affected consumers:** Any authenticated web user; no external API consumers are affected (no contract change).
- **Transition window and exit condition:** No transition window — this is a single-release UI change with no dual-running old/new affordance. Exit condition: new shell, kebab menu, and language selector ship together; the old inline header link and per-row icon buttons are removed in the same change (no flag, no coexistence).
- **Existing-data treatment:** N/A — no persisted data is reinterpreted. A returning user's already-cached language preference (if any exists via the detector's cache) continues to apply once the selector exists; it does not need migration.

## 6. Rollout

Single-release rollout, no feature flag (project convention favors direct changes over
compatibility shims). Order: (1) add new named frames to `docs/mockups/app.pen` and get them
approved via `design-ui` — this versions the shared design source but does not yet flip either
`design-handoff.md` document's declared-approved frame, so it precedes implementation without
violating the change-request pipeline's "feature artifacts unchanged until shipping" rule, (2)
implement shell (sidebar + header + footer) and navigation, (3) implement members-list kebab menu,
(4) implement language selector (locale key additions to `common`/`access` in both `en`/`uk`), (5)
update/extend affected tests, (6) at ship time, reconcile both `design-handoff.md` files' prose and
`approved_frame`/`approved_node_id` references to match what shipped, and record the explicit
deviation approval (§8 — this is the only step that edits canonical feature documentation, and it
happens after review PASS). No specific monitoring signal beyond existing test suites and manual
verification in a browser (per `run`/UI-change verification practice); no telemetry is added. Abort
threshold: any regression in member-action authorization behavior (an action becomes reachable when
its capability is false, or vice versa) blocks release.

## 7. Rollback

Revert the shell/navigation, member-list, and i18n-selector commits, and revert the locale key
additions. No persisted data or contract changes exist, so code rollback is a pure code revert with
no data migration or compatibility concern. If ship-time reconciliation (§6 step 6, §8) has already
landed, also revert that documentation commit so both `design-handoff.md` documents' declared
approved frames and prose again match the code that's actually running — otherwise the docs would
describe a shell and kebab menu that no longer exist, the exact drift this change request exists to
remove (§2). The new frames added to `app.pen` in step 1 may be left in place (unreferenced) or
removed; neither choice affects runtime behavior.

## 8. Canonical reconciliation after PASS

| Canonical owner                                    | Required edit                                                                                                                                                                                                                                                                                                                                                                                     | Backlink                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `docs/features/users-management/design-handoff.md` | Replace the header-only shell description and the viewport-split action affordance (desktop icons / mobile kebab) with the new sidebar+header+footer shell and the all-viewport kebab menu; update `approved_frame`/`approved_node_id` to the new frame names; change "Approved deviations: N/A" to record this change request's explicit approval of the shell/kebab deviation, with a backlink. | `docs/change-requests/web-shell-navigation/change.md` |
| `docs/features/access/design-handoff.md`           | Replace "extend the authenticated shell with warehouse/access navigation" guidance with a reference to the sidebar-based navigation defined by this change request; update `approved_frame`/`approved_node_id` to the new shell frame name; change "Approved deviations: N/A" to record this change request's explicit approval, with a backlink.                                                 | `docs/change-requests/web-shell-navigation/change.md` |

## 9. Open questions

- [ ] Exact visual content/links (if any) inside the footer beyond an empty, non-interactive
      landmark? Default now: an empty `<footer>` landmark is a conforming minimum; if content is
      wanted (e.g. brand/copyright text) it must remain non-interactive, refined during
      `design-ui`. — owner: Product Owner, due: design-ui stage
