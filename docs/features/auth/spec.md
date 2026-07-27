---
status: Draft
owner: 'PM + Tech Lead'
reviewers: ['Tech Lead', 'Security Lead']
updated_at: '2026-07-25'
feature_size: 'M'
---

# Spec — auth

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** `docs/system/architecture-map.md`, `docs/system/sad.md`, `apps/web/src/modules/auth/login/`, `apps/web/src/store/slices/authSlice.ts`, `apps/web/src/guards/auth.guard.ts`, and the Warehouser domain notebook.

## 1. Context

Warehouser currently lets a Visitor enter any syntactically valid email and password and become authenticated through a mock browser-only flow. There is no durable Account, no credential verification, and no trustworthy way to associate authenticated access with a warehouse-domain User.

Real authentication is needed now because protected Warehouser capabilities cannot safely rely on a mock identity. The feature must establish a durable personal identity while preserving the distinction between proving who someone is and deciding which warehouse capabilities that person may use.

The committed approach is a deliberately minimal email/password journey: sign-up atomically creates one Account and one User, immediately establishes a persistent session, and sign-in restores access for returning people. This follows the lowest-friction pattern found in adjacent products while addressing credential abuse through generic sign-in failures, monitoring, revocable sessions, and an explicit security review.

The domain notebook contained no authentication rules. The requirements therefore use the user's approved decisions and conservative bundle recorded during the interview: one-to-one Account/User ownership, immediate access without email verification, globally unique normalized emails, passwords of 8–128 characters, persistent sessions, and sign-out.

- **Decision override: glossary role coverage** — Account and User are explicitly defined domain objects, not actors; Visitor and Account Holder are the two roles requiring user-story coverage.

## 2. Goals

- Replace mock identity with durable email/password authentication tied to exactly one warehouse-domain User.
- Let new and returning people reach authenticated Warehouser capabilities through short, understandable sign-up and sign-in journeys.
- Keep credentials and sessions confidential, resist automated credential abuse, and preserve authorization as a separate decision.

## 3. Non-goals

- Email ownership verification is excluded because immediate access after sign-up is an approved requirement for this release.
- Password recovery is excluded to keep the first release focused; demand will be measured before prioritization.
- Email-address changes are excluded because identity mutation and re-verification require a separate lifecycle specification.
- Social, enterprise, and multi-factor authentication are excluded because this release establishes only the email/password baseline.
- Automated sign-in and sign-up attempt limiting is excluded from this minimal release; monitoring and the required security review will inform a later abuse-control specification.

## 4. User stories

### US-01: Create an identity

**As a** Visitor
**I want** to sign up with my email and password
**So that** I can immediately use authenticated Warehouser capabilities

### US-02: Return to Warehouser

**As a** Visitor
**I want** to sign in with my existing credentials
**So that** I can continue as the same User

### US-03: Resume my session

**As an** Account Holder
**I want** my valid session to survive a browser restart
**So that** I do not need to sign in on every visit

### US-04: End my session

**As an** Account Holder
**I want** to sign out
**So that** the current browser no longer has authenticated access

### US-05: Preserve access boundaries

**As an** Account Holder
**I want** authentication and warehouse authorization evaluated separately
**So that** my identity does not grant capabilities I am not entitled to use

## 5. Acceptance criteria

### Authentication input rules

- After surrounding whitespace is removed, an accepted email address is at most 254 ASCII characters and has exactly one `@`: a 1–64-character local part followed by a domain with at least two dot-separated labels. The local part uses letters, digits, ``!#$%&'*+/=?^_`{|}~-``, or single dots between non-empty segments. Each domain label uses letters, digits, or internal hyphens and neither starts nor ends with a hyphen. Whitespace, control characters, quoted local parts, comments, display names, domain literals, consecutive dots, and internationalized addresses are not accepted in this release. Sign-up surfaces apply the same rule.
- A password contains 8–128 Unicode code points inclusive and is preserved exactly as entered. Leading, trailing, and internal whitespace is allowed, counted, and significant. Sign-up and sign-in do not trim, collapse, change case, normalize, or silently truncate passwords.

### AC-01 (US-01) — happy

**Given** a Visitor provides an unused valid email and a password of 8–128 characters
**When** the Visitor signs up
**Then** the system creates exactly one linked Account and User and their initial persistent session as one outcome, and confirms immediate authenticated access

### AC-01b (US-01) — error

**Given** a Visitor provides an unused valid email and a password of 8–128 characters
**When** sign-up cannot establish the initial persistent session
**Then** the system creates neither an Account nor a User, grants no authenticated access, and explains that sign-up did not complete

### AC-02 (US-01) — error

**Given** a Visitor provides an invalid email or a password outside the accepted length
**When** the Visitor attempts to sign up
**Then** the system creates neither an Account nor a User and explains which input must be corrected

### AC-03 (US-01) — domain invariant

**Given** an Account already owns the submitted email after surrounding whitespace is removed and letter case is ignored
**When** a Visitor attempts to sign up with that email
**Then** the system creates neither an Account nor a User and explains that the email is already registered

### AC-04 (US-02) — happy

**Given** a Visitor has an existing Account
**When** the Visitor signs in with the matching normalized email and password
**Then** the system establishes a persistent session for the linked User and confirms authenticated access

### AC-05 (US-02) — error

**Given** a Visitor supplies an unknown email or an incorrect password
**When** the Visitor attempts to sign in
**Then** the system denies authenticated access and gives the same generic explanation in either case

