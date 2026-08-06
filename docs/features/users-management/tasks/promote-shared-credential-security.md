---
id: T2
title: 'Promote shared email/password validation and hashing to shared/domain/security'
layer: 'domain'
deps: []
acs: []
files_hint:
  ['apps/server/src/shared/domain/security/', 'apps/server/src/auth/domain/']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T2 — Promote shared email/password validation and hashing to shared/domain/security

## Why

[ADR-0001](../adr/0001-shared-credential-rules-for-member-lifecycle.md) requires `users` to reuse
`auth`'s email/password format rules and scrypt hashing without depending on `auth`'s private
domain model. [sad §4](../sad.md) names the target location: `shared/domain/security/`.

## What

Move the email/password value objects (`auth/domain/value-objects/email-address.ts`,
`.../password.ts`), predicates (`auth/domain/predicates/is-supported-email.ts`,
`.../is-supported-password.ts`), and hashing (`auth/domain/security/password.ts`) into
`shared/domain/security/`, together with their existing test suites, with no behavior change.
Update `auth`'s call sites to import from the new shared location.

## Definition of Done

- [ ] The moved suite (unit tests for value objects, predicates, and hashing) passes unchanged.
- [ ] `auth`'s full existing test suite passes unchanged after the import-path update ([sad §11
      risk](../sad.md#11-risks-and-open-questions): "re-run `auth`'s full suite as part of this
      feature's gate, not just `users`'s new tests").
- [ ] No behavior change: same format rules, same hashing algorithm/parameters.
- [ ] lint + vet clean.

## Notes

This is a pure move/refactor — no new logic. Keep the diff reviewable by not touching call-site
logic beyond the import path.
