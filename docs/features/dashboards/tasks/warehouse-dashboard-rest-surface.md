---
id: T12
title: 'Add the Warehouse Dashboard REST surface: four archived-tolerant GETs behind SessionAuthGuard and WarehouseAccessGuard'
layer: 'ports'
deps: [T11]
acs: ['AC-01', 'AC-02', 'AC-13', 'AC-23', 'AC-24']
files_hint:
  - 'apps/server/src/dashboards/rest/controllers/warehouse-dashboard.controller.ts'
  - 'apps/server/src/dashboards/rest/dtos/'
  - 'apps/server/src/dashboards/rest/rest.module.ts'
  - 'apps/server/src/dashboards/index.ts'
  - 'apps/server/src/app.module.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T12 — Add the Warehouse Dashboard REST surface: four archived-tolerant GETs behind SessionAuthGuard and WarehouseAccessGuard

> **Blocked by:** [T11](./warehouse-panel-queries.md)
> **Satisfies:** AC-01, AC-02, AC-13, AC-23, AC-24 — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** M · **Layer:** `ports`

## Why

Four `GET` endpoints, one per Panel, whose only input is the route's `warehouseId`. A membership
held in another Warehouse must deny here, which is AC-24 by construction, and an archived Warehouse
must be served on exactly the pre-archiving terms, which is AC-23
([sad.md §6.2](../sad.md), [sad.md §7](../sad.md)).

## What

`rest/controllers/warehouse-dashboard.controller.ts` with the prefix already in the tree,
`api/v1/warehouses/:warehouseId/dashboard/…`:

| Route                  | Required                | Observed                                         |
| ---------------------- | ----------------------- | ------------------------------------------------ |
| `coverage-gap`         | `ITEMS:WATCH`           | `CUSTOMER_ORDERS:WATCH`, `PURCHASE_DRAFTS:WATCH` |
| `arrival-timing`       | `CUSTOMER_ORDERS:WATCH` | `PURCHASE_DRAFTS:WATCH`                          |
| `purchasing-pipeline`  | `PURCHASE_DRAFTS:WATCH` | —                                                |
| `reason-concentration` | `REJECTIONS:WATCH`      | —                                                |

Plus `rest/dtos/` as `createZodDto` adapters over the contracts subpath, `rest/rest.module.ts`,
`index.ts` exporting `DashboardsUsecaseModule` and `DashboardsRestModule`, and registration in
`app.module.ts`.

## Definition of Done

- [ ] Every handler declares `@ArchivedTolerantRead()` from **`shared/access/`** — not
      `shared/decorators/`, where the three Permission decorators live
- [ ] Each endpoint denies without its required Permission, with the shared non-enumerating error
- [ ] A membership carrying every watch Permission in **another** Warehouse of the same Workspace
      denies here, disclosing nothing about whether that Warehouse holds anything (AC-24)
- [ ] Each endpoint succeeds over an archived Warehouse **with** the decorator and denies
      **without** it — both directions asserted (AC-23)
- [ ] For both conjunction Panels, the response is asserted on **both sides** of each observed
      Permission (AC-02, AC-13)
- [ ] No response carries `customer_id`, `customer_delivery_address_id`, `customer_name` or
      `frozen_customer_name` — asserted per endpoint
- [ ] No request body exists on any of the four; `@Transactional()` appears nowhere in the module
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Shares a lane with [T14](./workspace-dashboard-rest-surface.md)** — `rest.module.ts`,
`rest/dtos/`, `index.ts` and `app.module.ts` are common to both, so `implement` serializes them and
may close the pair with one gate.

The declared observed set on a handler and the predicate its query asserts must agree. A handler
declaring an observed Permission its query never asserts discloses silently — which is why the
both-sides test is mandatory rather than optional ([sad.md §11](../sad.md)).
