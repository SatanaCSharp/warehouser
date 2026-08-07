---
id: T12
title: 'Implement DeleteMemberCommand'
layer: 'app'
deps: ['T3', 'T4', 'T5', 'T7']
acs: ['AC-08', 'AC-09', 'AC-11', 'AC-13', 'AC-15']
files_hint: ['apps/server/src/users/usecases/commands/delete-member.command.ts']
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T12 — Implement DeleteMemberCommand

## Why

Implements the deletion flow [sad §6.4](../sad.md#64-delete-a-warehouse-member): locks the target's
Warehouse Membership row (same lock primitive `TransferWarehouseManagerCommand`/`DeleteRoleCommand`
already use, serializing against a concurrent manager transfer for AC-15), rejects self-deletion and
a protected-Manager target, then hard-removes the target end-to-end.

## What

Add `users/usecases/commands/delete-member.command.ts`. Lock the target's Warehouse Membership row
(`MemberLifecycleRepository.lockMembership`) within the caller's Warehouse — missing/cross-Warehouse
denies without disclosure (AC-09). Reject self-deletion (AC-11) and a target currently holding the
Warehouse Manager Role, re-checked after the lock (AC-13). On success, in one transaction, follow
[data-model.md §"Deletion sequencing"](../data-model.md#deletion-sequencing-a-schema-constraint-the-sad-narrative-must-satisfy)'s
exact order: `deleteMembership`, then `deleteSessionsByAccountId`, then `deleteIdentity` — freeing the
email for reuse (AC-08).

## Definition of Done

- [ ] Command integration test: happy path leaves no Session, Membership, Account, or User row for
      the target, and its email is immediately reusable by a new `CreateMemberCommand` call (AC-08).
- [ ] Command integration test: the three deletes run in the documented order and succeed — an
      out-of-order attempt would hit the existing `RESTRICT` FK and is exercised as a regression
      guard.
- [ ] Command integration test: missing/cross-Warehouse target denies without disclosing existence
      (AC-09).
- [ ] Command integration test: self-deletion is blocked (AC-11).
- [ ] Command integration test: target holding the Warehouse Manager Role is blocked, re-checked
      after the lock (AC-13).
- [ ] Command integration test: a concurrent `TransferWarehouseManagerCommand` and a `DeleteMemberCommand`
      targeting the same outgoing/incoming Manager serialize on the row lock — whichever commits
      first, the other re-checks fresh state and is refused if the precondition no longer holds; the
      Warehouse is never left without exactly one Manager (AC-15).
- [ ] Command integration test: an injected failure mid-sequence rolls back the entire removal.

## Notes

The missing-Permission denial (AC-10) is guard-level (`@RequiredPermission('USERS:DELETE')`) and is
owned by [T13](./users-controller-and-module-wiring.md).
