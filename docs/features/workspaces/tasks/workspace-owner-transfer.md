---
id: T19
title: 'Add the Workspace Owner transfer command'
layer: 'app'
deps: ['T4', 'T6', 'T10']
acs: ['AC-26', 'AC-26a', 'AC-27', 'AC-28']
files_hint:
  [
    'apps/server/src/workspaces/usecases/commands/transfer-workspace-owner.command.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T19 — Add the Workspace Owner transfer command

## Why

The only way the protected Workspace Owner Role ever changes hands
([sad §6.7 Transfer Workspace Owner](../sad.md#67-workspace-role-lifecycle-and-owner-transfer)).
[spec §6.1](../spec.md#61-security--privacy) names owner-transfer split-brain as an abuse case: the
transfer completes only when promotion and former-owner reassignment together preserve exactly one
Owner.

## What

Add `transfer-workspace-owner.command.ts` over `WorkspaceOwnerTransferRepository.transfer`. Require
the actor to be the current Owner holding `WORKSPACE_OWNER_ROLE:REASSIGN`, the recipient to be a
different Workspace Member of the same Workspace, and a custom Workspace Role to be selected for the
outgoing Owner. Promotion and reassignment happen in one statement inside one transaction, after
locking the `workspaces` row and both membership rows in `user_id` order and re-checking their
composite Role relations.

## Definition of Done

- [ ] Command integration test: the recipient becomes the sole Owner and the former Owner receives
      the selected custom Role as one outcome (AC-26).
- [ ] Command integration test: with no custom Workspace Role in the Workspace, the transfer is
      denied, exactly one Owner remains, and the explanation says a custom Role must be created
      first (AC-26a).
- [ ] Command integration tests: an actor who is not the Owner, and one lacking
      `WORKSPACE_OWNER_ROLE:REASSIGN`, are each denied with exactly one Owner preserved (AC-27).
- [ ] Command integration tests: the Owner selecting themself, a User who is no Workspace Member,
      and a Workspace Member of another Workspace are each denied with exactly one Owner preserved
      (AC-28).
- [ ] Command integration test: two concurrent transfers leave exactly one Owner, the loser mapped
      to the stable concurrency error.
- [ ] Command integration test: an injected failure mid-transfer leaves both assignments unchanged.
- [ ] lint + vet clean.

## Notes

`WORKSPACE_OWNER_ROLE:REASSIGN` is reserved to the protected Owner Role and can never appear in a
custom Workspace Role ([spec §1](../spec.md#1-context)) —
[T16](./workspace-role-create-update.md) enforces the other half of that.
