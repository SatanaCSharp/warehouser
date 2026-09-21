---
id: T14
title: 'Add the Workspace Dashboard REST surface: four session-scoped GETs behind the new Workspace Permission'
layer: 'ports'
deps: [T2, T13]
acs: ['AC-15', 'AC-22']
files_hint:
  - 'apps/server/src/dashboards/rest/controllers/workspace-dashboard.controller.ts'
  - 'apps/server/src/dashboards/rest/dtos/'
  - 'apps/server/src/dashboards/rest/rest.module.ts'
  - 'apps/server/src/dashboards/index.ts'
  - 'apps/server/src/app.module.ts'
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T14 — Add the Workspace Dashboard REST surface: four session-scoped GETs behind the new Workspace Permission

> **Blocked by:** [T2](./dashboard-permission-catalogue-migration.md) · [T13](./workspace-panel-queries.md)
> **Satisfies:** AC-15, AC-22 — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** S · **Layer:** `ports`

## Why

`WorkspaceAccessGuard` resolves a single required Workspace Permission from the session and names no
target — which is exactly the shape this surface needs, and is why no route may carry a Workspace
identifier ([sad.md §6.6](../sad.md), [AC-15](../spec.md), [AC-22](../spec.md)).

## What

`rest/controllers/workspace-dashboard.controller.ts` with the prefix already in the tree,
`api/v1/workspace/dashboard/…` — `demand-pressure`, `order-flow`, `purchasing-spread`,
`receipt-reliability` — each behind `SessionAuthGuard` + `WorkspaceAccessGuard` requiring
`WAREHOUSE_PERFORMANCE:WATCH`. DTOs as `createZodDto` adapters over the contracts subpath;
registration in `rest.module.ts`, `index.ts` and `app.module.ts`.

## Definition of Done

- [ ] No route names or accepts a Workspace identifier in a path, query or body position
- [ ] A Workspace Member without the Permission is denied, and the denial body carries no Warehouse
      name, quantity, count or share and nothing about how many Warehouses the Workspace holds
      (AC-15)
- [ ] A Workspace Member holding the Permission and holding **no** membership in any Warehouse of
      the Workspace is **admitted** (AC-22)
- [ ] A Warehouse Member holding every watch Permission in their own Warehouse and no Workspace Role
      is **denied** (AC-22)
- [ ] `WAREHOUSE_PERFORMANCE:WATCH` appears in no other handler's metadata anywhere in the tree —
      asserted by a search-based test
- [ ] No request body, no `@Transactional()`
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Shares a lane with [T12](./warehouse-dashboard-rest-surface.md)** — `rest.module.ts`,
`rest/dtos/`, `index.ts` and `app.module.ts`.

These handlers declare **no** `@ArchivedTolerantRead()`: the Workspace surface scopes itself to
active Warehouses inside the query rather than tolerating an archived target.

The new Permission is a read authority and nothing else. Holding it changes no role, no membership
and no Warehouse, and grants no read of any individual Customer Order, Purchase Draft, Item or
Rejection record ([spec.md §6.1](../spec.md) abuse cases).