### AC-07 (US-03) — happy

**Given** an Account Holder has a valid persistent session
**When** the Account Holder returns after restarting the browser
**Then** the system restores authenticated state for the same linked User without requesting credentials again

### AC-08 (US-03) — error

**Given** a persistent session has expired or been revoked
**When** a person returns with that session
**Then** the system withholds authenticated access and asks the person to sign in again

### AC-09 (US-04) — happy

**Given** an Account Holder has a valid session in the current browser
**When** the Account Holder signs out
**Then** the system revokes that session, removes authenticated state from the browser, and returns the person to Visitor access

### AC-10 (US-05) — cross-context

**Given** an Account Holder is authenticated but the linked User lacks permission for a warehouse capability
**When** the Account Holder attempts to use that capability
**Then** the system denies the capability according to its authorization rules without treating authentication as permission

### AC-11 (US-05) — authorization

**Given** an Account Holder attempts to view or control another Account's credentials or sessions
**When** the Account Holder makes the attempt
**Then** the system denies access without revealing the other Account's authentication details

## 6. Non-functional requirements

| Aspect                     | Target                                                                                                                                                                                    | Measurement                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Sign-up latency            | p95 ≤ 500 ms, excluding client network time                                                                                                                                               | Production authentication latency                                    |
| Sign-in latency            | p95 ≤ 500 ms, excluding client network time                                                                                                                                               | Production authentication latency                                    |
| Authentication throughput  | ≥ 20 terminal sign-up or sign-in outcomes per second per running service instance, sustained for 10 minutes with successful and rejected outcomes represented                             | Automated load smoke test using an even sign-up/sign-in workload mix |
| Availability               | ≥ 99.9% of eligible production sign-up and sign-in attempts reach a business outcome per calendar month; client-abandoned requests are excluded and service failures count as unavailable | Monthly ratio from authentication attempt and outcome telemetry      |
| Account/User atomicity     | 100% of completed sign-ups create one linked pair; 0 orphan records                                                                                                                       | Production integrity metric and reconciliation check                 |
| Session lifetime           | Expire 30 days after the session is established by successful sign-up or sign-in; activity and browser restarts do not extend it                                                          | Session-expiry integration checks and production audit metric        |
| Credential confidentiality | 0 plaintext passwords or reusable session secrets in storage, logs, analytics, or user-visible output                                                                                     | Automated secret-leak checks and quarterly security review           |

## 6.1 Security / privacy

- **Data classification:** confidential — email addresses, password credentials, and session secrets enable identification or account access.
- **Personal data touched:** normalized email address (personal identifier), password credential (authentication secret), and session metadata (security-sensitive activity data).
- **AuthZ/AuthN impact:** adds Account authentication and persistent sessions; every protected capability must still authorize the linked User independently.
- **Abuse cases:**
  - Credential stuffing: use indistinguishable sign-in failures and monitor failed-to-successful attempt patterns; automated attempt limiting is deferred to a later abuse-control specification.
  - Account discovery: do not distinguish unknown-email and incorrect-password sign-in outcomes; the approved duplicate sign-up explanation remains an intentional disclosure.
  - Unverified-email impersonation: treat email as a sign-in identifier, not proof of ownership, and measure disputes over already-registered addresses.
  - Session theft: expire and revoke sessions, remove the current session on sign-out, and never expose reusable session secrets.
  - Automated sign-up abuse: monitor junk-account creation; automated attempt limiting is deferred to a later abuse-control specification.
- **Security review:** Required because this M-sized feature introduces credentials, personal data, sessions, and the application authentication boundary.

## 7. Metrics / KPIs

- **Successful sign-up completion** — baseline: 0 real sign-ups, target: ≥95% of valid sign-up attempts complete within 30 days of release.
- **Successful returning sign-in** — baseline: 0 real sign-ins, target: ≥98% of attempts with correct credentials complete within 30 days of release.
- **Authentication-related access incidents** — baseline: no production authentication boundary, target: 0 confirmed unauthorized-access incidents in the first 90 days.
- **Authentication support burden** — baseline: no real-auth tickets, target: fewer than 3% of active Account Holders create an authentication support ticket within the first 30 days.
- **Orphan identity rate** — baseline: 0 durable identities, target: 0 Accounts without Users and 0 Users without Accounts at all times.

## 8. Open questions

- [ ] What volume of forgotten-password reports should trigger a password-recovery feature? Default now: prioritize when authentication support tickets exceed 3% of active Account Holders in a rolling 30-day window. — owner: Product Manager, due: 30 days after release
- [ ] What rate of email-ownership disputes should trigger mandatory email verification? Default now: prioritize when disputes exceed 0.5% of new Accounts in a rolling 30-day window. — owner: Product Manager + Security Lead, due: 30 days after release
- [ ] Do any deployed or seeded User records need migration into the one-to-one Account model? Default now: none; implementation must verify before creating migrations. — owner: Tech Lead, due: before `sdd:data-model auth`

## Assumptions ledger

- The approved “auto mode” authorizes conservative decisions not contradicted by repository evidence.
- Only active Accounts exist in this scope; suspended, disabled, locked, or deleted Account states require a later lifecycle specification.
- Sign-out revokes only the session in the current browser; managing or revoking other devices is out of scope.
- Authentication proves control of credentials but grants no warehouse permission by itself.
- The current mock browser identity has no production identity history to preserve unless the migration open question proves otherwise.
