---
id: T16
title: 'Replace the Warehouse placeholder page with the Dashboard shell: loader, grid, reflow, denial and archived strip'
layer: 'ui'
deps: [T3, T12, T15]
acs: ['AC-01', 'AC-02', 'AC-02a', 'AC-09', 'AC-13', 'AC-23', 'AC-26']
files_hint:
  - 'apps/web/src/modules/warehouse/page.tsx'
  - 'apps/web/src/modules/warehouse/loaders/warehouse-dashboard.loader.ts'
  - 'apps/web/src/modules/warehouse/api/warehouse-dashboard-api.ts'
  - 'apps/web/src/modules/warehouse/components/dashboard/WarehouseDashboardGrid.tsx'
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T16 — Replace the Warehouse placeholder page with the Dashboard shell: loader, grid, reflow, denial and archived strip

> **Blocked by:** [T3](./dashboards-contracts-subpath.md) · [T12](./warehouse-dashboard-rest-surface.md) · [T15](./chart-primitives-and-tokens.md)
> **Satisfies:** AC-01, AC-02, AC-02a, AC-09, AC-13, AC-23, AC-26 — see [spec.md §5](../spec.md)
> **Owner:** Frontend Lead · **Estimate:** L · **Layer:** `ui`

## Why

`modules/warehouse`'s `warehouseDashboardRoute` is already the Warehouse Dashboard's route — it is
the index child of the Warehouse layout and its page renders `DesignSystemExample`. The approved
design replaces exactly that page; **no route is created on the Warehouse side**
([sad.md §1](../sad.md), [sad.md §6.1](../sad.md)).

## What

Inside the existing `modules/warehouse` home — no new module, no `ROUTE_SEGMENTS` entry, no nav
item:

- `loaders/warehouse-dashboard.loader.ts` — returns immediately without issuing anything unless
  `admitsReads(context)`; awaits `accessPermissionsApi.getCurrentAccess`; dispatches **only** the
  Panel reads whose whole Permission set the projection reports, each awaited;
- `api/warehouse-dashboard-api.ts` — four RTK Query endpoints injected into the shared API slice,
  **refetching on entry**;
- `page.tsx` — replaces `DesignSystemExample`; visually-hidden `h1`, no masthead, lede or chip row;
- `components/dashboard/WarehouseDashboardGrid.tsx` — the two-column grid, the fixed order, the
  reflow rule, the denial, the archived strip.

## Definition of Done

- [ ] A member admitting **no** Panel reaches a denial that names no Panel, no Permission and
      nothing the Warehouse holds, with no frame, axis or total (AC-02) — and the loader issues
      nothing at all
- [ ] A member admitting **one** Panel sees it spanning both columns at its natural height, with
      nothing indicating a Panel was withheld (AC-02a)
- [ ] A member lacking only `REJECTIONS:WATCH` sees three Panels reflowed with **no frame, title or
      count** in the fourth's place (AC-13)
- [ ] Panel order is **Coverage Gap → Reason Concentration → Arrival Timing → Purchasing Pipeline**
- [ ] An archived Warehouse adds the `ArchivedWarehouseChip` strip and changes no Permission term
      (AC-23)
- [ ] Route tests prove exactly the permitted reads are dispatched at one, three and four Panels,
      that **nothing** is issued on a refused verdict, and that **no read is issued after paint**
- [ ] Re-entering after a Customer Order is recorded shows the change; **no tag invalidation is
      used** (AC-26)
- [ ] The shipped `WarehouseEntryRefusal` and `guards/landing.guard.ts` suites stay green — this is
      how **AC-09 continues to hold by inheritance**; no code here implements it
- [ ] `pnpm --filter @warehouser/web build` clean
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Freshness is refetch-on-entry, not tag invalidation.** No mutation across `customer-orders`,
`items`, `purchase-drafts` or `arrival-inspection` knows these reads exist, and a forgotten tag
fails silently and shows a stale figure — which `spec.md` §7 names the most expensive failure this
feature can have ([sad.md §8](../sad.md)).

**No per-Panel spinner or skeleton.** The route owns first-paint readiness and its
`pendingComponent` is the only waiting affordance.

**There is no empty state.** A Panel with no rows draws its frame, legend and axis with no marks; it
is not withheld.

`components/dashboard/` is a **component grouping**, not a module home — no `route.tsx`, no
`page.tsx`, no module-list entry.
