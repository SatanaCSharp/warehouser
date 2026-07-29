---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Frontend Lead', 'Backend Lead']
updated_at: '2026-07-25'
feature_size: 'M'
ticket: ''
---

# 0001 — Server-managed opaque cookie sessions

## Context

The auth feature must restore a browser session after restart, revoke the current session on
sign-out, enforce a fixed 30-day lifetime, keep reusable session material out of JavaScript-visible
storage, and resolve authentication before route guards decide navigation. The system architecture
deliberately left token transport, refresh, expiry, and restoration open for this production
feature.

This decision affects `apps/web`, `apps/server`, the HTTP contract, persistence, deployment
configuration, and security operations. Changing it later would require coordinated migration of
active sessions and both sides of the boundary, so it passes the feature ADR blast-radius gate.

## Decision drivers

- Reusable session secrets must not be readable by browser JavaScript or stored in plaintext.
- Revocation and fixed server-enforced expiry must take effect on every authenticated request.
- Browser restoration must not require persisting a bearer token in Redux or local storage.
- Current-browser sign-out must invalidate server authority, not only clear client state.
- The first release should avoid refresh-token rotation and key-rollover machinery that its
  requirements do not otherwise need.
- Cross-site request and credentialed-origin controls must be explicit and testable.

## Considered options

1. **Opaque random session secret in an `HttpOnly` cookie, with only its digest stored server-side.**
   Each request resolves the digest to a non-expired, non-revoked session. This makes revocation
   immediate and keeps the browser state minimal, at the cost of a database lookup per protected
   request and durable session storage.
2. **Signed access token in an `HttpOnly` cookie plus a rotating, server-recorded refresh token.**
   Short-lived access validation can avoid a database session lookup, while refresh rotation
   supports restoration and revocation. It is legitimate, but introduces two credential
   lifecycles, signing-key rotation, refresh replay detection, and a revocation-delay policy for
   already-issued access tokens.
3. **In-memory access token plus a refresh credential in an `HttpOnly` cookie.** This keeps the
   access token out of durable browser storage, but restoration still requires refresh rotation and
   the web must coordinate access-token renewal and failed-request replay. It adds client and server
   state machinery without improving the fixed-lifetime requirement for this release.

Storing a bearer token in local storage is not a considered option because it violates the
repository's frontend security constraint; it is not used as the comparison that decides among the
three legitimate choices above.

## Decision outcome

Chosen: **opaque random session secret in an `HttpOnly` cookie, with only its digest stored
server-side**.

The server issues a fresh high-entropy secret after sign-up or sign-in. The cookie is host-only,
`HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production, with a fixed 30-day expiry.
State-changing auth operations also validate the configured application origin; credentialed CORS
uses an explicit allowlist. Every authenticated request validates the server record's expiry and
revocation state. Sign-out revokes that record and expires the cookie.

## Consequences

### Positive

- Revocation and expiry have one authoritative server-side check.
- No reusable session secret enters Redux, local storage, application logs, or API response bodies.
- Browser restoration and current-browser sign-out are direct operations with no refresh protocol.
- Server-side audit and integrity metrics can use Session records without exposing raw secrets.

### Negative

- Protected requests require a session-store lookup unless a later measured optimization adds a
  bounded cache without weakening revocation semantics.
- Session rows require indexing, retention/cleanup policy, and operational monitoring.
- Cookie authentication requires explicit origin, CORS, proxy/TLS, and cookie-attribute
  configuration.

### Neutral

- The HTTP API uses cookie authentication rather than the repository API template's default bearer
  scheme; the auth OpenAPI contract must declare the actual cookie security scheme.
- The browser holds only a safe identity projection and a tri-state restoration status; the cookie
  remains inaccessible to application code.
- Migrating to signed access tokens later would be a new decision and require active-session
  migration or forced reauthentication.

## Links

- [Auth feature SAD](../sad.md)
- [Auth specification](../spec.md)
- [System SAD](../../../system/sad.md)
- [Frontend architecture](../../../system/frontend-architecture.md)
- [ADR blast-radius gate](../../../../ai/skills/design/references/blast-radius.md)
