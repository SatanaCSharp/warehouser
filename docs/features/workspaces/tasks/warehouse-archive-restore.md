---
id: T21
title: 'Add the Warehouse archive and restore commands'
layer: 'app'
deps: ['T4', 'T6', 'T11']
acs: ['AC-10', 'AC-11', 'AC-11a', 'AC-13']
files_hint:
  [
    'apps/server/src/workspaces/usecases/commands/archive-warehouse.command.ts',
    'apps/server/src/workspaces/usecases/commands/restore-warehouse.command.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T21 — Add the Warehouse archive and restore commands

## Why

US-05: withdrawing a site from operation without losing its members, Roles or records
([sad §6.5](../sad.md#65-archive-and-restore-a-warehouse)). AC-11a is the invariant that keeps a
Workspace's members from being left with nowhere to work, and it is a cross-row aggregate rather
than a row constraint — so the command owns it.

## What

Add `archive-warehouse.command.ts` and `restore-warehouse.command.ts` under `WAREHOUSES:ARCHIVE`,
each a `@Transactional()` owner over `WarehouseLifecycleRepository`:

- Archive — lock the parent `workspaces` row, re-count non-archived Warehouses **after** acquiring
  the lock, deny when this is the last one with the AC-11a explanation, otherwise set `archived_at`.
- Restore — clear `archived_at`, making the Warehouse selectable and operable again with its Roles
  and memberships intact.
- Both prove the Warehouse belongs to `principal.workspaceId` (AC-10) and leave archived state,
  memberships and Roles unchanged when the change cannot complete (AC-13).

## Definition of Done

- [ ] Command integration test: archiving stops the Warehouse being selectable while its Roles,
      memberships and records are retained and remain readable; restoring makes it selectable and
      operable again with those intact (AC-11).
- [ ] Command integration test: the archived Warehouse keeps exactly one Warehouse Manager so it
      stays administrable when restored.
- [ ] Command integration test: archiving the only non-archived Warehouse is denied with the AC-11a
      explanation.
- [ ] Concurrency test: two simultaneous archives of the last two non-archived Warehouses leave at
      least one non-archived; a concurrent Warehouse creation cannot be missed by the re-count
      (AC-11a).
- [ ] Command integration test: a Warehouse of another Workspace is denied without disclosing it
      exists (AC-10).
- [ ] Command integration test: an injected failure leaves archived state, memberships and Roles
      unchanged and the member is told the change did not complete (AC-13).
- [ ] lint + vet clean.

## Notes

What an archived Warehouse **refuses** is enforced by the Warehouse guard
([T13](./two-level-request-authorization.md)), not here: these two commands are Workspace-guarded and
never consult archived state as an authorization input. AC-12 and AC-12a are proven at the
Warehouse-scoped surface in [T26](./reshape-access-rest.md).
