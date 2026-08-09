---
kind: change-request
status: Draft
owner: 'YuriiH'
reviewers: ['Tech Lead']
updated_at: '2026-08-09'
feature_size: 'L'
change_record: './change.md'
---

# Change-request specification — design-migration

## 1. Context

`docs/mockups/app.pen` now holds a complete `HeroUI v3 · Design System` board (`CdGdS`): token
foundations, ~34 reusable `HeroUI/*` components, a dark-mode panel, and an implementation index
mapping every layer name to its `@heroui/react` import. None of the fourteen approved product
screens use it — they remain hand-drawn frames bound to a flat, pre-v3 variable set, and the three
`design-handoff.md` files that pin them map tokens to `apps/web/src/styles/hero.ts`, a file that
does not exist.

This request makes the design-system board authoritative: every approved frame is composed from
`HeroUI/*` instances and themed `semantic` tokens, the handoffs are re-pinned to the migrated
frames, and `apps/web` renders those screens from the same tokens and the same HeroUI v3
primitives. Override rows: [CH-01…CH-09](./change.md#3-override-map).

Affected actors: the designer maintaining `app.pen`, the engineer implementing a screen from a
handoff, and — indirectly, through appearance only — every authenticated and anonymous web user.

## 2. Goals

- One token vocabulary in `docs/mockups/app.pen`: the themed `semantic: light | dark` set.
- Every approved frame is an assembly of `HeroUI/*` component instances, so a library change
  propagates to all screens by editing the component once.
- An engineer opening any `design-handoff.md` finds a token table that names a file that exists and
  maps to variables `@heroui/styles` actually ships.
- The running web app is visually and structurally consistent with the migrated frames in both light
  and dark rendering.

## 3. Non-goals

- **No new screens, states, or capabilities.** The migration rebuilds the approved information
  hierarchy on new primitives; it does not add a screen or an interaction.
- **No user-facing theme switcher.** Tokens are defined for light and dark, but exposing a control
  that toggles them is new capability and belongs in `specify`.
- **No change to routes, guards, RTK Query endpoints, Redux slices, API contracts, or the data
  model.** This request is presentation-only.
- **No new UI wrapper package.** `docs/system/frontend-architecture.md:112` forbids inventing one;
  components continue to be imported from `@heroui/react` directly.
- **No copy rewrite.** Visible strings keep their existing i18n keys and translations.
- **No deletion of superseded design work.** Approved frames that this request replaces are archived
  and kept in `docs/mockups/app.pen`, never removed. The flat token set stays defined for exactly as
  long as an archived frame binds it.

## 4. Changed user stories

### CR-US-01: Compose screens instead of drawing them

**As a** designer maintaining `docs/mockups/app.pen`
**I want** every approved product frame to be built from the `HeroUI/*` components on the design-system board
**So that** a change to a button, field, or card is made once and appears on every screen that uses it

### CR-US-02: Follow a handoff that points at real code

**As an** engineer implementing a screen from a `design-handoff.md`
**I want** the token table to name the file and the CSS variables that actually exist
**So that** I can map a Pencil variable to a code token without guessing or discovering the named file is missing

### CR-US-03: See the design system in the running app

**As a** web user of Warehouser
**I want** the shell, forms, lists, tabs, and dialogs to render as one coherent system in whichever
theme my environment prefers
**So that** the product reads as a single application rather than a set of separately styled pages

## 5. Acceptance criteria

### CR-AC-01 (CR-US-01, CH-01/CH-02/CH-03) — design artifact

**Given** the migrated Auth, Access, and Users frames in `docs/mockups/app.pen`
**When** the frames are inspected for the components and variables they reference
**Then** every interactive control, field, card, chip, tab, modal, and separator resolves to an
instance of a `HeroUI/*` component from board `CdGdS`, and no node references a variable from the
flat pre-v3 set

### CR-AC-02 (CR-US-01, CH-04/CH-10) — design artifact

**Given** the fourteen replacement frames exist and the handoffs have been re-pinned
**When** `docs/mockups/app.pen` is inspected
**Then** every superseded frame is still present under an `Archive / ` name with its original node
ID, the flat variables it binds are still defined, no frame has an unresolved variable reference,
and no frame outside `Archive / *` references a flat variable

> **Rewritten 2026-08-09.** This criterion originally required the flat variables to be _deleted_ so
> one vocabulary remained. The owner rejected deleting superseded design knowledge; see the reversal
> note in [`change.md` § 3](./change.md#3-override-map). Retention is now the requirement, and
> "two vocabularies" is the correct end state rather than a defect.

### CR-AC-07 (CR-US-01, CH-10) — design artifact

**Given** `docs/mockups/app.pen`
**When** a reader opens the top-level `Version history` frame
**Then** each of the fourteen migrations appears as a row naming the current frame and node ID, the
superseded frame and node ID, and the approval and supersede dates, and the stated retention rule
matches what the file actually contains

### CR-AC-03 (CR-US-02, CH-01/CH-02/CH-03/CH-05) — documentation

**Given** `docs/features/{auth,access,users-management}/design-handoff.md`
**When** the front matter is read
**Then** `approved_frames` names the migrated frames and their current node IDs, `migrated_from`
records the pre-v3 node IDs together with `baseline_revision: a7b0c9b`, and each listed preview file
exists on disk

### CR-AC-04 (CR-US-02, CH-06/CH-09) — documentation

**Given** any of the three handoff § Tokens tables, or `docs/system/sad.md` § UI delivery
**When** a reader follows the code reference
**Then** the referenced path resolves to a file that exists in the repository, no row names
`apps/web/src/styles/hero.ts`, and `docs/system/sad.md` identifies board `CdGdS` as the canonical
component and token source

### CR-AC-05 (CR-US-03, CH-07) — behavioral

**Given** the running web application
**When** the document root carries no theme attribute, and then when it carries
`data-theme="dark"`
**Then** `--background`, `--surface`, `--foreground`, and `--accent` resolve to the design-system
board's values for that theme, and text on every one of those surfaces meets the WCAG AA contrast
ratio for its size

> **Corrected 2026-08-09 after browser verification.** This criterion originally said "under a
> light-preferring and then a dark-preferring color scheme". That premise was wrong: HeroUI v3's
> dark theme is selected by the `.dark` class or the `[data-theme="dark"]` attribute, **not** by a
> `prefers-color-scheme` media query, and `apps/web` sets neither. `html { color-scheme: light dark }`
> only affects user-agent-rendered form controls and scrollbars, not HeroUI tokens. The token layer
> is verified correct in both themes (see § 7); what the application lacks is anything that _selects_
> dark, which is the theme-switcher non-goal in § 3.

### CR-AC-06 (CR-US-03, CH-08) — behavioral

**Given** the running web application at 1440×900 and at 390×844
**When** a user visits `/login`, `/sign-up`, `/`, and `/access`
**Then** the shell header, page headings, forms, lists, tabs, cards, and dialogs render the HeroUI v3
primitives named by the migrated frames' implementation index, and the on-screen information
hierarchy, control order, and visible copy match the corresponding migrated frame

### CR-AC-08 (CR-US-03, CH-11) — design artifact

**Given** a screen that `apps/web` implements
**When** its current frame is compared against the application's rendered DOM at the same viewport
**Then** the frame's control order, component choices, labels, placeholders, descriptions and helper
copy match what the application renders, and any screen with no shipped counterpart is explicitly
recorded as such in its handoff rather than silently left to look current

## 5.1 Regression boundaries

### CR-RG-01 — authentication flows are unchanged

**Given** a user with valid credentials
**When** they sign up, sign in, are shown the `?reason=session-ended` banner, or sign out
**Then** each flow completes exactly as it does at `baseline_revision`, including validation
messages, error normalization, and the resulting session state

### CR-RG-02 — capability gating is unchanged

**Given** a member whose current-access projection lacks `ROLES:WATCH` or `USERS:WATCH`
**When** the access workspace renders
**Then** the corresponding tab, request, and retained dataset remain absent — satisfying
`docs/features/access/spec.md:219` (AC-15) exactly as before, with no capability becoming visible as
a side effect of the new primitives

### CR-RG-03 — localization and error feedback are unchanged

**Given** either supported language
**When** any migrated screen renders a label, description, validation error, or toast
**Then** the string still resolves through its existing i18n key, and the normalized feedback
adapters in `docs/system/guides/web-error-handling.md` remain the single source of user-visible
failure copy

### CR-RG-04 — contracts and boundaries are unchanged

**Given** the web application after the migration
**When** its routes, guards, RTK Query endpoints, Redux slices, and request/response shapes are
compared against `baseline_revision`
**Then** they are identical; no new module, wrapper package, or parallel styling system is
introduced

## 6. Non-functional requirements

| Aspect                             | Previous target                   | New target                                                                     | Measurement                                                                 |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Current frames binding flat tokens | 14 of 14                          | 0 of 14 (archived frames excluded — they keep binding them by design)          | Flat-variable audit of every non-`Archive` frame                            |
| Superseded frames retained         | n/a                               | 14 of 14, named `Archive / …`, node IDs unchanged                              | Top-level frame listing on `docs/mockups/app.pen`                           |
| Frames composed from `HeroUI/*`    | 0 of 14                           | 14 of 14                                                                       | Component-instance audit of each migrated frame                             |
| Broken code references in handoffs | 3 (`hero.ts` in each token table) | 0                                                                              | Every path cited in a § Tokens table resolves on disk                       |
| Color contrast                     | not measured                      | WCAG AA for all body and control text in light and dark                        | Contrast check of resolved token pairs                                      |
| Web test suite                     | passing                           | passing, with no assertion weakened or removed to accommodate a primitive swap | `pnpm --filter @warehouser/web test` plus diff review of every changed spec |
| Lint and typecheck                 | passing                           | unchanged                                                                      | `pnpm --filter @warehouser/web lint`; `tsc -p apps/web/tsconfig.json`       |

## 6.1 Security / privacy

- **Data classification:** unchanged. This request touches presentation only.
- **Personal data impact:** none. No new field is displayed, collected, logged, or transmitted.
- **Authorization impact:** none by intent, and CR-RG-02 exists to prove it. The migration must not
  make a capability visible that the current-access projection withholds.
- **Security review:** N/A — no authentication, session, authorization, transport, or storage path
  is modified.

## 7. Metrics / KPIs

- **Current frames binding a flat token** — baseline: 14/14, **achieved 0/14**. The file keeps two
  token vocabularies permanently and on purpose: `semantic` for current frames, flat for the archive.
- **Superseded frames retained** — **achieved 14/14**, renamed `Archive / …`, node IDs unchanged.
- **Approved frames composed from `HeroUI/*`** — baseline: 0/14, **achieved 14/14**.
- **Unresolvable code references across the three handoffs** — baseline: 3, **achieved 0**.
- **Behavioral assertions weakened or deleted to make the suite pass** — baseline: 0, **achieved 0**
  (114/114 web tests pass unmodified). Any non-zero value is an abort signal, not a metric.

### Verified token resolution (headless Chrome, 2026-08-09)

| Variable       | No theme attribute (light)    | `data-theme="dark"`           | Board value (light / dark) |
| -------------- | ----------------------------- | ----------------------------- | -------------------------- |
| `--background` | `oklch(0.9702 0 0)`           | `oklch(0.12 0.005 285.823)`   | `#F5F5F5` / `#060607`      |
| `--surface`    | `oklch(100% 0 0)`             | `oklch(0.2103 0.0059 285.89)` | `#FFFFFF` / `#18181B`      |
| `--foreground` | `oklch(0.2103 0.0059 285.89)` | `oklch(0.9911 0 0)`           | `#18181B` / `#FCFCFC`      |
| `--accent`     | `oklch(0.6204 0.195 253.83)`  | `oklch(0.6204 0.195 253.83)`  | `#0485F7` / `#0485F7`      |

`oklch(0.6204 0.195 253.83)` converts to `#0485F7` — the board's accent exactly. Before CH-07 the
application resolved `--accent` to `#4f46e5`, which matched no frame.

## 8. Open questions

Tracked in [`change.md` § 9](./change.md#9-open-questions). Two remain open: whether a user-facing
theme switcher is wanted (default now: no — it is new capability), and confirmation that the
migrated frames need fresh approval before the legacy frames are deleted (default now: yes, per the
frame-immutability rule in all three handoffs).
