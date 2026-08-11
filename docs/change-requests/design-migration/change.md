---
kind: change-request
slug: 'design-migration'
status: Draft
owner: 'YuriiH'
reviewers: ['Product Owner', 'Tech Lead']
updated_at: '2026-08-09'
baseline_revision: 'a7b0c9b5edb27b90b9fc348e9a0547bba18cdede'
compatibility: 'backward-compatible'
affected_sources:
  - 'docs/mockups/app.pen'
  - 'docs/features/auth/design-handoff.md'
  - 'docs/features/access/design-handoff.md'
  - 'docs/features/users-management/design-handoff.md'
  - 'docs/system/sad.md#ui-delivery'
  - 'docs/system/frontend-architecture.md#ui-design-boundary'
  - 'apps/web/src/styles/global.css'
  - 'apps/web/src/shared/layouts/RootLayout.tsx'
---

# Change request — design-migration

## 1. Behavioral delta

When a designer or engineer consults the canonical UI source for any Warehouser screen, current
behavior is that the fourteen approved frames in `docs/mockups/app.pen` are hand-drawn frames bound
to a flat, unthemed variable set (`$bg`, `$surface`, `$text`, `$primary`, `$radius-lg`, `$space-4`,
`$font`) that predates the HeroUI v3 design system; approved behavior will be that every approved
frame is composed from the `HeroUI/*` reusable components on the `HeroUI v3 · Design System` board
(`CdGdS`) and bound only to the themed `semantic: light | dark` token set, and that
`apps/web` renders those screens from the same tokens and the same HeroUI v3 primitives.

## 2. Motivation

Commit `a7b0c9b feat(#16): upgraded hero-ui to version 3` upgraded the runtime library and added a
complete design-system board to `docs/mockups/app.pen` — token foundations, ~34 `HeroUI/*`
components, a dark-mode panel, and an implementation index mapping each layer name to its
`@heroui/react` import. The board is not yet the source of any screen. Two consequences make this
worth closing now rather than later:

1. **Two competing token vocabularies coexist in one file.** The design-system board uses themed
   `semantic` variables (`$accent/accent`, `$surface/surface`, `$radius/lg`); the fourteen approved
   screens still use the flat pre-v3 set. Every new screen forces a choice between them, and every
   choice made wrong compounds.
2. **The handoffs point at the wrong code.** All three `design-handoff.md` token tables map Pencil
   variables to `apps/web/src/styles/hero.ts`. That file does not exist — the real token surface is
   `apps/web/src/styles/global.css`, which currently overrides `--accent`, `--success`, `--warning`,
   and `--danger` as hex literals rather than adopting the board's values. An implementer following
   the approved handoff today cannot find the file it names.

## 3. Override map

