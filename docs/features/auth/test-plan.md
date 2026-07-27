---
status: Draft
owner: 'QA + implementing engineer'
reviewers: ['Tech Lead', 'Security Lead']
updated_at: '2026-07-25'
feature_size: 'M'
---

# Test plan — auth

This plan verifies that real email/password authentication creates and restores one durable linked
identity, protects credentials and sessions, and remains separate from warehouse authorization.

## Levels

| Level             | Scope                                                                                                                      | Strategy                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| unit              | Email/password rules, normalization, credential-failure equivalence, and session lifetime.                                 | Exercise pure rules in memory with no external dependency.                             |
| component         | Sign-up and sign-in fields, validation, submission, feedback, and accessible states.                                       | Render each UI component in isolation and exercise its output and interactions.        |
| visual-regression | Approved sign-up/sign-in layouts and their responsive and interaction states.                                              | Compare rendered states with approved baselines; accept baseline changes deliberately. |
| integration       | Registration, credential verification, session lifecycle, isolation, and authorization boundaries against the owned store. | Use an ephemeral real relational store spun up for the suite.                          |
| contract          | Auth request, safe response, error-envelope, cookie, and account-isolation boundaries.                                     | Validate real boundary shapes against the agreed contracts without hand-written stubs. |
| e2e               | Backend-spanning failure, authorization, and security flows through real entry points.                                     | Exercise each flow against ephemeral dependencies.                                     |
| e2e-through-UI    | Visitor and Account Holder journeys through the rendered web application.                                                  | Drive the real UI against ephemeral dependencies and observe user-visible outcomes.    |
| load              | Numeric latency, throughput, availability, integrity, expiry, and confidentiality targets.                                 | Generate controlled authentication traffic and measure the stated thresholds.          |

## AC coverage

| AC (spec.md §5)         | Test name (intent-based)                                               | Level                      | Expected outcome                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email input rule        | accepted email boundaries are recognized                               | unit                       | Every allowed local-part and domain boundary is accepted after surrounding whitespace is removed.                                                        |
| Email input rule        | rejected email forms remain invalid on both forms                      | unit + component           | Each prohibited form is rejected consistently and its field explains the correction.                                                                     |
| Password input rule     | password length counts Unicode code points                             | unit                       | Passwords from 8 through 128 code points are accepted and values outside that range are rejected.                                                        |
| Password input rule     | password text is preserved exactly                                     | unit + component           | Leading, trailing, and internal whitespace and all entered characters reach submission unchanged.                                                        |
| AC-01                   | sign-up creates one linked identity and session atomically             | integration                | Exactly one linked Account/User pair and initial persistent session are committed together.                                                              |
| AC-01                   | sign-up boundary returns only the safe authenticated projection        | contract                   | The request and successful response match the agreed shapes, establish the secure session boundary, and expose no credential or reusable session secret. |
| AC-01                   | visitor signs up and receives immediate authenticated access           | e2e-through-UI             | The completed flow confirms success and enters authenticated access as the newly linked User.                                                            |
| AC-01b                  | failed initial session creation rolls back registration                | integration + e2e          | No Account, User, or Session remains, no access is granted, and the caller learns that sign-up did not complete.                                         |
| AC-02                   | invalid sign-up values are rejected by the shared rules                | unit                       | Invalid email and out-of-range password inputs are identified without persistence.                                                                       |
| AC-02                   | invalid sign-up explains the fields to correct                         | component + e2e-through-UI | Associated field messages identify every correction, submission does not proceed, and the Visitor remains anonymous.                                     |
| AC-03                   | normalized duplicate email cannot create a second identity             | integration                | Case and surrounding-whitespace variants lose the uniqueness race and leave exactly the original linked identity.                                        |
| AC-03                   | duplicate sign-up directs the Visitor toward sign-in                   | e2e-through-UI             | No new records or access are created and the UI explains that the email is registered and offers sign-in.                                                |
| AC-04                   | matching credentials create a fixed-expiry session                     | integration                | A new persistent session linked to the existing User is stored with the approved fixed lifetime.                                                         |
| AC-04                   | sign-in boundary returns the safe linked User                          | contract                   | The successful boundary shape establishes the secure session and reveals neither credential data nor a reusable session secret.                          |
| AC-04                   | returning Visitor signs in as the same User                            | e2e-through-UI             | The UI enters authenticated access for the existing linked User without an extra success notification.                                                   |
| AC-05                   | unknown email and wrong password have equivalent public outcomes       | unit + integration         | Both paths perform bounded verification, grant no access, and produce indistinguishable public explanations.                                             |
| AC-05                   | invalid credentials reveal no account-existence signal                 | e2e-through-UI             | Both attempts leave the Visitor anonymous and display the same generic explanation.                                                                      |
| AC-07                   | valid session resolves the same linked User after restart              | integration                | An unrevoked, unexpired session resolves its linked User without changing its expiry.                                                                    |
| AC-07                   | browser restart restores authenticated state before routing            | e2e-through-UI             | Session initialization finishes before the guard decision and the Account Holder is not asked for credentials.                                           |
| AC-08                   | expired session is refused                                             | integration                | The expired session resolves as anonymous and cannot be used for authenticated access.                                                                   |
| AC-08                   | revoked session is refused                                             | integration                | The revoked session resolves as anonymous and cannot be used for authenticated access.                                                                   |
| AC-08                   | invalid persistent session returns the person to sign-in               | e2e-through-UI             | Authenticated access is withheld, browser state becomes anonymous, and the UI explains that sign-in is required.                                         |
| AC-09                   | sign-out revokes only the current session                              | integration                | The represented session is revoked while other sessions remain unchanged; a repeated request completes safely.                                           |
| AC-09                   | Account Holder signs out to Visitor access                             | e2e-through-UI             | The browser loses authenticated state, receives sign-out feedback, and returns to Visitor access.                                                        |
| AC-10                   | authentication does not satisfy warehouse authorization                | integration + e2e          | The linked User is known but the unauthorized capability is denied by its owning authorization rule.                                                     |
| AC-11                   | Account cannot access another Account's auth data                      | integration                | Cross-account credential and session reads or controls are denied without changing either Account.                                                       |
| AC-11                   | auth boundary exposes no cross-account credential or session operation | contract                   | Public boundary shapes reveal no other Account's authentication details or control mechanism.                                                            |
| Approved auth UI states | approved sign-up and sign-in states retain their visual hierarchy      | visual-regression          | Desktop and mobile entry, validation, loading, duplicate, generic failure, expired-session, and success states match approved baselines.                 |

