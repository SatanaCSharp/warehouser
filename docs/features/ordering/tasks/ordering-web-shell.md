---
id: T17
title: 'Add the ordering web shell: three routes, router children, permission-gated sidebar entries, eight icons and three i18n namespaces'
layer: 'ui'
deps: ['T2']
acs: ['AC-05', 'AC-22', 'AC-23']
files_hint:
  [
    'apps/web/src/shared/constants/routes.ts',
    'apps/web/src/router.ts',
    'apps/web/src/shared/layouts/Sidebar.tsx',
    'apps/web/src/shared/icons/',
    'apps/web/src/i18n.ts',
    'apps/web/public/locales/en/',
    'apps/web/public/locales/uk/',
    'apps/web/src/test/locale-baseline.json',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T17 — Add the ordering web shell: three routes, router children, permission-gated sidebar entries, eight icons and three i18n namespaces

> **Blocked by:** [T2](./grant-ordering-permissions-migration.md) · **Layer:** `ui` · **Owner:** Frontend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-05](../spec.md), [AC-22](../spec.md), [AC-23](../spec.md)

## Why

Three destinations, their addresses, their permission-gated nav entries and their i18n namespaces are shared surface every web module task builds on. Derives from [design-handoff § Information architecture](../design-handoff.md), [sad §5 Web](../sad.md) and [sad §8 Naming](../sad.md).

## What

- Add three `ROUTE_SEGMENTS` (`DEMAND`, `PURCHASE_DRAFTS`, `ITEMS`) and the three `ROUTES.WAREHOUSE_*` addresses in `shared/constants/routes.ts`. No path literal is repeated anywhere else.
- Add three children of `warehouseRoute` in `router.ts`, declared **before** `warehouseCatchAllRoute` so the splat keeps ranking last.
- Append three entries to `warehouseNavList` in `shared/layouts/Sidebar.tsx` after `Dashboard` and `Access`, each wrapped in its own `WarehousePermissionGate`.
- Hand-roll the eight missing icons — `clipboard-list`, `file-text`, `package`, `chevron-up`, `calendar`, `lock`, `truck`, `corner-down-right` — following the existing `shared/icons/` pattern and Lucide geometry.
- Register the `customer-order`, `purchase-draft` and `item` i18n namespaces and add the en/uk locale files.

## Definition of Done

- [ ] Router tests prove the three children resolve and that `warehouseCatchAllRoute` still ranks last
- [ ] Sidebar tests prove each entry is **absent** — not disabled, not empty — when its watch Permission is missing, matching the rule `Sidebar.tsx` already applies to `Access` (AC-05, AC-22)
- [ ] A test proves an archived Warehouse still renders the entries whose watch Permission the actor holds (AC-23)
- [ ] The eight icons render and follow the existing hand-rolled pattern
- [ ] The i18n suite passes: three registered namespaces, full en/uk key parity, and a deliberately regenerated `locale-baseline.json`
- [ ] `pnpm --filter @warehouser/web lint` and `pnpm exec tsc -p tsconfig.json --noEmit` clean

## Notes

- The Demand destination lives in `modules/customer-order`, per `sad.md` §8 Naming: a Demand Line is a derived view, there is no Demand entity, and the module's mutations are all Customer Order lifecycle. `design-handoff.md` writes `modules/demand/` while explicitly deferring placement to the SAD. The user-visible destination, sidebar label and copy stay **Demand** either way. This resolves the `sad.md` §11 item for the Frontend Lead.
- The drift-count badge drawn on the `Purchase drafts` nav entry is **dropped** — it was pinned by no acceptance criterion (`sad.md` §11) and the decision at this stage was to drop rather than invent one. US-08 is served by the Drift Signal on the drafts list (AC-16a) and the per-link detail (AC-16). Re-adding it needs its own criterion first.
- Shares the locale directories with T18–T20, which depend on this task in any case.