| ID    | Target/source                                                                                                              | Existing behavior                                                                                                                                                                                                                                                        | Operation | New behavior                                                                                                                                                                                                                        | Compatibility                                                                                | CR acceptance criteria |
| ----- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------- |
| CH-01 | `docs/mockups/app.pen` — Auth frames `E9i5Ma`, `WSRa3`, `lYkRJ`, `ZlykT`, `iwzam`, `NC8C7`                                 | Six approved Auth frames drawn as ad-hoc frames bound to the flat variable set                                                                                                                                                                                           | REPLACE   | Six new versioned frames (`… / v3`) composed from `HeroUI/*` component instances and themed `semantic` tokens; visual and behavioral intent preserved                                                                               | Transitional — node IDs change; `docs/features/auth/design-handoff.md` re-pinned             | CR-AC-01, CR-AC-03     |
| CH-02 | `docs/mockups/app.pen` — Access frames `f4Icg`, `jtBOB`, `W48Rk`, `G0Yvp`                                                  | Four approved Access frames drawn as ad-hoc frames bound to the flat variable set                                                                                                                                                                                        | REPLACE   | Four new versioned frames (`… / v2`) composed from `HeroUI/*` component instances and themed `semantic` tokens                                                                                                                      | Transitional — node IDs change; `docs/features/access/design-handoff.md` re-pinned           | CR-AC-01, CR-AC-03     |
| CH-03 | `docs/mockups/app.pen` — Users frames `e4e0H`, `hIpfH`, `GjSFa`, `bzV6e`                                                   | Four approved Users frames drawn as ad-hoc frames bound to the flat variable set                                                                                                                                                                                         | REPLACE   | Four new versioned frames (`… / v2`) composed from `HeroUI/*` component instances and themed `semantic` tokens                                                                                                                      | Transitional — node IDs change; `docs/features/users-management/design-handoff.md` re-pinned | CR-AC-01, CR-AC-03     |
| CH-04 | `docs/mockups/app.pen` — flat variable set                                                                                 | `bg`, `surface`, `surface-soft`, `text`, `field`, `primary`, `primary-foreground`, `secondary`, `danger`, `danger-soft`, `success`, `warning`, `focus`, `font`, `radius-sm/md/lg`, `space-2/3/4/6`, `border`, `muted` are defined and referenced by the approved screens | AMEND     | Definitions **retained**, scoped to the `Archive / *` frames only. No current frame references them. See the reversal note below                                                                                                    | Backward-compatible — nothing is removed                                                     | CR-AC-02               |
| CH-10 | `docs/mockups/app.pen` — superseded frames                                                                                 | The 14 pre-v3 frames carried the same names as the frames that replace them, with nothing marking which was current                                                                                                                                                      | AMEND     | Renamed with an `Archive / ` prefix and retained permanently; a top-level `Version history` frame records current ↔ superseded, node IDs, and dates                                                                                 | Backward-compatible — node IDs unchanged, so `migrated_from` pins still resolve              | CR-AC-02, CR-AC-07     |
| CH-11 | `docs/mockups/app.pen` — screens with a shipped counterpart                                                                | Pass-1 frames encoded approved _intent_, which had drifted from what `apps/web` renders (tab treatment, list icons, password reveal, note styling)                                                                                                                       | REPLACE   | Eight frames rebuilt from the app's actual DOM as `Auth Sign In v4` and `Access`/`Users` `… v3`; pass-1 frames archived. The file now records shipped UI                                                                            | Backward-compatible — pass-1 frames archived, not deleted                                    | CR-AC-01, CR-AC-08     |
| CH-05 | `docs/features/{auth,access,users-management}/design-handoff.md` front matter                                              | `approved_frame` / `approved_frames` / `approved_node_id` pin the pre-v3 node IDs; `previews/*.png` show the pre-v3 rendering                                                                                                                                            | AMEND     | Front matter pins the new frame names and node IDs, adds `migrated_from` recording the pre-v3 IDs and `baseline_revision`; previews regenerated. `status: approved` is retained only after the user re-approves the migrated frames | Transitional — approval provenance preserved via `migrated_from`                             | CR-AC-03, CR-AC-04     |
| CH-06 | `docs/features/{auth,access,users-management}/design-handoff.md` § Tokens                                                  | Token tables map Pencil variables to `apps/web/src/styles/hero.ts`, and to HeroUI v2 utility names (`bg-content1`, `bg-content2`, `text-foreground-500`, `border-divider`)                                                                                               | REPLACE   | Token tables map the themed `semantic` variables to the HeroUI v3 CSS variables and utilities actually shipped by `@heroui/styles`, and name `apps/web/src/styles/global.css` as the code surface                                   | Breaking for implementers reading the old table — the named file never existed               | CR-AC-04               |
| CH-07 | `apps/web/src/styles/global.css:4-35`                                                                                      | `--accent`, `--success`, `--warning`, `--danger` (+ `-foreground`) are overridden with hex literals chosen independently of the design-system board, for light and dark                                                                                                  | REPLACE   | The same variables carry the design-system board's values, expressed in the `oklch` form HeroUI v3 uses, for both the light and dark selector groups                                                                                | Backward-compatible — same variable names, same selectors, new values                        | CR-AC-05               |
| CH-08 | `apps/web/src/shared/layouts/RootLayout.tsx` and the hand-rolled Tailwind markup in `modules/access/**`, `modules/auth/**` | Application shell header, list rows, section headers, and page typography are hand-written `<header>`/`<div>`/`<h1>` with Tailwind utility classes rather than HeroUI primitives                                                                                         | AMEND     | Those surfaces render the HeroUI v3 primitives named by the migrated frames' implementation index; hand-rolled utility markup remains only where no HeroUI primitive exists                                                         | Backward-compatible — no route, prop, or contract change                                     | CR-AC-06, CR-RG-01…04  |
| CH-09 | `docs/system/sad.md` § UI delivery (`:73-78`)                                                                              | "HeroUI (v3) and the CSS-variable tokens configured in `apps/web/src/styles/global.css` provide the current UI foundation."                                                                                                                                              | AMEND     | Adds that the `HeroUI v3 · Design System` board (`CdGdS`) in `docs/mockups/app.pen` is the canonical component and token source, and that `global.css` implements it rather than defining it                                        | Backward-compatible — clarifies precedence, changes no rule                                  | CR-AC-04               |

