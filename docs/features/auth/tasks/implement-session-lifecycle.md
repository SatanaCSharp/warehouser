---
id: T7
title: 'Implement sign-in, restoration, and sign-out use cases'
layer: 'app'
deps: ['T3', 'T4', 'T5']
acs: ['AC-04', 'AC-05', 'AC-07', 'AC-08', 'AC-09', 'AC-10', 'AC-11']
dod: 'Application tests prove generic credential failure, durable Session establishment, valid restoration, anonymous expired/revoked outcomes, current-session-only revocation, and identity-only principals.'
files_hint:
  [
    'apps/server/src/auth/usecases/commands/sign-in',
    'apps/server/src/auth/usecases/commands/sign-out',
    'apps/server/src/auth/usecases/queries/current-session',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T7 — Implement sign-in, restoration, and sign-out use cases

## Why

The Session lifecycle derives from [sad.md §6.2–§6.5](../sad.md), [ADR 0001](../adr/0001-server-managed-opaque-cookie-sessions.md), and [spec AC-04–AC-11](../spec.md).

## What

Implement credential verification and Session creation, current-session resolution, and current-session revocation as distinct commands/queries sharing domain ports and safe outcomes.

## Definition of Done

- [ ] Tests prove correct credentials create a new fixed-expiry Session and unknown email uses bounded dummy verification.
- [ ] Unknown email and incorrect password produce the same public application failure.
- [ ] Tests prove valid restoration returns only `userId`, while absent, malformed, expired, and revoked Sessions return anonymous.
- [ ] Tests prove sign-out revokes only the current digest and is idempotent unless a real persistence failure occurs.
- [ ] Server test, lint, and static analysis pass.

## Notes

No use case exposes another Account's credentials/Sessions or evaluates a warehouse permission.
