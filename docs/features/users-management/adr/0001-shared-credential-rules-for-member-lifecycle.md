---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Backend Lead']
updated_at: '2026-08-06'
feature_size: 'M'
ticket: ''
---

# 0001 — Shared credential validation and hashing for member lifecycle

## Context

This feature adds manager-driven creation of a Warehouse Member's credential (email + initial
password) and manager-driven credential changes (email, password) against an existing member. The
approved specification is explicit that these operations "reuse the exact rules already enforced
at registration" and that "this feature defines no separate credential policy" (`spec.md` §5 note).

Today, email format, password length, email normalization, and scrypt password hashing are private
to the `auth` module: `isSupportedEmail`, `isSupportedPassword`, `EmailAddress`, `Password`, and
`hashPassword`/`verifyPassword` all live under `auth/domain/*` and are consumed only by
`RegisterCommand` and the sign-in flow. A second module now needs the identical rules for the same
kind of boundary (raw user-supplied email/password becoming a stored credential). The server
architecture's module rule states: "Keep code in the owning module until it is genuinely reused"
([server architecture](../../../system/server-architecture.md)) — that condition is now met.

This affects the existing `auth` module (its imports move to a shared location) and the new `users`
module (see `sad.md` §4–§5), is reviewed by the same Security Lead who owns credential handling, and
reverting to per-module duplication later would reintroduce the exact credential-policy drift the
specification rules out. It therefore passes the feature ADR blast-radius gate.

## Decision drivers

- The specification forbids a second, independently-evolving credential policy.
- The access feature's own precedent for a cross-module boundary (registration calling access
  provisioning) deliberately avoided one module reaching into another's domain internals; the same
  norm should apply here rather than being silently broken for convenience.
- Scrypt parameters, password length bounds, and email format/normalization must stay identical
  everywhere a credential is created or changed, including this feature's future self-service
  password-change work (`spec.md` §8 open questions).

## Considered options

1. **Promote the email/password predicates, value objects, and hashing functions from
   `auth/domain/*` to `shared/domain/security/`.** Both `auth` and the new `users` module import the
   same functions. `auth`'s existing call sites are updated to the new import path; behavior is
   unchanged.
2. **Let the `users` module import directly from `auth/domain/*`.** No code moves, but a
   feature module would depend on another feature module's private domain internals, which the
   access feature explicitly avoided for the analogous registration case and which makes `auth`'s
   internal refactoring silently breaking for an unrelated module.
3. **Duplicate the email/password rules and scrypt parameters inside the `users` module.** Keeps
   both modules independent, but is the exact drift risk the specification calls out as
   unacceptable, and doubles the surface that must change if password/email policy ever changes.

## Decision outcome

Chosen: **promote the shared rules to `shared/domain/security/`** (option 1).

`shared/domain/security/` gains the email value object and `isSupportedEmail` predicate, the
password value object and `isSupportedPassword` predicate, and the scrypt
`hashPassword`/`verifyPassword`/`dummyVerifyPassword` functions together with the
`PasswordCredential` shape they produce. `auth`'s domain entities, `RegisterCommand`, and the
sign-in command import from this new location instead of their previous local path; their behavior,
tests, and the auth ADR's session model are unaffected. The new `users` module imports only these
shared functions — never `auth/domain/entities` or any other `auth`-owned domain object — and maps
validated, normalized primitives directly into the shared `AuthenticationRepository`'s
identity-write methods (`sad.md` §5).

## Consequences

### Positive

- One place defines what counts as a supported email/password and how a password is hashed;
  `users`, `auth`, and any future self-service password-change feature share it by construction.
- The `users` module never depends on `auth`'s private domain model, preserving the same module
  decoupling precedent the access feature already established for registration.
- Changing password/email policy in the future is a one-file change with two consumers to verify,
  not a hunt for duplicated logic.

### Negative

- `auth`'s existing files move and their imports change; this feature's implementation must update
  and re-run `auth`'s existing unit tests as part of the change, even though `auth`'s own scope is
  otherwise untouched.
- `shared/domain/security/` is a new subdirectory the server architecture guide does not yet
  document; `docs/system/server-architecture.md` should gain one line noting it once implemented.

### Neutral

- The moved functions remain framework-independent (no NestJS/HTTP/TypeORM imports), consistent
  with the existing `shared/domain/entities` and `shared/domain/repositories` boundary rules.

## Links

- [users-management feature SAD](../sad.md)
- [users-management specification](../spec.md)
- [Server architecture](../../../system/server-architecture.md)
- [access feature SAD](../../access/sad.md)
- [auth feature SAD](../../auth/sad.md)
- [ADR blast-radius gate](../../../../.claude/skills/design/references/blast-radius.md)
