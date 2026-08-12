---
id: T33
title: 'Add the Workspace actor-context API, capability hook and Workspace gate'
layer: 'ui'
deps: ['T6']
acs: ['AC-30']
files_hint:
  [
    'apps/web/src/shared/api/workspace-context-api.ts',
    'apps/web/src/shared/hooks/useWorkspacePermissions.ts',
    'apps/web/src/shared/components/',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T33 — Add the Workspace actor-context API, capability hook and Workspace gate

## Why

[sad §5 Web](../sad.md#web) places the actor-context read in `shared/`, not in one module, because the
application **shell** consumes it — the switcher, the sidebar and the workspace route all derive from
it. Keeping `useWorkspacePermissions` and the Workspace gate separate from `usePermissions` and
`PermissionGate` is what stops the two vocabularies from ever meeting in one gate (AC-31).

## What

- `shared/api/workspace-context-api.ts` — inject the actor-context query (Workspace identity, name
  and unnamed state, Workspace Permissions, the member's Warehouses with archived state, the
  effective selection) and the selection mutation into the shared RTK Query API slice, beside the
  existing `shared/api/access-permissions-api.ts`. Tag them so any Workspace mutation refreshes every
  affected view.
- `shared/hooks/useWorkspacePermissions.ts` — Workspace capability derivation mirroring
  `modules/access/hooks/useAccessCapabilities.ts`, typed to the Workspace vocabulary only.
- `shared/components/` — a Workspace-level gate mirroring `PermissionGate`, typed so a Warehouse
  Permission cannot be passed to it.

## Definition of Done

- [ ] Tests prove a User who is no Workspace Member derives **no** Workspace capability, and that no
      Workspace dataset is requested for them (AC-30).
- [ ] Tests prove the gate renders nothing — not a disabled or empty state — when the capability is
      absent.
- [ ] A type test proves a `PermissionId` cannot be passed to the Workspace gate or hook, and vice
      versa.
- [ ] Tests prove the tag set invalidates the actor context after a Workspace mutation, so a lost
      capability stops being offered.
- [ ] Endpoints go through the shared API slice; no Redux slice holds server-owned data
      ([design-handoff.md §Implementation constraints](../design-handoff.md#implementation-constraints)).
- [ ] lint + build + web suite green.

## Notes

The capability projection is never sent back to the server as proof of authority
([sad §7](../sad.md#7-data-and-interface-impact)); it drives presentation only, and every action
still handles a server denial independently.
