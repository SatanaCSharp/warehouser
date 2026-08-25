---
id: T2
title: 'Build the WarehouseEntryRefusal component with both refusal reasons'
layer: 'ui'
deps: ['T1']
acs: ['CR-AC-07', 'CR-AC-17']
source_refs: ['change.md#CH-03', 'change.md#CH-04']
files_hint:
  [
    'apps/web/src/shared/components/WarehouseEntryRefusal.tsx',
    'apps/web/src/shared/components/WarehouseEntryRefusal.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T2 — Build the WarehouseEntryRefusal component with both refusal reasons

## Why

`WarehouseLayout` (T4) renders this instead of `<Outlet />` whenever entry is refused, so it must
exist before the layout route can be wired. Derives from [spec §CR-AC-07](../spec.md#5-acceptance-criteria),
[spec §CR-AC-17](../spec.md#5-acceptance-criteria), [sad §5 Added](../sad.md#added) and the
`State Block` mapping in [design-handoff § Component mapping](../design-handoff.md#component-mapping)
(frames `XhXuW`, `ey3Ty`, `msdLz`).

## What

Create `shared/components/WarehouseEntryRefusal.tsx` — icon + heading + body, left-aligned in a
560px column, one component with a `reason: 'not-a-member' | 'archived'` switch:

- `not-a-member` — the non-disclosing refusal. Identical output whether the Warehouse does not
  exist, belongs to another Workspace, belongs to the actor's own Workspace without a membership, or
  the id is malformed. It discloses nothing about existence or contents.
- `archived` — the explicit archived refusal. It names the archived state and nothing further: no
  Role, member, or record of the Warehouse.

Both offer the context switcher as the way out and render as page-level content with a heading
inside the existing shell landmarks. Neither renders any Warehouse content or navigation list.

## Definition of Done

- [ ] Unit test: the `not-a-member` output is identical for every id passed to it, and its copy names
      no Warehouse, id, existence, Role, member or record
- [ ] Unit test: the `archived` output names the archived state and nothing further
- [ ] Unit test: neither branch renders Warehouse content or a navigation list
- [ ] Unit test: both branches point at the context switcher as the way out
- [ ] Uses only T1's keys — no inline copy
- [ ] lint + vet clean

## Notes

The refusal is deliberately **not** a Warehouse view: CR-AC-07's last paragraph forbids rendering the
Warehouse sidebar around it. This component owns only the state block; the "no navigation list beside
it" half is structural and falls out of T4 + T10, because `useEnteredWarehouse()` returns `undefined`
around a refusal.
