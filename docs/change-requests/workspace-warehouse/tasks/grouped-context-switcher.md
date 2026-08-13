---
id: T9
title: 'Replace the flat switcher with the grouped context switcher'
layer: 'ui'
deps: ['T1', 'T4']
acs: ['CR-AC-01', 'CR-AC-02', 'CR-AC-03', 'CR-AC-04', 'CR-RG-02', 'CR-RG-03']
source_refs:
  [
    'change.md#CH-01',
    'change.md#CH-02',
    'docs/features/workspaces/spec.md#ac-30-us-10--authorization',
  ]
files_hint:
  [
    'apps/web/src/shared/layouts/WarehouseSwitcher.tsx',
    'apps/web/src/shared/layouts/WarehouseSwitcher.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T9 — Replace the flat switcher with the grouped context switcher

## Why

The switcher becomes navigation, not mutation, and gains the Workspace as a peer destination — the
one control from which an actor moves between administering the organization and working in a site.
Derives from [spec §CR-AC-01–CR-AC-04](../spec.md#5-acceptance-criteria),
[§CR-RG-02, §CR-RG-03](../spec.md#51-regression-boundaries), [sad §4.7](../sad.md#4-solution-strategy),
[sad §6.3](../sad.md#63-moving-between-contexts-through-the-switcher-cr-ac-01-cr-ac-03-cr-ac-19)
and approved frame `Shell / Context Switcher / States / v1` (`Qa6Z3`).

## What

Rewrite `shared/layouts/WarehouseSwitcher.tsx` as one grouped control that is **always** rendered:

- **Structure** — a single Workspace row (the Workspace's name, or the unnamed-Workspace
  placeholder) above a labelled, nested group of the Warehouses the actor holds a membership in.
  Group labels are non-interactive section headers, not selectable rows. A real group structure, not
  visual indentation alone.
- **Navigation, not mutation** — choosing the Workspace row navigates to `ROUTES.WORKSPACE`;
  choosing a Warehouse row navigates to `ROUTES.WAREHOUSE`. The popover closes. No credential,
  password or other proof of identity is requested at any point. The `setActiveWarehouse` write is
  gone from this component — T8 owns it.
- **Inert Workspace row** — exactly when
  `hasWorkspacePermission(workspacePermissionIds, workspaceAdministrationPermissionIds)` is false:
  not a link, not activatable by pointer or keyboard, conveyed as disabled to assistive technology,
  dimmed with a trailing "No access" and one line of explanation, disclosing nothing beyond the
  Workspace's existence and name. Deliberately **not** `WorkspaceGate` — the gate keeps its omission
  semantics and is not weakened.
- **Archived rows** — listed, dimmed, labelled "Archived", not selectable, exactly as today.
- **Current marking** — from `useEnteredWarehouse()` and the `/workspace` match, never from
  `effectiveWarehouseId`; a check indicator plus the word "Current", never colour alone; **no** row
  marked at the root or around a refusal.
- **The three retained messages** (`empty`, `selectionEnded`, `unavailable`) render **beside** the
  grouped control with their existing copy and intent, and only when no context is entered — so an
  actor inside W whose entry write failed never sees "nothing chosen" beside a row marked current
  ([sad §11](../sad.md#11-risks-and-open-questions) row 4).
- Compose from HeroUI v3 primitives (`Select`/`ListBox`/`Menu`, `Select.Popover` `isNonModal`) and
  the semantic tokens only; trigger at 36px in the header and 40px full-width in the context bar.

## Definition of Done

- [ ] Unit test: the grouped structure renders — one Workspace row above a labelled Warehouse group,
      with group labels non-focusable
- [ ] Unit test: both levels are destinations and choosing either navigates and closes the popover,
      requesting no credential
- [ ] Unit test: the Workspace row is inert, disabled to assistive technology, and carries its
      explanation for an actor holding none of the four administration Permissions — both for a
      non-member of the Workspace and for a member holding only Permissions outside the set
- [ ] Unit test: the Workspace row is a live destination for an actor holding any one of the four
- [ ] Unit test: archived rows stay listed, dimmed, labelled and unselectable
- [ ] Unit test: the current row is marked by an indicator plus text, and **no** row is marked at the
      root or around a refusal
- [ ] Unit test: each of the three retained messages renders beside the control with its existing
      copy, and only when no context is entered
- [ ] Unit test: an actor with no selectable row still gets the grouped control, with no invented
      action and no empty affordance
- [ ] No `setActiveWarehouse` dispatch remains in this component
- [ ] lint + vet clean

## Notes

- This narrows `workspaces` AC-30's omission rule by exactly two named exceptions (CR-AC-04): the
  inert Workspace row and archived Warehouse rows. Everything else in the application still omits
  rather than shows unusable. Do not generalize the exception.
- The 399-line existing spec is rewritten for the grouped control; the three retained messages'
  assertions move rather than disappear (CR-RG-03).
- Reads `effectiveWarehouseId` only for the retained messages' existing trigger condition — this is
  the third allowlisted call site (T13). It must **not** be used to mark a row.
- 390px fit and popover containment are verified in T15.
