---
status: pending-approval
design_file: ../../mockups/app.pen
approved_frame: 'Auth / Focused Gateway / Sign In / Desktop / v4'
approved_node_id: 'nRADw'
approved_frames:
  - name: 'Auth / Focused Gateway / Create Account / Desktop / v3'
    node_id: 'c76G2X'
  - name: 'Auth / Focused Gateway / Create Account / Mobile / v3'
    node_id: 'h5tGr'
  - name: 'Auth / Focused Gateway / Sign In / Desktop / v4'
    node_id: 'nRADw'
  - name: 'Auth / Focused Gateway / Sign In / Mobile / v4'
    node_id: 'XMgcQ'
  - name: 'Auth / Required States / Desktop / v2'
    node_id: 'BDGNF'
  - name: 'Auth / Required States / Mobile / v2'
    node_id: 'dD3r5'
superseded_at: '2026-08-09'
superseded_by: 'change-request:design-migration'
baseline_revision: 'a7b0c9b5edb27b90b9fc348e9a0547bba18cdede'
migrated_from:
  - name: 'Archive / Auth / Focused Gateway / Create Account / Desktop / v2'
    node_id: 'E9i5Ma'
  - name: 'Archive / Auth / Focused Gateway / Create Account / Mobile / v2'
    node_id: 'WSRa3'
  - name: 'Archive / Auth / Focused Gateway / Sign In / Desktop / v2'
    node_id: 'lYkRJ'
  - name: 'Archive / Auth / Focused Gateway / Sign In / Mobile / v2'
    node_id: 'ZlykT'
  - name: 'Archive / Auth / Required States / Desktop / v1'
    node_id: 'iwzam'
  - name: 'Archive / Auth / Required States / Mobile / v1'
    node_id: 'NC8C7'
previously_approved_at: '2026-07-25'
previously_approved_by: 'User'
target_surfaces: ['web-frontend']
viewports: ['desktop 1440x900', 'mobile 390x844']
---

# UI design handoff: auth

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

- Selected alternative: Focused Gateway v2, with separate create-account and sign-in screens in one visual system.
- Approval evidence: The user explicitly approved all four Focused Gateway v2 frames and both Required States v1 frames in the design review conversation on 2026-07-25.
- Canonical source: `docs/mockups/app.pen` and the exact approved node IDs in the front matter. Approved frames are immutable; revisions require new versioned frames.
- Versioning: an approved frame is immutable. A revision creates a **new** versioned frame; the
  superseded one is renamed with an `Archive / ` prefix and kept forever, keeping its node ID so
  `migrated_from` pins keep resolving. Never delete an archived frame, and never delete a token it
  still binds. The top-level `Version history` frame in `docs/mockups/app.pen` is the index.
- Preview files:
  - `docs/features/auth/previews/c76G2X.png`
  - `docs/features/auth/previews/h5tGr.png`
  - `docs/features/auth/previews/nRADw.png`
  - `docs/features/auth/previews/XMgcQ.png`
  - `docs/features/auth/previews/BDGNF.png`
  - `docs/features/auth/previews/dD3r5.png`

### As-implemented pass (2026-08-09)

A second pass under `change-request:design-migration` rebuilt the frames that `apps/web` actually
ships, so this handoff records shipped UI rather than intent that drifted. The pass-1 frames are
archived, not deleted. What changed to match the code: segmented tabs at both viewports, plain
(icon-less) outcome lists, a `Show` text affordance instead of an eye icon on password reveal, and a
bordered trust box instead of a soft-surface alert.

**No implemented counterpart.** `Auth / Focused Gateway / Create Account / Desktop|Mobile / v3`
(`c76G2X`, `h5tGr`) stay at their pass-1 version and were **not** rebuilt: the application has no
two-field create-account screen. `/sign-up` collects email, password **and warehouse name**, so the
shipped screen is `Access / Registration / … / v3` in the access handoff. Either delete these frames
from the auth scope or build the screen they describe — right now they document a screen that does
not exist. `Auth / Required States / … / v2` is a state-coverage board, not a route, so it has no
as-implemented counterpart either.

## Component mapping

