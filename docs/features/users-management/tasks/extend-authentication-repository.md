---
id: T5
title: 'Extend AuthenticationRepository with identity-lifecycle and bulk session operations'
layer: 'infra'
deps: []
acs: []
files_hint:
  ['apps/server/src/shared/domain/repositories/authentication.repository.ts']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T5 — Extend AuthenticationRepository with identity-lifecycle and bulk session operations

## Why

[data-model.md §Repository boundaries](../data-model.md#repository-boundaries) requires six new
methods on the existing, `auth`-authored `AuthenticationRepository` (already placed under
`shared/`) to support creation, email/password change, and deletion.

## What

Add `createIdentity(input)` (inserts `accounts` + `users`, no `sessions` row — the same two inserts
`createRegistration` performs minus the session insert), `updateEmail(accountId, normalizedEmail,
updatedAt)`, `updateCredential(accountId, credential, updatedAt)`,
`revokeSessionsByAccountId(accountId, at)` (bulk sibling of the existing single-digest
`revokeSessionByDigest`, returns the affected count), `deleteSessionsByAccountId(accountId)`, and
`deleteIdentity(identityId)` (deletes `users` then `accounts`). Follow the exact ordering
[data-model.md §"Deletion sequencing"](../data-model.md#deletion-sequencing-a-schema-constraint-the-sad-narrative-must-satisfy)
specifies for the delete-path methods.

## Definition of Done

- [ ] Repository integration tests cover: `createIdentity` produces an Account+User pair with zero
      Sessions; `updateEmail`/`updateCredential` update exactly the target row; `revokeSessionsByAccountId`
      asserts **only** the target account's Sessions move to `revoked_at` (the `sad §11` risk this
      method specifically calls out) and returns the correct count; `deleteSessionsByAccountId` and
      `deleteIdentity` succeed only when called in the documented order (memberships → sessions →
      users/accounts) and fail with the existing `RESTRICT` FK error otherwise.
- [ ] `findAccountByNormalizedEmail` (existing) is reused unmodified — not reimplemented.
- [ ] lint + vet clean.

## Notes

`deleteIdentity`'s `users`/`accounts` deletion order is immaterial — the FK pair between them is
`INITIALLY DEFERRED`, checked only at `COMMIT`.
