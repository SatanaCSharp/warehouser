---
id: T11
title: 'Add the Warehouse lifecycle and Warehouse-membership repositories'
layer: 'infra'
deps: ['T7']
acs: ['AC-11a', 'AC-23a']
files_hint:
  [
    'apps/server/src/shared/domain/repositories/warehouse-lifecycle.repository.ts',
    'apps/server/src/shared/domain/repositories/warehouse-membership-assignment.repository.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T11 — Add the Warehouse lifecycle and Warehouse-membership repositories

## Why

The Warehouse record and the membership edges into it are Workspace-owned
([spec §1](../spec.md#1-context), first boundary), so their persistence lives here rather than in
`access`. Two rules need care: AC-11a is a cross-row aggregate that is not expressible as a row
constraint, and AC-23a's read must be narrowed in SQL rather than filtered afterwards.

## What

- `WarehouseLifecycleRepository` — create a Warehouse in a Workspace, rename it, set and clear
  `archived_at`, and the **locked non-archived re-count**: lock the parent `workspaces` row, then
  `SELECT count(*) FROM warehouses WHERE workspace_id = $1 AND archived_at IS NULL`, so no phantom
  from a concurrent create or archive can be seen.
- `WarehouseMembershipAssignmentRepository` — the assignable-Roles read projected to `id, name` in
  SQL, membership insert (carrying `workspace_id`) and membership delete against the composite key.

Both join the caller's transaction and stay feature-agnostic.

## Definition of Done

- [ ] Repository integration tests cover create, rename, archive and restore, asserting Roles,
      memberships and records survive archiving untouched.
- [ ] A concurrency test proves two simultaneous archives of the last two non-archived Warehouses
      leave at least one non-archived, and that a concurrent create cannot be missed by the re-count
      (AC-11a).
- [ ] A test proves the assignable-Roles read returns `id` and `name` only, excludes the protected
      Manager Role, and is constrained to one Warehouse of the actor's Workspace (AC-23a).
- [ ] A test proves membership insert writes `workspace_id` and is rejected by the composite
      reference when the Warehouse belongs to a different Workspace than the User.
- [ ] A test proves membership delete nulls the affected User's `active_warehouse_id` and no other.
- [ ] lint + vet clean.

## Notes

The re-count is the guarantee for a rule that is deliberately **not** a schema constraint
([data-model.md §Constraints deliberately not expressed](../data-model.md#constraints-deliberately-not-expressed-in-the-schema)).
Do not add a trigger or check constraint for it.
