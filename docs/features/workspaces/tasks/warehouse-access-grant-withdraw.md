---
id: T37
title: 'Build Warehouse access grant and withdrawal from the Warehouse detail pane'
layer: 'ui'
deps: ['T36']
acs: ['AC-23', 'AC-23a', 'AC-25b', 'AC-25c']
files_hint:
  [
    'apps/web/src/modules/workspace/components/warehouses/',
    'apps/web/src/modules/workspace/api/workspace-warehouses-api.ts',
    'apps/web/public/locales/en/workspace.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T37 — Build Warehouse access grant and withdrawal from the Warehouse detail pane

## Why

US-08 and US-08a made usable: giving a User of the Workspace a membership and Role in one of its
Warehouses, and taking it back. The subtle part is that this UI is driven by two _narrow_ reads —
the Workspace's Users (`WORKSPACE_MEMBERS:WATCH`) and that Warehouse's assignable custom Roles
(`WAREHOUSE_MEMBERSHIPS:ASSIGN`, identifiers and names only) — and must not reach for anything wider.

## What

Extend the Warehouse detail pane with:

- **Give warehouse access** (dialog on `ZfNnP`, sheet on `QidCt`, `user-plus`) — choose a User of the
  Workspace who does not already belong to this Warehouse, and one of that Warehouse's assignable
  custom Roles from the narrow read. State what changes and what is preserved.
- **Withdraw access** on a person's row — unavailable on the protected Manager's row and on the
  actor's own, each with the reason exposed rather than a silently missing control. Destructive
  primary, solid `danger`, Cancel first in DOM and keyboard order.
- Both endpoints added to `workspace-warehouses-api.ts` with tags refreshing the detail pane, the
  Workspace Users read and the actor context.

## Definition of Done

- [ ] Tests cover the grant flow: the candidate list excludes the acting member and anyone already in
      that Warehouse, the Role list comes from the narrow assignable-Roles read and excludes the
      protected Manager Role, and success shows a toast naming the committed outcome (AC-23, AC-23a).
- [ ] Test proves no request is issued for a Warehouse's members, Roles or resources beyond the two
      narrow reads (AC-23a).
- [ ] Tests cover withdrawal: success removes the person from the pane and states what is preserved
      (AC-25b); the Manager's row and the actor's own row expose a disabled action **with its reason**
      (AC-25c).
- [ ] Test proves a server denial is handled independently of the derived capability — the control
      may be offered and the server may still refuse, and the UI must say so without disclosing
      whether the target exists.
- [ ] Accessibility: dialog and sheet trap focus, restore it to the invoking control, expose
      accessible names and descriptions, and place the non-destructive action before the destructive
      one in keyboard order.
- [ ] lint + build + web suite green.

## Notes

Disabling "Withdraw access" on the Manager's row needs the memberships read to mark which membership
carries the protected Manager Role — the `design-handoff.md` open question owned by Backend Lead and
resolved in the contract ([openapi.yaml](../contracts/openapi.yaml)), not by widening the UI's read.
Shares [T36](./warehouses-tab.md)'s files and follows it in the same lane.
