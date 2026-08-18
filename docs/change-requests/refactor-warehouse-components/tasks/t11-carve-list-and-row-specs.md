---
id: T11
title: 'Carve `WarehouseList.spec.tsx` and `WarehouseRow.spec.tsx` out of `WarehousesTab.spec.tsx`'
layer: 'tests'
deps: ['T9']
acs: ['CR-RG-01', 'CR-RG-02', 'CR-RG-04']
files_hint:
  [
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousesTab.spec.tsx',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseList.spec.tsx',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseRow.spec.tsx',
  ]
source_refs:
  [
    'apps/web/src/modules/warehouse/components/workspace-administration/warehouses/WarehousesTab.spec.tsx',
  ]
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T11 — Carve `WarehouseList.spec.tsx` and `WarehouseRow.spec.tsx` out of `WarehousesTab.spec.tsx`

## Why

CH-W5's spec half — [`sad.md` R1](../sad.md#risks) calls this the largest single piece of work and the place a regression can hide. [`sad.md` §4.6](../sad.md#46-test-movement-is-governed-by-subject-not-by-describe-block) supplies the rule that makes CR-RG-01's drift boundary mechanically checkable.

## What

Apply `sad.md` §4.6's subject rule: a case moves to a component's colocated spec when the subject its expectations **name** is that component _and_ it can be re-mounted there with every expectation's subject and expected value byte-identical. A case asserting an orchestration outcome — a request that fires or does not fire, a mutation, a toast, a cross-pane effect, a navigation — **stays**.

Per `sad.md` §5.4:

- → `WarehouseList.spec.tsx` (7): all six of "the Warehouse list", plus "exposes the list as a labelled list of buttons that report their selected state" from the accessibility block.
- → `WarehouseRow.spec.tsx` (4): the row-scoped Enter cases — renders Enter, per-Warehouse accessible name, omits on the three non-qualifying row kinds, selection-button-before-Enter focus order.
- **Stay** in `WarehousesTab.spec.tsx`: "navigates to that Warehouse's view", "leaves rename/archive/grant reachable on a row that also renders Enter", and the two dialog focus cases.

Each new file carries its own harness (`renderWithProviders`, `stubWorkspaceServer`, a memory router). Both mount their subject with **plain props and no server stub** — the toast hoist and `test/workspace-fixtures` are needed only where a mutation or toast is asserted.

Add both new specs to `WORKSPACE_MODULE_MANIFEST`, taking it to 37 entries.

## Definition of Done

- [ ] `WarehouseList.spec.tsx` contains exactly 7 cases and `WarehouseRow.spec.tsx` exactly 4, with names matching `test/baselines/warehouses-tab-cases.json`
- [ ] every moved expectation's subject and expected value is diff-identical to the baseline — zero deleted, zero rewritten to pass
- [ ] both files mount with plain props and no server stub (a leaf that cannot mount without one has acquired a read the split forbids)
- [ ] the four CR-RG-04 permission cases and both dialog focus cases remain in `WarehousesTab.spec.tsx`
- [ ] `pnpm --filter @warehouser/web lint && test` clean

## Notes

**Abort threshold (`change.md` §6, CR-RG-01).** A moved spec that requires an **assertion** change to pass stops the request. Permitted and not drift: re-scoped `describe` blocks, a per-file harness, mounting a child in isolation, and **new** setup-level assertions that pin the harness. Forbidden: an existing expectation that now asserts a different value or a different subject, or any expectation deleted to make a split work.

The four new leaves — `WarehouseSearchField`, `WarehouseListSkeleton`, `WarehouseEnterLink`, `WarehousePersonRow` — get **no** new spec (`sad.md` §5.4). Writing fresh cases for them would add assertions this request has no criterion for.

Shares a lane with T12 (both edit `WarehousesTab.spec.tsx`); T12 is sequenced behind it.
