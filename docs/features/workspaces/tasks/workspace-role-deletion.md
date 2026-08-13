---
id: T17
title: 'Add the Workspace Role deletion command with replacement'
layer: 'app'
deps: ['T4', 'T6', 'T10']
acs: ['AC-17', 'AC-17a', 'AC-17b', 'AC-17c', 'AC-17d']
files_hint:
  [
    'apps/server/src/workspaces/usecases/commands/delete-workspace-role.command.ts',
    'apps/server/src/workspaces/domain/services/workspace-role-deletion.service.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T17 — Add the Workspace Role deletion command with replacement

## Why

Deleting an assigned Workspace Role must move every affected Member to a replacement as **one**
outcome, because every Workspace Member holds exactly one Workspace Role and none may be left
without it (AC-17). [spec §6](../spec.md#6-non-functional-requirements) lists this among the five
outcomes that must preserve all invariants. The `access` precedent is
`access/domain/services/role-deletion.service.ts`.

## What

Add `delete-workspace-role.command.ts` and `workspaces/domain/services/workspace-role-deletion.service.ts`,
mirroring the `access` shape one level up:

- Unassigned Role, no replacement selected → delete, changing no assignment (AC-17a).
- Assigned Role with a valid replacement custom Role of the same Workspace → move every affected
  Member and delete the Role in one transaction, using the atomic replacement in
  `WorkspaceRoleLifecycleRepository` (AC-17).
- Assigned Role and the actor holds `WORKSPACE_ROLES:DELETE` but not `WORKSPACE_ROLES:ASSIGN` →
  deny, explaining that moving the affected Members is an assignment; the unassigned path stays
  available to them (AC-17d).
- Assigned Role that is the only custom Role, so no replacement other than the protected Owner Role
  exists → deny (AC-17c).
- Any failure → nothing changes and the member is told the deletion did not complete (AC-17b).

## Definition of Done

- [ ] Command integration test: deleting an unassigned Role changes no assignment (AC-17a).
- [ ] Command integration test: deleting an assigned Role moves every affected Member to the
      replacement and deletes the Role atomically, leaving no Member without exactly one Role
      (AC-17).
- [ ] Command integration test: an actor with delete but not assign Permission is denied for an
      assigned Role and still succeeds for an unassigned one (AC-17d).
- [ ] Command integration test: deleting the only custom Role is denied with the "another custom
      Workspace Role must exist first" explanation (AC-17c).
- [ ] Command integration test: an injected failure mid-replacement leaves every assignment and the
      Role unchanged (AC-17b).
- [ ] Command integration test: a replacement Role from another Workspace is rejected as an
      unavailable target.
- [ ] lint + vet clean.

## Notes

The protected Owner Role is never a valid replacement — it is never assigned this way
([spec AC-17c](../spec.md#ac-17c-us-06--domain-invariant)). The Owner's own membership is untouched
by this command; changing it is [T19](./workspace-owner-transfer.md)'s subject alone.