Behavior not listed above is unchanged. In particular, no row removes a screen, a state, a
capability, or an approved interaction — CH-01…CH-03 rebuild the _same_ information hierarchy on
new primitives.

> **Reversal, 2026-08-09 — nothing is deleted.** CH-04 originally read `REMOVE`: delete the flat
> variable definitions once every frame was migrated, taking the superseded frames with them and
> leaving one token vocabulary. The owner rejected that. Superseded frames are approved-design
> knowledge and must stay in the file so the design history is visible in Pencil, not only in Git.
>
> Because the `Archive / *` frames keep rendering, the flat variables they bind must keep existing.
> **Two token vocabularies now coexist permanently and deliberately:** the themed `semantic` set backs
> every current frame, the flat set backs the archive. That is the outcome, not an unfinished
> migration — anything reading this later should not "finish the job" by deleting either.
> CR-AC-02 and the § 7 metrics in `spec.md` were rewritten to match.

## 4. Impact analysis

| Area                         | State     | Evidence and consequence                                                                                                                                                                                                                                                  |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain invariants            | unchanged | No spec.md in `docs/features/*` states a visual rule; all ACs are phrased as system behavior. Nothing in this request touches a domain rule.                                                                                                                              |
| Permissions                  | unchanged | Capability gating stays in `AccessWorkspace.tsx` and the current-access projection. `docs/features/access/spec.md:219` (AC-15, "the web does not present that capability as available") is a regression boundary here, not a target — see CR-RG-02.                       |
| Workflows and state          | unchanged | Routes (`/`, `/login`, `/sign-up`, `/access`), guards, RTK Query endpoints, and Redux slices are untouched.                                                                                                                                                               |
| API and events               | N/A       | Presentation-layer change. No `contracts/openapi.yaml` in any feature is read or written.                                                                                                                                                                                 |
| Persisted data               | N/A       | No entity, migration, or stored value participates.                                                                                                                                                                                                                       |
| UI behavior                  | affected  | Every user-visible screen changes appearance: shell header, auth gateway, access workspace and administration, users administration and dialogs. Information hierarchy, control order, and copy are preserved; the primitives rendering them change.                      |
| Cross-feature behavior       | affected  | Auth, access, and users-management share one shell, one token set, and one component vocabulary. A token or shell regression lands in all three simultaneously — this is why the three feature handoffs move together in one request.                                     |
| Security and privacy         | unchanged | No authentication, authorization, session, or personal-data path is modified. Capability-driven rendering is preserved verbatim.                                                                                                                                          |
| Operations and observability | unchanged | No logging, metric, or runtime configuration changes. Per repository policy, no telemetry is added.                                                                                                                                                                       |
| Tests                        | affected  | 21 colocated Vitest specs under `apps/web/src` assert on rendered markup (roles, labels, text). Swapping primitives can change the accessible tree. Specs are updated only where the accessible name or role legitimately changes; assertions are never weakened to pass. |
| Canonical documentation      | affected  | Three `design-handoff.md` files (front matter, component mapping, token table), `docs/system/sad.md` § UI delivery, and — for the corrected `hero.ts` → `global.css` reference — `docs/system/frontend-architecture.md` § UI design boundary.                             |

