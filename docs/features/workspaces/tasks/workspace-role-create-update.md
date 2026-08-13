---
id: T16
title: 'Add the custom Workspace Role create and update commands'
layer: 'app'
deps: ['T4', 'T6', 'T10']
acs: ['AC-14', 'AC-14a', 'AC-15', 'AC-15a', 'AC-16', 'AC-18']
files_hint:
  [
    'apps/server/src/workspaces/usecases/commands/create-workspace-role.command.ts',
    'apps/server/src/workspaces/usecases/commands/update-workspace-role.command.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T16 — Add the custom Workspace Role create and update commands

## Why

US-06's delegation story: Workspace administration is granted through custom Workspace Roles
assembled from a system-managed catalogue. [sad §6.7](../sad.md#67-workspace-role-lifecycle-and-owner-transfer)
draws the flow; the protected Owner Role and the reserved Permission are the two things these
commands must never touch.

## What

Add `create-workspace-role.command.ts` and `update-workspace-role.command.ts` over
`WorkspaceRoleLifecycleRepository`, each asserting through the predicates in
[T4](./workspaces-domain-rules.md):

- Create with a valid name not already used exactly in the Workspace and zero or more assignable
  Workspace Permissions (AC-14).
- Update the Permission membership — including to the empty set — and/or rename with a valid,
  exactly-unique name (AC-14a).
- Reject an exact name conflict while keeping differently cased names distinct (AC-15), and every
  broken name rule with the rule named (AC-15a).
- Reject any attempt to rename, delete or re-permission the protected Owner Role (AC-16).
- Reject a Permission absent from the catalogue, one classified reserved, and any attempt to change
  a Permission identifier or label (AC-18).

Both prove the Role belongs to `principal.workspaceId` before acting.

## Definition of Done

- [ ] Command integration tests cover creation with zero Permissions and with several, and confirm
      the Role becomes assignable within that Workspace (AC-14).
- [ ] Command integration tests cover changing Permission membership to a different set and to the
      empty set, and renaming with Unicode preserved un-normalized — with the new membership used by
      the next authorization decision (AC-14a).
- [ ] Command integration tests cover the exact-name conflict on both create and update, asserting a
      differently cased name is accepted (AC-15).
- [ ] Command integration tests cover each broken name rule with the rule named (AC-15a).
- [ ] Command integration tests cover rename, delete and permission-change attempts against the
      protected Owner Role, each explaining it is system-managed (AC-16).
- [ ] Command integration tests cover an unknown Permission, the reserved Permission, and a
      definition/label mutation attempt (AC-18).
- [ ] A test proves a Role of another Workspace is indistinguishable from a missing one.
- [ ] lint + vet clean.

## Notes

Deletion is **not** here — [T17](./workspace-role-deletion.md) owns it because the assigned case
needs a replacement and a second Permission. The two tasks share
`WorkspaceRoleLifecycleRepository` but not a file.
