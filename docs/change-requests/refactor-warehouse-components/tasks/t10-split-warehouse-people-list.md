---
id: T10
title: 'Split `WarehousePeopleList.tsx` into `WarehousePersonRow`'
layer: 'ui'
deps: ['T7']
acs: ['CR-AC-04', 'CR-RG-03']
files_hint:
  [
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousePeopleList.tsx',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehousePersonRow.tsx',
  ]
source_refs:
  [
    'apps/web/src/modules/warehouse/components/workspace-administration/warehouses/WarehousePeopleList.tsx',
  ]
owner: 'YuriiH'
estimate: 'S'
status: 'done'
---

# T10 — Split `WarehousePeopleList.tsx` into `WarehousePersonRow`

## Why

CH-W5, second half. `sad.md` §5.3's second table fixes the shape; it is what removes `WorkspaceUser | null` from the list.

## What

Extract one component from the already-moved `WarehousePeopleList.tsx`, flat inside `warehouses/`:

- `WarehousePeopleList.tsx` — 2 props, keeps the heading, the description, the `<ul aria-label>` and its `map`.
- `WarehousePersonRow.tsx` — 2 props (`person`, `warehouse`), owns the `<li>`, the email, the `WAREHOUSE_MEMBERSHIPS_REVOKE` gate, the `isSelf` disabled state with its `aria-describedby` sr-only reason, the open flag, and `WithdrawWarehouseAccessDialog`.

Because the row is mounted per person, the dialog seeds itself from the person it was opened for and the list's `WorkspaceUser | null` becomes a boolean at the row — `writing-web-components.md` §7's sanctioned pattern for several dialogs sharing one trigger surface.

Add `WarehousePersonRow` to `WORKSPACE_MODULE_MANIFEST`, taking it to 35 entries.

## Definition of Done

- [ ] both files export exactly one component and pass `writing-web-components.md` §9's checklist
- [ ] the gate's `<>…</>` fragment produces no element, so the `<span class="sr-only">` remains the `Button`'s sibling inside the same `<li>` — rendered DOM byte-identical
- [ ] the actor's own row is still disabled with its reason exposed via `aria-describedby`, and **no** Warehouse Role is displayed for any person
- [ ] `warehouse` travels list → row → dialog — two hops from `WarehousePeopleList`
- [ ] the existing `WarehousesTab.spec.tsx` still passes unchanged
- [ ] `pnpm --filter @warehouser/web lint && test && build` clean

## Notes

**Rejected shape (`sad.md` §5.3):** a three-file split that also extracts a `WithdrawWarehouseAccessAction` — it pushes the hop count to three.

**CR-RG-03:** the protected Warehouse Manager case stays refused by the **server**, never guessed at in the client. Do not add a client-side prediction of it.

`selectCurrentUser` call sites stay at **three** — `MemberDirectory.tsx`, `GiveWarehouseAccessDialog.tsx` and the new `WarehousePersonRow.tsx` — which is what keeps T8's `MODULE_SURFACE.auth` comment accurate.

Runs parallel to T9.