| Pencil component/node                | Existing code primitive                                                      | Adaptation allowed                                                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HeroUI / Auth Text Field` (`IplNB`) | HeroUI `Input` in `apps/web/src/modules/auth/login/components/LoginForm.tsx` | Configure label, type, leading/trailing Lucide icon, helper text, `isInvalid`, and `errorMessage`; retain HeroUI validation behavior.                                                      |
| `HeroUI / Primary Button` (`L80Scv`) | HeroUI `Button`                                                              | Change action label and loading state per flow; retain `color="primary"`, full-width form treatment, and disabled behavior while submitting.                                               |
| `HeroUI / Inline Message` (`GxaOq`)  | HeroUI field errors plus the repository error-feedback policy                | Use inline field errors for field-specific validation. API failures also require the shared error toast; do not add a duplicate form banner.                                               |
| Create-account and sign-in cards     | HeroUI `Card`, `CardHeader`, and `CardBody`                                  | Preserve 460 px desktop card width, 32 px card padding, 12 px radius, subtle border/shadow, and one primary action. On mobile, remove the card boundary and use the page surface directly. |
| Minimal header                       | Existing `RootLayout` extension using HeroUI `Link`/`Button` primitives      | Keep the Warehouser mark on the left and the opposite auth-flow link on the right. Use `ROUTES` constants rather than path literals.                                                       |
| Email/password workflows             | Module-local React Hook Form components orchestrated by auth pages           | Keep sign-up and sign-in as distinct screens/components while sharing reusable presentational primitives where behavior is genuinely identical.                                            |
| Lucide icons                         | Repository-compatible Lucide icon convention represented in Pencil           | Use the named icons or the closest Lucide equivalents; icons supplement visible text and never replace essential labels.                                                                   |

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

- Desktop uses a fixed 80 px header and a centered two-zone body: contextual explanation on the left and a 460 px authentication card on the right.
- Between 720 px and 1439 px, preserve the card as the dominant region, reduce outer padding and inter-column gap, and allow the contextual column to narrow. Do not introduce horizontal scrolling.
- Below 720 px, switch to the approved 390 px single-column hierarchy. Keep the 68 px header, move the opposite-flow action to the header link, remove the desktop card boundary/shadow, and stack all form and trust content.
- Form controls and the primary action fill the available mobile width. Minimum interactive target height is 44 px.
- Content may grow vertically for localization and validation messages. Do not clip helper or error copy; allow the page to scroll in production when viewport height is shorter than the approved frame.

## States and interactions

- Entry: create-account and sign-in are separate routes/screens. Each header links to the other flow.
- Create account: submit a valid email and password, disable controls during submission, show the button loading state, and navigate only after Account, User, and initial session creation complete atomically.
- Sign in: submit normalized email with the password preserved exactly. Disable controls during submission and use the same generic failure copy for unknown email and incorrect password.
- Validation: show email and password corrections through HeroUI's associated inline field errors. Password whitespace is significant and must not be trimmed.
- Duplicate sign-up: explain that the email is already registered and offer the sign-in route.
- Loading/disabled: expose a textual loading label and spinner; disabled styling must retain readable contrast. Do not rely on animation to communicate progress.
- Session restoration: restore a valid persistent session without showing credentials or an intermediate success notification.
- Expired/revoked session: return to sign-in and explain that the session ended without exposing security-sensitive detail.
- Success: successful sign-up receives action-specific success feedback after the entire workflow completes. Successful sign-in navigates without a success toast. Sign-out receives action-specific success feedback after revocation completes.
- API errors: follow `docs/system/guides/web-error-handling.md`; every API failure receives one translated, deduplicated error toast. Field errors remain inline.
- Authorization: authentication does not imply warehouse permission. Render the owning capability's denied state without exposing another Account's credentials or sessions.
- Empty state: not applicable to credential forms; absence of input is handled as validation.
- Hover: preserve HeroUI hover treatments. The primary action remains the only visually dominant action.
- Focus: use a clearly visible 2 px primary-colored focus indicator with sufficient offset/contrast.
- Motion: no motion is required. Honor reduced-motion preferences for any implementation-added transitions or spinners.

## Accessibility

- Use semantic form, heading, input, button, and link elements provided by HeroUI and React.
- Keep visible `Email` and `Password` labels at all times; placeholders are examples, not labels.
- Associate helper and validation text with its input and announce new errors through the form library/HeroUI behavior.
- Desktop keyboard order is brand/navigation, opposite-flow action, email, password, show-password control, and submit. Mobile follows the same logical order.
- The password visibility control requires an accessible name that changes between “Show password” and “Hide password.”
- Move focus to the first invalid field after client or mapped server validation. On expired-session redirects, focus the sign-in heading or explanatory message.
- Generic sign-in failure must not disclose whether the submitted email exists.
- Do not communicate error, success, warning, focus, or authorization state through color alone.
- Preserve WCAG AA contrast intent for text and controls and provide a persistent visible focus indicator.
- Respect reduced-motion preferences and provide textual loading state independent of spinner motion.

## Implementation constraints

- Reuse HeroUI from `@heroui/react` and the semantic tokens implemented in `apps/web/src/styles/global.css`; do not add a second component or styling system.
- Preserve separate sign-up and sign-in workflows while extracting only genuinely shared form presentation.
- Keep routing concerns in route files, workflow orchestration in pages, and local form/validation behavior in module components, following `docs/system/frontend-architecture.md`.
- Declare all paths in `apps/web/src/shared/constants/routes.ts`.
- Use React Hook Form and contract/browser Zod schemas according to the repository validation ownership rules.
- Route API failures, translated copy, inline errors, and notifications through `docs/system/guides/web-error-handling.md`.
- Authentication state must use the accepted architecture and must not introduce browser local-storage token persistence.
- Preserve the approved visual invariants: one primary action, 44 px controls, persistent labels, 12 px maximum card/input radius, 460 px desktop card, restrained border/shadow, opposite-flow header action, and the desktop-to-mobile hierarchy.
- Implementation must compare both flows and their required states against the approved previews and report every visible deviation.

## Approved deviations

N/A until implementation review.

## Open questions

- Architecture must decide cookie/token transport, session restoration, expiry, and logout behavior before UI implementation planning. Owner: Tech Lead/Security Lead; due: architecture-design stage.
- The feature specification is still marked `Draft`; product and security approval remain upstream release gates even though the UI frames are approved. Owner: Product Manager/Security Lead; due: before implementation.