## 5. Compatibility and transition

- **Compatibility:** `backward-compatible` (downgraded from `transitional` on 2026-08-09, once
  nothing was being deleted). No runtime contract, route, or API breaks, and no design artifact is
  removed. What breaks and is repaired inside this request is the reference integrity between the
  three approved `design-handoff.md` files and the `.pen` node IDs they pin.
- **Affected consumers:** (1) the three feature design handoffs and every task file that cites them;
  (2) `apps/web` as the implementer of those handoffs; (3) any future `design-ui` run, which must
  compose from `HeroUI/*` rather than draw new frames, and must archive rather than edit a superseded
  frame.
- **Transition window and exit condition:** none. There is no transition — the archive is the
  permanent end state. The pre-v3 frames render for as long as the file exists.
- **Existing-data treatment:** N/A — no persisted data. The pre-v3 frames remain live and inspectable
  in `docs/mockups/app.pen` under their `Archive / ` names, indexed by the `Version history` frame,
  and are additionally recoverable from `git show a7b0c9b:docs/mockups/app.pen` and the committed
  `docs/features/*/previews/*.png`.

### Versioning convention (established by this request)

1. An approved frame is immutable. A revision creates a **new** frame with the next version suffix.
2. The superseded frame is renamed with an `Archive / ` prefix and **kept** — never deleted.
3. Its node ID never changes, so `migrated_from` pins in a handoff keep resolving.
4. The top-level `Version history` frame records current ↔ superseded, node IDs, and dates.
5. Tokens an archived frame binds stay defined, even after newer frames stop using them.

## 6. Rollout

1. Build the fourteen replacement frames from `HeroUI/*` instances, feature by feature (Auth →
   Access → Users), verifying each against its committed preview PNG before moving on.
2. Re-pin the three handoffs and regenerate previews; obtain user re-approval of the migrated frames.
3. Rename the superseded frames with the `Archive / ` prefix and add the `Version history` frame
   (CH-10). Retain the flat variable definitions (CH-04) — the archive binds them, so deleting them
   would silently blank every archived frame.
4. Apply CH-07 (tokens) to `global.css` and verify the app still renders in light and dark.
5. Apply CH-08 (primitives) module by module, running `pnpm --filter @warehouser/web test` after each
   module rather than once at the end.
6. Verify in Chrome across `/login`, `/sign-up`, `/`, and `/access`, at 1440×900 and 390×844.

**Monitoring signals:** the per-module Vitest run, `pnpm --filter @warehouser/web lint`, the
`tsc -p apps/web/tsconfig.json` typecheck, and the browser pass. **Abort threshold:** if step 5
requires weakening or deleting an existing behavioral assertion to go green, stop and escalate —
that indicates the migration changed behavior, which this request does not authorize.

## 7. Rollback

- **Design artifacts:** `git checkout a7b0c9b -- docs/mockups/app.pen docs/features/*/design-handoff.md`
  restores the pre-v3 frames, the flat variable set, and the original handoff pins in one step. The
  `.pen` file is binary/encrypted, so rollback is whole-file; partial rollback of a single frame is
  not possible and would have to be re-migrated by hand.
- **Application code:** ordinary revert. CH-07 and CH-08 are additive-in-place edits to files that
  already exist; no migration, feature flag, or coexistence path is required.
