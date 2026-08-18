---
id: T12
title: 'Carve `WarehousePeopleList.spec.tsx` out of `WarehousesTab.spec.tsx`'
layer: 'tests'
deps: ['T10', 'T11']
acs: ['CR-RG-01', 'CR-RG-03']
files_hint:
  [
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousesTab.spec.tsx',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousePeopleList.spec.tsx',
  ]
source_refs:
  [
    'apps/web/src/modules/warehouse/components/workspace-administration/warehouses/WarehousesTab.spec.tsx',
  ]
owner: 'YuriiH'
estimate: 'M'
status: 'done'
---

# T12 — Carve `WarehousePeopleList.spec.tsx` out of `WarehousesTab.spec.tsx`

## Why

The remaining half of `sad.md` §5.4's table. Two `describe` blocks split across files rather than moving whole — the re-scoping CR-RG-01 explicitly permits, and the alternative (moving a whole block) would drag orchestration cases onto a child mount where the only way to pass is to change what they assert.

## What

Move exactly three cases into a new `WarehousePeopleList.spec.tsx`:

- from "the detail pane and the level boundary": the people-pane read and the level-boundary line. The case "omits the people list without `WORKSPACE_MEMBERS:WATCH` and never requests it" **stays** — it asserts a request that must not fire.
- from "withdrawing warehouse access": the disabled-own-row case. The mutation and the server-denial cases **stay**.

Give the file its own harness; it needs no toast hoist. Add it to `WORKSPACE_MODULE_MANIFEST`, taking it to the **38** entries `sad.md` §5.1 fixes — which is the state CR-AC-01 is finally measured against.

## Definition of Done

- [ ] `WarehousePeopleList.spec.tsx` contains exactly 3 cases whose names match the baseline inventory
- [ ] the disabled-own-row case still asserts the `aria-describedby` sr-only reason, unchanged in content
- [ ] "omits the people list … and never requests it", the withdraw mutation case and the server-denial case all remain in `WarehousesTab.spec.tsx`
- [ ] zero expectations deleted or rewritten
- [ ] `pnpm --filter @warehouser/web lint && test` clean

## Notes

Same abort threshold as T11. Sequenced behind T11 because both edit `WarehousesTab.spec.tsx` — `implement` serializes the lane on the overlapping `files_hint` regardless.
