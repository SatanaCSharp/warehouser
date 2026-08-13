---
id: T22
title: 'Add the Warehouse membership assign and revoke commands and the assignable-Roles read'
layer: 'app'
deps: ['T4', 'T6', 'T11']
acs:
  ['AC-23', 'AC-23a', 'AC-24', 'AC-25', 'AC-25a', 'AC-25b', 'AC-25c', 'AC-25d']
files_hint:
  [
    'apps/server/src/workspaces/usecases/commands/assign-warehouse-membership.command.ts',
    'apps/server/src/workspaces/usecases/commands/revoke-warehouse-membership.command.ts',
    'apps/server/src/workspaces/usecases/queries/list-assignable-warehouse-roles.query.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T22 — Add the Warehouse membership assign and revoke commands and the assignable-Roles read

## Why

US-08 and US-08a: people who work across sites do not need a second account, and site access can be
taken back ([sad §6.6](../sad.md#66-assign-and-revoke-a-warehouse-membership-from-the-workspace-level)).
[spec §6.1](../spec.md#61-security--privacy) makes self-escalation through membership assignment an
explicit abuse case — this is where it is closed.

## What

- `assign-warehouse-membership.command.ts` under `WAREHOUSE_MEMBERSHIPS:ASSIGN` — the target User
  belongs to the actor's Workspace and is not the actor; the Warehouse belongs to that Workspace; the
  chosen custom Role belongs to that Warehouse. Insert the membership carrying `workspace_id`.
- `revoke-warehouse-membership.command.ts` under `WAREHOUSE_MEMBERSHIPS:REVOKE` — delete the
  membership, never the Manager's and never the actor's own.
- `list-assignable-warehouse-roles.query.ts` — the narrow read carried by
  `WAREHOUSE_MEMBERSHIPS:ASSIGN`, projected to identifier and name in SQL and granting no other
  capability inside that Warehouse.

## Definition of Done

- [ ] Command integration test: the target holds exactly that Role in that Warehouse, retains every
      membership they already held, and the Warehouse becomes selectable for them (AC-23).
- [ ] Query integration test: the assignable-Roles read returns identifiers and names only, and
      grants no visibility into the Roles, members or resources of a Warehouse of another Workspace
      (AC-23a).
- [ ] Command integration tests: placing a User of another Workspace into one of the actor's
      Warehouses, and a User of the actor's Workspace into a Warehouse of another, are both denied
      (AC-24).
- [ ] Command integration tests: granting the protected Manager Role, and granting a second
      membership in a Warehouse the target already belongs to, are each denied with the stated
      explanation (AC-25).
- [ ] Command integration test: the actor granting themself a membership in an existing Warehouse is
      denied (AC-25a).
- [ ] Command integration test: revocation removes the Role and every Permission it granted from the
      next decision, stops the Warehouse being selectable for them, and leaves every other membership
      unaffected (AC-25b).
- [ ] Command integration tests: withdrawing the Manager's membership and withdrawing the actor's own
      are each denied with the stated explanation (AC-25c).
- [ ] Command integration test: a membership in a Warehouse of another Workspace is denied without
      disclosing that the Warehouse or the membership exists (AC-25d).
- [ ] lint + vet clean.

## Notes

Adding a Warehouse ([T20](./warehouse-create-rename.md)) is the one exception to AC-25a — a Warehouse
at the moment of creation has no other member who could grant it. Do not generalize that exception
here. Revocation must clear the target's `active_warehouse_id` if it pointed at that Warehouse; the
effective-selection derivation in [T23](./active-warehouse-selection.md) is the safety net, not the
excuse to skip it.
