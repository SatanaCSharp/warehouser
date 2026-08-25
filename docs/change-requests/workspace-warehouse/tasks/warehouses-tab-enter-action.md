---
id: T12
title: 'Add the Enter action to the Workspace warehouses tab'
layer: 'ui'
deps: ['T1', 'T4']
acs: ['CR-AC-04', 'CR-AC-13', 'CR-AC-14', 'CR-RG-02']
source_refs: ['change.md#CH-08']
files_hint:
  [
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousesTab.tsx',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseList.tsx',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousesTab.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T12 — Add the Enter action to the Workspace warehouses tab

## Why

Administering a site and working in it become one continuous path — and the control follows
**membership**, never Workspace authority, so a Workspace Permission over a Warehouse record can
never become entry into that Warehouse. Derives from
[spec §CR-AC-13, §CR-AC-14](../spec.md#5-acceptance-criteria),
[sad §6.4](../sad.md#64-entering-from-the-workspace-warehouses-tab-cr-ac-13-cr-ac-14) and approved
frames `Workspaces / Workspace Administration / Desktop / v2` (`zubpS`) and `Mobile / v2` (`XeG2t`).

## What

- `WarehousesTab.tsx` — pass the actor's own membership ids down to the list as one prop, read from
  the `GET /workspace/context` response it already holds through `useCurrentWorkspaceContext`. That
  is the same source the switcher reads, so the two controls can never disagree (CR-AC-13). One prop,
  one hop — no new query.
- `WarehouseList.tsx` — each row becomes a container holding the existing selection `<button>` plus,
  **only** for a non-archived Warehouse present in that membership list, a trailing **Enter** link to
  `ROUTES.WAREHOUSE` (HeroUI `Button` as a router `Link`, `default` fill, `LogInIcon` + "Enter",
  28px). It sits in the row header beside the name, **outside** the selection button — a link cannot
  nest inside a `<button>`. Every other row renders **no** Enter control at all: hidden, never
  disabled.
- Rename, archive/restore and grant/withdraw access are unchanged on every row.

## Definition of Done

- [ ] Unit test: Enter renders on a row for a non-archived Warehouse in the actor's membership list
- [ ] Unit test: Enter is **absent** (not disabled) on a non-membership row, on an archived
      membership row, and on an archived non-membership row
- [ ] Unit test: activating Enter navigates to that Warehouse's view
- [ ] Unit test: the administration actions the actor's Workspace Permissions allow are unchanged on
      every row
- [ ] Unit test: row focus order places the selection button before Enter, and Enter is not nested
      inside it
- [ ] The membership list comes from the tab's existing Workspace-context read — no additional query
      is issued
- [ ] lint + vet clean

## Notes

- Hidden, never disabled, is CR-AC-04's omission rule holding here: the two named exceptions to it
  both live in the switcher, not in this tab.
- `WarehouseDetailPane.tsx` is **out of scope**. `change.md` CH-08 names it, but CR-AC-13 attaches
  the action to _rows_, and [sad §5](../sad.md#5-building-blocks-and-ownership) places it on rows
  only. A second Enter affordance in the detail header is a future `design-ui` question.
- Entry from this tab is refused, when it must be, by the same one resolver (T3/T4) — this control
  performs no check of its own beyond deciding whether to render.
- The 390px behavior of the restructured row is verified in T15.
