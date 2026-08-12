---
id: T20
title: 'Add the Warehouse create and rename commands'
layer: 'app'
deps: ['T4', 'T6', 'T11', 'T12']
acs: ['AC-06', 'AC-07', 'AC-08', 'AC-09', 'AC-10']
files_hint:
  [
    'apps/server/src/workspaces/usecases/commands/create-warehouse.command.ts',
    'apps/server/src/workspaces/usecases/commands/rename-warehouse.command.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T20 — Add the Warehouse create and rename commands

## Why

US-03 and US-04 are the Workspace level taking ownership of a lifecycle that previously existed only
inside registration ([sad §6.4](../sad.md#64-add-a-warehouse), [§6.4a](../sad.md#64a-rename-a-warehouse)).
Creation is also the one place a member takes Warehouse authority directly, which
[spec §6.1](../spec.md#61-security--privacy) bounds by requiring `WAREHOUSES:CREATE` and by the new
Warehouse holding nothing.

## What

- `create-warehouse.command.ts` — under `WAREHOUSES:CREATE`, in one transaction: create the
  Warehouse in `principal.workspaceId` via `WarehouseLifecycleRepository`, then delegate its
  protected Manager Role and the creating member's membership to `access`'s provisioning service
  ([T12](./split-provisioning-and-rekey-writes.md)). The Warehouse becomes selectable for the
  creator. If the Manager Role or its assignment cannot be established, no Warehouse is created
  (AC-07).
- `rename-warehouse.command.ts` — under `WAREHOUSES:RENAME`, validate through the shared name value
  object, record the trimmed name preserving Unicode without normalization, and permit a duplicate
  name (AC-09).

Both prove the Warehouse belongs to the actor's Workspace before acting (AC-10).

## Definition of Done

- [ ] Command integration test: creating a Warehouse produces the Warehouse, its protected Manager
      Role and the creator's membership as one outcome, and the new Warehouse is selectable for them
      (AC-06).
- [ ] Command integration test: an injected failure establishing the Manager Role or its assignment
      leaves no Warehouse behind (AC-07).
- [ ] Command integration tests: an empty-after-trim name, one over 100 user-perceived characters,
      and one containing a control or format character are each rejected with the rule named, on
      both create and rename (AC-08).
- [ ] Command integration test: a valid name that duplicates another Warehouse's is accepted
      (AC-08).
- [ ] Command integration test: renaming records the trimmed name un-normalized and it is what
      members of that Warehouse see (AC-09).
- [ ] Command integration test: a Warehouse of another Workspace is denied without disclosing it
      exists (AC-10).
- [ ] A test proves the new Warehouse holds only its protected Manager Role — no custom Role is
      created ([spec §1](../spec.md#1-context), third boundary).
- [ ] lint + vet clean.

## Notes

These commands resolve authority through the **Workspace** guard even though a `warehouseId` appears
in the rename route: their subject is the Warehouse record
([sad §7](../sad.md#7-data-and-interface-impact)). They therefore never consult archived state.