- **Limitation:** none of consequence. Since the retention decision, rollout step 3 destroys nothing
  — the superseded frames are renamed, not deleted — so a rollback at any point is a plain revert
  with no design knowledge to reconstruct.

## 8. Canonical reconciliation after PASS

| Canonical owner                                             | Required edit                                                                                                         | Backlink                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `docs/features/auth/design-handoff.md`                      | Amend front matter to the migrated frame IDs; replace the § Tokens table; add `migrated_from` and `baseline_revision` | `docs/change-requests/design-migration/change.md` |
| `docs/features/access/design-handoff.md`                    | Same, plus correct the `hero.ts` reference in § Implementation constraints                                            | `docs/change-requests/design-migration/change.md` |
| `docs/features/users-management/design-handoff.md`          | Same                                                                                                                  | `docs/change-requests/design-migration/change.md` |
| `docs/system/sad.md` § UI delivery                          | Amend to name the `HeroUI v3 · Design System` board as the canonical component/token source                           | `docs/change-requests/design-migration/change.md` |
| `docs/system/frontend-architecture.md` § UI design boundary | Amend to state that new screens are composed from `HeroUI/*`, not drawn                                               | `docs/change-requests/design-migration/change.md` |

## 9. Open questions

- [x] Does "migrate the mockups" include bringing `apps/web` into line, or only the `.pen` file?
      Resolved 2026-08-09 by the user: **both**, mockups first and then the web app, verified in a
      browser.
- [x] Which pipeline route applies? This request classifies as **L** (multiple modules and surfaces,
      pinned-reference breakage, coordinated rollout), whose default route is `full`. The user
      approved a direct `change-request → implement` route on 2026-08-09; `.route` records `quick`
      to reflect the approved deviation. `clarify`, `design`, `tasks`, and `plan-tests` are
      **skipped, not passed**.
- [ ] Does the migrated design introduce a user-facing light/dark switcher? Default now: **no** — a
      switcher is new capability and belongs in `specify`, not here.
      **Sharpened 2026-08-09 by browser verification:** HeroUI v3 selects its dark theme with the
      `.dark` class or `[data-theme="dark"]` attribute, **not** with a `prefers-color-scheme` media
      query, and `apps/web` sets neither. The original wording here assumed
      `html { color-scheme: light dark }` was enough; it is not — that property only affects
      user-agent form controls and scrollbars. Consequence: **the running application cannot render
      dark at all today, whatever the operating-system preference.** The dark tokens are verified
      correct (spec.md § 7), so a switcher is a small, well-defined follow-up — but it is a real gap,
      not a setting someone can flip. — owner: Product Owner, due: before any follow-up UI request.
- [x] **Desktop access tabs: design said underline, code ships segmented.** Resolved 2026-08-09 in
      favour of the code: the owner chose an as-implemented second pass, so the access handoff now
      specifies segmented at both viewports and the `… / v3` frames are drawn that way. The underline
      intent survives in the archived v1/v2 frames.
- [ ] **`Auth / Create Account` documents a screen that does not exist.** The app has one sign-up
      route that collects email, password and warehouse name — i.e. `Access / Registration`. The two
      auth create-account frames were left at their pass-1 version because there is nothing shipped to
      mirror. Either drop them from the auth scope or build the screen. — owner: Product Owner, due:
      before the next auth UI task.
- [ ] **`Users / Create Member` frames are unverified.** The modal was not captured in the
      as-implemented pass, so those two frames still show intent. — owner: Tech Lead, due: next
      users-management UI task.
- [ ] Do the migrated frames require fresh user approval, or does the pre-v3 approval carry over?
      Default now: **fresh approval is required** before each handoff's `status` returns to
      `approved`, per the "approved frames are immutable; revisions require new versioned frames"
      rule in all three handoffs. This is no longer a gate on deleting anything — nothing is deleted
      (see the reversal note in § 3) — only on the handoffs' approval state. — owner: Product Owner,
      due: before the next UI task in any of the three features.
