---
id: T23
title: 'Add the Active Warehouse selection command and the actor-context query'
layer: 'app'
deps: ['T6', 'T9', 'T11']
acs: ['AC-03', 'AC-03b', 'AC-04', 'AC-30']
files_hint:
  [
    'apps/server/src/workspaces/usecases/commands/set-active-warehouse.command.ts',
    'apps/server/src/workspaces/usecases/queries/read-workspace-context.query.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T23 — Add the Active Warehouse selection command and the actor-context query

## Why

[sad §4](../sad.md#4-solution-strategy) and [§6.8](../sad.md#68-select-the-active-warehouse): the
selection follows the member rather than the device (AC-03), and the _effective_ selection is derived
at read time so a withdrawn membership or a newly archived Warehouse cannot leave a member pointing
at authority they no longer hold — with no background job and no row rewritten.

## What

- `set-active-warehouse.command.ts` — store the selection per User, constrained to a Warehouse the
  member actually holds a membership in and which is not archived. Deny otherwise, leaving the stored
  value unchanged.
- `read-workspace-context.query.ts` — the actor-context projection: Workspace identity, name and
  unnamed state, the actor's Workspace Permissions, the member's Warehouses with archived state, and
  the **effective** selection derived in this order — the stored selection while it is still a live,
  non-archived membership; otherwise the single membership when exactly one exists; otherwise none.

The query is a self-projection read: it must answer for a User who is no Workspace Member, because
that empty projection is precisely how AC-30 makes the web omit every Workspace control and
destination. It declares no Workspace Permission — the classification
[T28](./archived-tolerance-adr.md) adds to `sad.md` §8 covers it (`api-sync-report.md` **OQ-2**).

## Definition of Done

- [ ] Integration test: the selection is stored per User, survives a new session on another device,
      and persists until changed (AC-03).
- [ ] Integration test: a member who has never chosen gets their only membership when they hold
      exactly one, and **no** selection when they hold several — nothing is ever chosen on their
      behalf (AC-03b).
- [ ] Integration test: selecting a Warehouse the member holds no membership in, or an archived one,
      is denied and the stored selection is unchanged (AC-04).
- [ ] Integration test: withdrawing a membership or archiving the selected Warehouse changes the
      effective selection on the very next read, with no row rewritten by any background process.
- [ ] Integration test: a User who is no Workspace Member receives the empty projection with no
      Workspace Permission and no error (AC-30).
- [ ] A test proves nothing in this task is ever consulted by a guard or by another use case for an
      authorization decision.
- [ ] lint + vet clean.

## Notes

The selection is presentation state. Storing it in a cookie or session claim would make it an
authorization input and reopen the "Warehouse confusion" abuse case
([spec §6.1](../spec.md#61-security--privacy)); storing it in a Redux slice on the web would make it
client-owned. Neither is acceptable.
