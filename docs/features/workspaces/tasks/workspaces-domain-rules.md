---
id: T4
title: 'Add the workspaces domain predicates, typed errors and invariant rules'
layer: 'domain'
deps: ['T3']
acs:
  [
    'AC-11a',
    'AC-15',
    'AC-16',
    'AC-17c',
    'AC-18',
    'AC-21a',
    'AC-22',
    'AC-25',
    'AC-25a',
    'AC-25c',
    'AC-26a',
  ]
files_hint: ['apps/server/src/workspaces/domain/']
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T4 — Add the workspaces domain predicates, typed errors and invariant rules

## Why

[sad §5](../sad.md#5-building-blocks-and-ownership) gives `workspaces/domain` the predicates and
typed errors for the protected Owner Role, reserved Workspace Permissions, the sole-Owner rule and
the last-non-archived-Warehouse rule. Every command in the epic asserts through these, so they land
once, framework-free, before any use case exists — mirroring `access/domain/errors/access.errors.ts`
and `users`' predicate set.

## What

Add `apps/server/src/workspaces/domain/` with the entity/predicate layer and its typed errors:

- Protected Workspace Owner Role: never renamed, deleted, or re-permissioned (AC-16); never assigned
  or reassigned through ordinary Workspace Role assignment (AC-22); its Member never removed
  (AC-21a).
- Workspace Permissions: a submitted identifier must exist in the catalogue and be `assignable`;
  `WORKSPACE_OWNER_ROLE:REASSIGN` is reserved; no definition or label is mutable (AC-18).
- Workspace Role names: exact per-Workspace uniqueness, differently cased names distinct (AC-15),
  validated through the shared name value object from [T3](./promote-shared-name-value-object.md)
  (AC-15a).
- Replacement availability: an assigned custom Role cannot be deleted when no other custom Role
  exists (AC-17c); the outgoing Owner must end a transfer holding exactly one Workspace Role
  (AC-26a).
- Warehouse lifecycle: a Workspace always keeps at least one non-archived Warehouse (AC-11a).
- Membership-edge rules: never the protected Manager Role, never a second Role for one User in one
  Warehouse, never the acting member as target (AC-25, AC-25a), never withdrawing the Manager's or
  the actor's own membership (AC-25c).
- Cross-Workspace targeting: a target outside `principal.workspaceId` produces the same
  non-enumerating error as a missing one.

Errors map to the stable codes added in [T5](./workspace-permission-vocabulary.md) through the
existing assertion-factory pattern; no layer catches, logs and rethrows.

## Definition of Done

- [ ] Unit tests exercise every predicate and error above in isolation, without a database.
- [ ] A test proves the cross-Workspace error is byte-identical to the missing-target error, so
      neither discloses existence.
- [ ] `apps/server/src/workspaces/domain/` has zero NestJS, HTTP and TypeORM imports (asserted by
      the architecture check in [T30](./two-level-authorization-coverage-check.md), and by an import
      assertion here).
- [ ] `workspaces` imports no `access` domain internals.
- [ ] lint + vet clean.

## Notes

AC-20's "the candidate already belongs to a Warehouse of this Workspace" is a **command-time**
precondition owned by [T18](./workspace-membership-commands.md), not a rule here and never a
database constraint — AC-21 requires Workspace membership to survive losing every Warehouse
membership ([data-model.md](../data-model.md#constraints-deliberately-not-expressed-in-the-schema)).
