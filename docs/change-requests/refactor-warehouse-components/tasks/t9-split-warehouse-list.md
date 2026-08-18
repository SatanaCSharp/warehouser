---
id: T9
title: 'Split `WarehouseList.tsx` into five flat siblings'
layer: 'ui'
deps: ['T7']
acs: ['CR-AC-04', 'CR-RG-02']
files_hint:
  [
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseList.tsx',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseSearchField.tsx',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseListSkeleton.tsx',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseRow.tsx',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseEnterLink.tsx',
  ]
source_refs:
  [
    'apps/web/src/modules/warehouse/components/workspace-administration/warehouses/WarehouseList.tsx',
  ]
owner: 'YuriiH'
estimate: 'M'
status: 'done'
---

# T9 — Split `WarehouseList.tsx` into five flat siblings

## Why

CH-W5, first half. [`sad.md` §5.3](../sad.md#53-the-ch-w5-component-split--fixes-cr-ac-04s-file-set) fixes the file set that CR-AC-04's "matches the split recorded in this request's design artifact" refers to.

## What

Carve four presentational leaves out of the already-moved `WarehouseList.tsx` (157 → ~70 lines), all **flat siblings inside `warehouses/`** — [`sad.md` §4.4](../sad.md#44-split-components-stay-flat-inside-the-domain-group) terminates the nesting recursion at the domain group, so no new directory is created:

| File                        | Props         | Owns                                                                                                        |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `WarehouseList.tsx`         | 7 (unchanged) | `query`; the filter; the 3-way branch; the `<ul aria-label>`                                                |
| `WarehouseSearchField.tsx`  | 2             | the `SearchField` group markup                                                                              |
| `WarehouseListSkeleton.tsx` | 0             | the labelled 3-skeleton placeholder                                                                         |
| `WarehouseRow.tsx`          | 5             | the card, the selection `<button>`, the meta line, the archived `Chip`; derives `isArchived` and `canEnter` |
| `WarehouseEnterLink.tsx`    | 1             | the `RouterLink`, its per-Warehouse `aria-label`, its `buttonVariants` styling                              |

Carry each existing explanatory docblock to the file that inherits its subject. CR-RG-02's structural obligations land in named files: the `canEnter` derivation and its docblock in `WarehouseRow.tsx`; the sibling-not-nested constraint and the `aria-label` rationale in `WarehouseEnterLink.tsx`.

Add the **four** new components to `WORKSPACE_MODULE_MANIFEST`, taking it from 30 entries to 34.

## Definition of Done

- [ ] each of the five files exports exactly one component and passes `writing-web-components.md` §9's checklist
- [ ] the three-way `if (isLoading) … else if (warehouses.length === 0) … else …` assignment to `content` **survives in `WarehouseList`** — only branch bodies extract
- [ ] the empty-state `<p role="status">` stays inline (`sad.md` §5.3, O3)
- [ ] `warehouse` travels list → row → link and no further; `membershipWarehouseIds` stops at the row
- [ ] no new hook, context or store read is introduced at any leaf
- [ ] the existing `WarehousesTab.spec.tsx` still passes unchanged — this task moves no test
- [ ] `pnpm --filter @warehouser/web lint && test && build` clean

## Notes

**CR-AC-04 hard rules:** no nested ternary and no lookup-shaped `if` chain anywhere in the split; hops counted from `WarehouseList`, so `WarehousesTab → WarehouseList` is **not** hop one.

**CR-RG-02:** a non-qualifying row renders **no Enter control at all** — hidden, never disabled — via the row's single inline `{canEnter ? … : null}` guard. The link stays a **sibling** of the selection `<button>`, never nested, so the selection button keeps focus order.

`sad.md` §11 **O3** is still open: this task keeps the `<ul>` inside `WarehouseList` rather than extracting a sixth component around the `map`. CR-AC-04 grants the design artifact the deciding vote; proceed unless review objects.

Runs parallel to T10 — different files, no `files_hint` overlap.
