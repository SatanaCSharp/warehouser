---
id: T4
title: 'Establish the Warehouse layout route, its dashboard child and useEnteredWarehouse'
layer: 'wiring'
deps: ['T2', 'T3']
acs: ['CR-AC-05', 'CR-AC-07', 'CR-AC-17', 'CR-AC-20']
source_refs: ['change.md#CH-03', 'change.md#CH-10']
files_hint:
  [
    'apps/web/src/shared/constants/routes.ts',
    'apps/web/src/routes/warehouse.route.tsx',
    'apps/web/src/routes/catch-all.route.tsx',
    'apps/web/src/shared/layouts/WarehouseLayout.tsx',
    'apps/web/src/shared/layouts/WarehouseLayout.spec.tsx',
    'apps/web/src/shared/hooks/useEnteredWarehouse.ts',
    'apps/web/src/shared/hooks/useEnteredWarehouse.spec.tsx',
    'apps/web/src/modules/warehouse/route.tsx',
    'apps/web/src/modules/warehouse/page.tsx',
    'apps/web/src/modules/warehouse/components/DesignSystemExample.tsx',
    'apps/web/src/modules/warehouse/components/DesignSystemExample.spec.tsx',
    'apps/web/src/modules/home/page.tsx',
    'apps/web/src/router.ts',
    'apps/web/src/router.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T4 — Establish the Warehouse layout route, its dashboard child and useEnteredWarehouse

## Why

The load-bearing decision of this change request: one layout route establishes the Warehouse context
and everything below it inherits. Derives from
[ADR 0001](../adr/0001-warehouse-view-as-a-route-established-context.md), [sad §4.1–4.3, §4.6,
§4.8](../sad.md#4-solution-strategy) and [sad §6.2](../sad.md#62-entering-a-warehouse-by-any-path-cr-ac-02-cr-ac-05-cr-ac-07-cr-ac-09-cr-ac-14-cr-ac-17).
Sequenced first among the routing work because [sad §11](../sad.md#11-risks-and-open-questions)
requires the three TanStack Router v1 behaviors to be pinned by tests before anything is built on
them.

## What

- `shared/constants/routes.ts` — add `WAREHOUSE: '/warehouses/$warehouseId'` and
  `WAREHOUSE_ACCESS: '/warehouses/$warehouseId/access'`, plus a sibling `ROUTE_SEGMENTS` const
  carrying the relative segments children declare (`'access'`, `'$'`). **Leave `ACCESS` in place** —
  T6 removes it together with every reference.
- `routes/warehouse.route.tsx` — the layout route (no page of its own): path `ROUTES.WAREHOUSE`,
  `beforeLoad` running `requireAuth` then `resolveWarehouseEntry` and returning the verdict into the
  match context, `WarehouseLayout` as component. Placed beside `__root.route.tsx` per
  [sad §5 "Placement note"](../sad.md#5-building-blocks-and-ownership).
- `shared/layouts/WarehouseLayout.tsx` — `<Outlet />` for `entered`, `WarehouseEntryRefusal` with the
  matching `reason` otherwise.
- `shared/hooks/useEnteredWarehouse.ts` — the single reader of the verdict from that match, read
  **non-throwing** so it also answers outside the Warehouse branch. Returns `string | undefined`.
- `modules/warehouse/{route,page}.tsx` — the index child, rendering `DesignSystemExample` **moved
  unchanged** from `modules/home/components/` (spec.md §8's standing default, frame `UOTlR`).
- `routes/catch-all.route.tsx` — the **Warehouse-level** splat child (`ROUTE_SEGMENTS.SPLAT`) whose
  `beforeLoad` throws `redirect({ to: ROUTES.HOME })`. The root-level splat is T7's.
- `router.ts` — register `warehouseRoute.addChildren([warehouseDashboardRoute, warehouseCatchAllRoute])`
  as a root child.
- `modules/home/page.tsx` — `/` stops being a dashboard; render the no-context state block
  (CR-AC-18). The landing rules that redirect away from it are T7's.

## Definition of Done

- [ ] Route-integration test pins that a parent `beforeLoad`'s return value reaches the match context
- [ ] Route-integration test pins that `beforeLoad` does **not** re-run while navigating between the
      layout's own children
- [ ] Route-integration test pins that the `$` splat child ranks **below** the layout's explicit
      children
- [ ] Route-integration test: `/warehouses/X` for a non-member renders the non-disclosing refusal
      **at that address** — no redirect, no landing resolution, no access-projection request
- [ ] Route-integration test: `/warehouses/X/anything` behaves identically, proving the entry check
      precedes any not-found handling
- [ ] Route-integration test: an archived membership address renders the archived refusal
- [ ] Hook unit test: `useEnteredWarehouse` returns the id only for an `entered` verdict, and
      `undefined` at the root, in the Workspace view and around a refusal
- [ ] `DesignSystemExample` and its spec are moved, not copied, and render unchanged at
      `/warehouses/:warehouseId`
- [ ] `pnpm --filter @warehouser/web build` is green (`ROUTES.ACCESS` still resolves at this point)
- [ ] lint + vet clean

## Notes

- **Compile-coupled lane with T6** on `shared/constants/routes.ts` and `router.ts`: this task only
  _adds_, T6 removes `ROUTES.ACCESS` with all its references. Neither lands red.
- **Shared file with T7** — `routes/catch-all.route.tsx` holds both splats; T7 appends the root one.
- After this task and before T7, `/` renders the no-context state for every actor. That is an
  expected intermediate state on the branch, not a shippable one.
- If the installed TanStack Router version diverges on any of the three pinned behaviors, stop and
  raise it: the verdict _shape_ is unaffected, but the publication mechanism would need rework and
  ADR 0001 would need revisiting.
