---
id: T4
title: 'Reconcile `placing-web-components.md` §"When not to nest"'
layer: 'docs'
deps: ['T2']
acs: ['CR-AC-03']
files_hint: ['docs/system/guides/placing-web-components.md']
source_refs: ['docs/system/guides/placing-web-components.md']
owner: 'YuriiH'
estimate: 'S'
status: 'done'
---

# T4 — Reconcile `placing-web-components.md` §"When not to nest"

## Why

CH-D3. [`sad.md` §1](../sad.md) records that this guide currently teaches the pre-move arrangement as _correct placement_ — a reviewer reading it mid-request is instructed to reject the change in progress.

## What

Rewrite §"When not to nest"'s worked example. The arrangement it currently cites (`modules/workspace` importing `WarehousesTab` from `modules/warehouse` through the declared surface) becomes intra-module at T7, so the example stops existing.

Pick a replacement from a cross-module surface import that survives — the remaining `MODULE_SURFACE` entries after T7 are the candidate set (`sad.md` §5.6). Keep the guide's §"Grouping owned components by domain" intact: `sad.md` §4.4 relies on it to place the split siblings flat inside `warehouses/`.

## Definition of Done

- [ ] no occurrence of `WarehousesTab` or `modules/warehouse/components/workspace-administration` remains in the guide
- [ ] the replacement example names an import that is still declared in `MODULE_SURFACE` after T7
- [ ] §"Grouping owned components by domain" is unchanged
- [ ] the file passes the repository's markdown lint

## Notes

Verify the replacement example against `apps/web/src/test/module-surface.ts` **as T7 will leave it** (`sad.md` §5.6: `warehouse` drops to `route` + `hooks/useRecordWarehouseEntry`), not as it stands today — otherwise this guide goes stale again one task later.
