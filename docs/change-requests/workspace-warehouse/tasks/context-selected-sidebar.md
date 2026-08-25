---
id: T10
title: 'Make the sidebar context-selected'
layer: 'ui'
deps: ['T4', 'T6']
acs: ['CR-AC-04', 'CR-AC-11', 'CR-AC-12', 'CR-AC-18', 'CR-AC-19']
source_refs:
  [
    'change.md#CH-07',
    'docs/change-requests/web-shell-navigation/spec.md#cr-ac-02-cr-us-01-ch-02--sidebar-navigation-gating-and-responsive-behavior',
  ]
files_hint:
  [
    'apps/web/src/shared/layouts/Sidebar.tsx',
    'apps/web/src/shared/layouts/Sidebar.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T10 — Make the sidebar context-selected

## Why

One flat list mixing both authority levels is what made the Workspace boundary invisible on the web.
Derives from [spec §CR-AC-11, §CR-AC-12, §CR-AC-18, §CR-AC-19](../spec.md#5-acceptance-criteria),
[sad §4.8](../sad.md#4-solution-strategy), [sad §5 Modified](../sad.md#modified) and approved frame
`Shell / Required States / Desktop / v1` (`PV3g8`).

## What

`shared/layouts/Sidebar.tsx` selects its list from the matched route tree — Warehouse context from
`useEnteredWarehouse()`, Workspace context from the `/workspace` match, **never** from the pathname:

- **Warehouse view** — Dashboard and Access, both addressed within that `:warehouseId`, with Access
  still wrapped in the unchanged `ROLES_WATCH ∪ USERS_WATCH` `PermissionGate`. No Workspace
  destination appears.
- **Workspace view** — the Workspace administration entry only. No Warehouse-scoped destination
  appears.
- **No context** (root, and around a refusal) — no navigation list and no empty `<nav>` landmark at
  all.

Whether this is one component with a context switch or two sibling lists is an implementation choice
(design-handoff § Implementation constraints); the 240px container, the drawer variant, the
`accent-soft` active tint and the existing `HeroUI/Sidebar Item` treatment are unchanged.

## Definition of Done

- [ ] Unit test: in a Warehouse view, Dashboard and Access render addressed within the entered
      `:warehouseId`, and no Workspace destination is present
- [ ] Unit test: Access renders only under `ROLES:WATCH` or `USERS:WATCH` **in that Warehouse**, with
      the predicate unmodified
- [ ] Unit test: in the Workspace view only the Workspace entry renders, and no Warehouse-scoped
      destination is present
- [ ] Unit test: with no context — and around a refusal — no list and no `<nav>` landmark renders
- [ ] Unit test: during a W1 → W2 switch the Access entry is **absent** while W2's projection is
      unresolved and appears once it arrives — no skeleton, no placeholder, no held-over W1 value
      (CR-AC-19)
- [ ] The drawer's existing focus trap and focus-return behavior is unchanged
- [ ] lint + vet clean

## Notes

- **Shared file with T6** — T6 re-addressed the Access link so the file compiled after `ROUTES.ACCESS`
  was removed; this task adds the context selection around it. `implement` serializes the two.
- This supersedes `web-shell-navigation` CR-AC-02's fixed sidebar contents. That document is
  **not** edited here — reconciliation is CR-AC-15's ship-time step.
- CR-AC-19's loading behavior is inherited **verbatim**, not re-designed: showing W1's answer for W2
  would be exactly the cross-Warehouse leak CH-04 exists to remove.
- The "no drawer toggle when there is no list" half of CR-AC-18 lives in `RootLayout` (T11).
