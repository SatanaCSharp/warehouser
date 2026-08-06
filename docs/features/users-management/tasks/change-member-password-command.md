---
id: T11
title: 'Implement ChangeMemberPasswordCommand'
layer: 'app'
deps: ['T2', 'T3', 'T4', 'T5', 'T7']
acs: ['AC-06', 'AC-07', 'AC-09', 'AC-14', 'AC-18', 'AC-19']
files_hint:
  ['apps/server/src/users/usecases/commands/change-member-password.command.ts']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T11 — Implement ChangeMemberPasswordCommand

## Why

Implements the password-change flow [sad §6.3](../sad.md#63-change-a-members-password): identical
target-resolution and invariant checks to email-change, plus password-length validation and bulk
Session revocation.

## What

Add `users/usecases/commands/change-member-password.command.ts`, mirroring
[T10](./change-member-email-command.md)'s target lookup and self-action/protected-Manager/
Permission-exceeded checks (AC-09, AC-18, AC-14, AC-19), with password length validation (AC-07) in
place of email format. On success, in the same transaction: hash and update the target Account's
credential, then bulk-revoke every non-revoked Session for the target's Account
(`AuthenticationRepository.revokeSessionsByAccountId`) (AC-06).

## Definition of Done

- [ ] Command integration test: happy path records the new credential and revokes every prior
      Session for the target's Account — assert the exact count returned by
      `revokeSessionsByAccountId`, and that a different account's Sessions are untouched (AC-06).
- [ ] Command integration test: password outside the accepted length makes no change (AC-07).
- [ ] Command integration test: missing/cross-Warehouse target denies without disclosing existence
      (AC-09).
- [ ] Command integration test: self-targeting is blocked (AC-18).
- [ ] Command integration test: target holding the Warehouse Manager Role is blocked (AC-14).
- [ ] Command integration test: target whose Role's Permissions exceed the actor's own is blocked
      (AC-19).
- [ ] Command integration test: an injected failure between the credential update and the Session
      revocation rolls back both.

## Notes

The missing-Permission denial (AC-10) is guard-level
(`@RequiredPermission('USERS:PASSWORD_CHANGE')`) and is owned by
[T13](./users-controller-and-module-wiring.md).
