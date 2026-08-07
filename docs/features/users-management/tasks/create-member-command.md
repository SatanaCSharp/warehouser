---
id: T9
title: 'Implement CreateMemberCommand'
layer: 'app'
deps: ['T2', 'T3', 'T4', 'T5', 'T7']
acs: ['AC-01', 'AC-02', 'AC-05', 'AC-09', 'AC-12', 'AC-16', 'AC-20']
files_hint: ['apps/server/src/users/usecases/commands/create-member.command.ts']
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T9 — Implement CreateMemberCommand

## Why

Implements the create flow [sad §6.1](../sad.md#61-create-a-warehouse-member): loads the actor's full
Permission set and the selected Role, rejects a missing/cross-Warehouse or reserved Role and a Role
exceeding the actor's own Permissions, validates email/password, and creates the Account+User pair
with no Session plus the Warehouse Membership row, atomically.

## What

Add `users/usecases/commands/create-member.command.ts`. Load the caller's full Permission-ID set
(`AccessCurrentUserRepository.resolveCurrentAccess`) and the selected Role
(`RoleLifecycleRepository.findCustomRole`, scoped to the caller's Warehouse). Reject: missing/
cross-Warehouse Role (AC-09), the reserved Warehouse Manager Role (AC-20), a Role whose
Permission-ID set (`MemberLifecycleRepository.findRoleGrantedPermissionIds`) is not a subset of the
caller's own (AC-16). Validate email/password format with the shared predicates from
[T2](./promote-shared-credential-security.md) (AC-02) and global uniqueness via
`AuthenticationRepository.findAccountByNormalizedEmail` (AC-05). In one `@Transactional()`
transaction: hash the password, `createIdentity` (no Session), `insertMembership` for the selected
Role. Return the new member's id, email, and Role (AC-01).

## Definition of Done

- [ ] Command integration test: happy path creates exactly one new Warehouse Member with the
      selected Role and no Session (AC-01).
- [ ] Command integration test: invalid email or password outside accepted length creates nothing
      and names the invalid field (AC-02).
- [ ] Command integration test: an email already registered anywhere in the system is rejected,
      regardless of which Warehouse (if any) the colliding identity belongs to (AC-05).
- [ ] Command integration test: missing/cross-Warehouse Role denies without disclosing existence
      (AC-09).
- [ ] Command integration test: selecting the reserved Warehouse Manager Role is blocked (AC-20).
- [ ] Command integration test: a Role whose Permissions exceed the actor's own is blocked (AC-16).
- [ ] Command integration test: an injected failure after the Account+User insert rolls back the
      entire attempt — no partial row survives.
- [ ] Integration test: the newly created member signs in with the initial email/password via the
      existing, unmodified sign-in command and is granted exactly their Role's capabilities (AC-12,
      confirms `sad §6.6`'s "N/A — reuses `auth`'s existing sign-in flow" holds in practice).

## Notes

The missing-Permission denial (AC-03) is enforced by the guard/route declaration, owned by
[T13](./users-controller-and-module-wiring.md) — this command never re-implements permission
resolution (`sad §4`).