## Edge cases / error paths

- Email local part at 1 and 64 characters, total address at 254 characters, and domain labels at their
  valid boundaries → expected: accepted consistently by sign-up and sign-in.
- Empty local/domain segments, multiple `@` signs, consecutive dots, edge hyphens, whitespace,
  control characters, quoted/display-name/domain-literal forms, non-ASCII address characters, and
  an address longer than 254 characters → expected: rejected with an associated email correction.
- Password at 7, 8, 128, and 129 Unicode code points, including whitespace and multi-code-unit
  characters → expected: only the inclusive 8–128 range is accepted and the exact text is preserved.
- Two concurrent registrations using case or whitespace variants of one email → expected: one
  linked identity succeeds and the other receives the duplicate-email outcome.
- Registration store failure while creating the initial Session → expected: the complete
  Account/User/Session outcome rolls back and the Visitor stays anonymous.
- Sign-in Session persistence failure → expected: authenticated access is withheld and a safe
  unavailable explanation is shown.
- Unknown email and incorrect password → expected: the same generic public explanation and no
  authenticated state in both cases.
- Missing, malformed, expired, revoked, or unknown session value → expected: anonymous state, an
  expired browser session where applicable, and sign-in requested without sensitive detail.
- Sign-out with an absent, expired, or already revoked session → expected: idempotent completion and
  anonymous browser state.
- Sign-out revocation-store failure → expected: sign-out does not report completion and the person
  receives a safe failure explanation.
- Authenticated User without the required warehouse permission → expected: the capability is denied
  without erasing the valid identity session or treating identity as permission.
- Attempt to access another Account's credentials or sessions → expected: access is denied and no
  existence or authentication detail is revealed.
- Unexpected dependency failure in any authentication flow → expected: fail closed, emit one safe
  user-facing failure, and expose no password, session secret, or internal diagnostic detail.

## Test data

- Seed strategy: deterministic factories create paired Account/User identities, valid password-hash
  metadata, and Sessions with synthetic digests and controlled establishment, expiry, and revocation
  times. Scenario fixtures add duplicate-email variants, unauthorized Users, and malformed inputs.
- Integration dependency: an ephemeral real relational store is created for the suite; the datastore
  is never mocked.
- Cleanup boundary: reset the store per test and destroy the ephemeral instance after the suite so
  concurrency, rollback, expiry, and revocation scenarios remain independent.
- Secret discipline: fixtures use non-production synthetic values; assertions inspect only safe
  projections and verify that reusable secrets and entered passwords do not appear in persisted
  records, telemetry, logs, analytics, or user-visible output.

## NFR validation (load)

- Sign-up latency p95 ≤ 500 ms → run 10 terminal sign-up outcomes per second for 10 minutes with
  successful and rejected outcomes represented; assert sign-up p95 server latency ≤ 500 ms.
- Sign-in latency p95 ≤ 500 ms → run 10 terminal sign-in outcomes per second for 10 minutes with
  successful and rejected outcomes represented; assert sign-in p95 server latency ≤ 500 ms.
- Authentication throughput ≥ 20 terminal outcomes per second per service instance → sustain 20
  outcomes per second for 10 minutes with an even sign-up/sign-in mix and both successful and
  rejected outcomes; assert achieved terminal throughput ≥ 20 outcomes per second.
- Availability ≥ 99.9% of eligible attempts per calendar month → use the 20-outcome-per-second,
  10-minute mixed scenario as a release proxy and assert ≥ 99.9% of eligible attempts reach a
  business outcome; production telemetry remains the authority for the calendar-month target.
- Account/User atomicity is 100% complete pairs and 0 orphans → run 20 sign-ups per second for 10
  minutes, including duplicate races and injected registration-store failures; assert 100% of
  completed sign-ups contain exactly one linked pair and the orphan count is 0.
- Session lifetime is exactly 30 days and is not extended by activity or restart → establish and
  resolve 20 sessions per second for 10 minutes across controlled times immediately before, at, and
  after expiry; assert every expiry equals establishment plus 30 days and 0 resolutions extend it.
- Credential confidentiality permits 0 plaintext passwords or reusable session secrets → run the
  mixed 20-outcome-per-second scenario for 10 minutes, then inspect storage, telemetry, logs,
  analytics, and captured user-visible output; assert 0 occurrences of submitted plaintext
  passwords or reusable session secrets.

## CI placement

- On every PR: unit, component, contract, integration, and focused visual-regression suites.
- On schedule or pre-release: e2e, e2e-through-UI, the full visual-regression matrix, and load suites.
- Before release: require the specification's product/security approvals and review the
  confidentiality and authorization results with the Security Lead.

## Review record

- Level mapping: accepted by the user on 2026-07-25 without changes.
- Edits log: initial proposal → Accept; no Fix, Save-as-OQ, or Drop actions recorded.
