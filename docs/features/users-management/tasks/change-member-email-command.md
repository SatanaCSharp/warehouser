---
id: T10
title: 'Implement ChangeMemberEmailCommand'
layer: 'app'
deps: ['T2', 'T3', 'T4', 'T5', 'T7']
acs: ['AC-04', 'AC-05', 'AC-09', 'AC-14', 'AC-18', 'AC-19']
files_hint:
  ['apps/server/src/users/usecases/commands/change-member-email.command.ts']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T10 — Implement ChangeMemberEmailCommand

## Why

Implements the email-change flow [sad §6.2](../sad.md#62-change-a-members-email): locks and loads the
target's Warehouse Membership, rejects self-targeting, a protected-Manager target, and a target
exceeding the actor's Permissions, validates the new email, and updates it — leaving Sessions
untouched.

## What

Add `users/usecases/commands/change-member-email.command.ts`. Lock and load the target's Warehouse
Membership (`MemberLifecycleRepository.lockMembership`/`RoleLifecycleRepository.findMemberRole`,
scoped to the caller's Warehouse) — a missing row is indistinguishable from cross-Warehouse (AC-09).
Reject self-targeting (AC-18), a target holding the Warehouse Manager Role (AC-14), and a target
whose Role's Permission-ID set is not a subset of the actor's own (AC-19). Validate the new email's
format (AC-02 rules, reused) and global uniqueness (AC-05). Update the Account's `normalized_email`
in one transaction (AC-04); Sessions stay untouched.

## Definition of Done

- [ ] Command integration test: happy path records the new email and leaves the target's existing
      Sessions active (AC-04).
- [ ] Command integration test: invalid or duplicate email makes no change (AC-02/AC-05 rules).
- [ ] Command integration test: missing/cross-Warehouse target denies without disclosing existence
      (AC-09).
- [ ] Command integration test: self-targeting is blocked (AC-18).
- [ ] Command integration test: target holding the Warehouse Manager Role is blocked (AC-14).
- [ ] Command integration test: target whose Role's Permissions exceed the actor's own is blocked
      (AC-19).
- [ ] Command integration test: an injected failure rolls back the whole attempt.

## Notes

The missing-Permission denial (AC-10) is guard-level (`@RequiredPermission('USERS:EMAIL_UPDATE')`)
and is owned by [T13](./users-controller-and-module-wiring.md) — this command never re-implements
permission resolution (`sad §4`). Shares its self-action/protected-Manager/Permission-exceeded
predicate set with [T11](./change-member-password-command.md) — both consume the same
[T3](./users-domain-errors-predicates.md) predicates and the same
[T4](./member-lifecycle-repository.md)/[T5](./extend-authentication-repository.md) reads.
