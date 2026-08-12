---
id: T18
title: 'Add the Workspace membership add, remove and reassign commands'
layer: 'app'
deps: ['T4', 'T6', 'T10']
acs: ['AC-19', 'AC-19a', 'AC-19b', 'AC-20', 'AC-21', 'AC-21a', 'AC-22']
files_hint:
  [
    'apps/server/src/workspaces/usecases/commands/add-workspace-member.command.ts',
    'apps/server/src/workspaces/usecases/commands/remove-workspace-member.command.ts',
    'apps/server/src/workspaces/usecases/commands/assign-workspace-role.command.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T18 — Add the Workspace membership add, remove and reassign commands

## Why

US-07: Workspace administration is deliberately granted rather than inherited, adjusted as
responsibilities change, and withdrawn when no longer needed
([sad §6.6a](../sad.md#66a-manage-workspace-membership)). The subtlety is AC-20 versus AC-21: the
"already belongs to a Warehouse of this Workspace" rule applies **only** at grant time and must never
become a database constraint.

## What

Three commands over `WorkspaceMembershipRepository`:

- **Add** — the candidate holds a Warehouse membership in a Warehouse of that Workspace and is not
  already a Workspace Member; they receive exactly one custom Workspace Role (AC-19). A candidate
  with no such membership is blocked with that explanation (AC-20).
- **Remove** — the target keeps every Warehouse membership and Role but loses every Workspace
  capability from the next authorization decision onward (AC-19a). The current Owner is never
  removable (AC-21a).
- **Reassign** — the target moves to a different custom Workspace Role; the previous Role's
  capabilities stop at the next decision and no Warehouse membership or Role changes (AC-19b).
  Neither the protected Owner Role nor the current Owner is a legal operand (AC-22).

All three prove the target belongs to `principal.workspaceId` and emit the **cause-specific**
message: `workspace.member_exists` for an already-a-Member candidate and
`workspace.owner_transfer_required` for an Owner-Role operand. These are two distinct failures, not
one — resolving `api-sync-report.md` **F-3**.

## Definition of Done

- [ ] Command integration test: adding an eligible candidate leaves them holding exactly one
      Workspace Role with the capabilities it grants (AC-19).
- [ ] Command integration test: a candidate with no Warehouse membership in that Workspace is
      blocked with the stated explanation (AC-20).
- [ ] Command integration test: removal preserves every Warehouse membership and Role and stops
      Workspace capability at the next decision (AC-19a).
- [ ] Command integration test: reassignment leaves exactly one Workspace Role and changes no
      Warehouse membership (AC-19b).
- [ ] Command integration test: an existing Member who subsequently holds **no** Warehouse
      membership keeps their Workspace Role and capabilities (AC-21).
- [ ] Command integration tests: removing the Owner (AC-21a), assigning the protected Owner Role,
      and reassigning the current Owner (AC-22) are each denied with the correct explanation.
- [ ] Command integration test: an already-a-Member candidate and an Owner-Role operand produce two
      **different** stable error codes and messages (F-3).
- [ ] lint + vet clean.

## Notes

No database constraint may express AC-20
([data-model.md](../data-model.md#constraints-deliberately-not-expressed-in-the-schema)); if the
implementation reaches for one, AC-21 is being violated.
