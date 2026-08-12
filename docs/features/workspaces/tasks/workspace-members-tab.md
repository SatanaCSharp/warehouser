---
id: T39
title: 'Build the Workspace members tab and Owner transfer'
layer: 'ui'
deps: ['T35']
acs: ['AC-19', 'AC-19a', 'AC-19b', 'AC-21a', 'AC-22', 'AC-26', 'AC-33']
files_hint:
  [
    'apps/web/src/modules/workspace/components/members/',
    'apps/web/src/modules/workspace/api/workspace-members-api.ts',
    'apps/web/public/locales/en/workspace.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T39 — Build the Workspace members tab and Owner transfer

## Why

US-07 and US-09, plus the `WORKSPACE_MEMBERS:WATCH` half of US-11. Frames `edPx9` and `VrGa3` fix the
row treatment, and the Owner row is the one that must never offer the ordinary controls — AC-21a and
AC-22 are both about the Owner being changeable only through the protected transfer.

## What

- `workspace-members-api.ts` — the Workspace Members read, the Workspace Users read (the candidate
  source), add, remove, change-role and owner-transfer, tagged so a mutation refreshes the Members
  list, the Users list and the actor context.
- Member rows mirroring `MemberRow.tsx`: avatar, identity, Workspace Role chip. The **Owner row**
  shows `Protected` and offers **Transfer ownership** instead of Change role and Remove (AC-21a,
  AC-22).
- Add member dialog — candidates come from the Workspace Users read, restricted to Users who already
  belong to a Warehouse of this Workspace and are not already Members; the Role choice lists custom
  Workspace Roles only (AC-19, AC-20).
- Change role and Remove dialogs, each stating what changes and what is preserved — removal keeps
  every Warehouse membership and Role (AC-19a, AC-19b).
- Transfer ownership dialog (`ZfNnP`/`QidCt`) — pick the recipient among other Workspace Members and
  a custom Workspace Role for the outgoing Owner; state that both happen as one outcome (AC-26).

## Definition of Done

- [ ] Tests cover add, change-role and remove with success toasts naming the committed outcome, and
      removal copy stating Warehouse memberships are preserved (AC-19, AC-19a, AC-19b).
- [ ] Tests prove the Owner row exposes `Protected` and offers only the transfer, with no Change role
      and no Remove (AC-21a, AC-22).
- [ ] Tests prove the add-candidate list comes from the Workspace Users read and excludes existing
      Members; the protected Owner Role is never offered as a choice.
- [ ] Tests cover the transfer dialog requiring a custom Role for the outgoing Owner, and the
      server's "create a custom Role first" refusal being surfaced (AC-26).
- [ ] Test proves neither dataset is requested without `WORKSPACE_MEMBERS:WATCH` (AC-33).
- [ ] Test covers the authority-lost state (`OD62T`): safe explanation, capability state refreshed,
      the target's existence never disclosed.
- [ ] Accessibility: list semantics, labelled selects, dialogs trapping and restoring focus, the
      non-destructive action before the destructive one.
- [ ] lint + build + web suite green.

## Notes

Members and Users are two different reads: `WORKSPACE_MEMBERS:WATCH` covers the Workspace Members
**and** the other Users of the Workspace with the Warehouses each belongs to, so the candidates that
Workspace membership acts on can be found (AC-33). Never render a User's Warehouse **Role** here —
that is the level boundary [T36](./warehouses-tab.md) also enforces. Shares the `workspace.json` lane
with [T35](./workspace-route-shell.md), [T36](./warehouses-tab.md), [T37](./warehouse-access-grant-withdraw.md)
and [T38](./workspace-roles-tab.md).
