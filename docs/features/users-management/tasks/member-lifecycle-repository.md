---
id: T4
title: 'Add MemberLifecycleRepository'
layer: 'infra'
deps: []
acs: []
files_hint:
  ['apps/server/src/shared/domain/repositories/member-lifecycle.repository.ts']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T4 — Add MemberLifecycleRepository

## Why

[data-model.md §Repository boundaries](../data-model.md#repository-boundaries) specifies this new
specialized repository for the operations no existing repository performs: Role-Permission reads for
the AC-16/AC-19 superset comparisons, and Warehouse Membership insert/delete.

## What

Add `shared/domain/repositories/member-lifecycle.repository.ts` with `lockMembership(warehouseId,
userId)` (`SELECT ... FOR UPDATE`, same pessimistic pattern as `RoleLifecycleRepository
.lockCustomRole`/`ManagerTransferRepository.lockMembers`), `findRoleGrantedPermissionIds(roleId)`,
`insertMembership(input)` (always `roleKind: 'custom'`, per AC-20), and `deleteMembership(warehouseId,
userId)`. Operates on shared persistence entities only — no import of `users` or `access`.

## Definition of Done

- [ ] Repository integration tests (against PostgreSQL) cover: `lockMembership` returns the row when
      in-Warehouse, `null` when missing or cross-Warehouse; `findRoleGrantedPermissionIds` returns the
      exact granted set; `insertMembership` writes a `'custom'`-kind row; `deleteMembership` removes
      exactly the target row.
- [ ] No new index or schema change — confirmed against [data-model.md §Indexes](../data-model.md#indexes).
- [ ] lint + vet clean.

## Notes

Creation additionally reuses `RoleLifecycleRepository.lockCustomRole(warehouseId, roleId)` (already
exists) for locking the selected Role row — no new lock method for that case.
