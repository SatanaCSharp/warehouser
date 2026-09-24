---
id: T13
title: 'Add the four Workspace Panel queries over the resolved active-Warehouse scope'
layer: 'app'
deps: [T3, T8, T9, T10]
acs: ['AC-14', 'AC-16', 'AC-18', 'AC-19', 'AC-20a']
files_hint:
  - 'apps/server/src/dashboards/usecases/queries/read-demand-pressure.query.ts'
  - 'apps/server/src/dashboards/usecases/queries/read-order-flow.query.ts'
  - 'apps/server/src/dashboards/usecases/queries/read-purchasing-spread.query.ts'
  - 'apps/server/src/dashboards/usecases/queries/read-receipt-reliability.query.ts'
  - 'apps/server/src/dashboards/usecases/usecase.module.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T13 — Add the four Workspace Panel queries over the resolved active-Warehouse scope

> **Blocked by:** [T3](./dashboards-contracts-subpath.md) · [T8](./workspace-performance-repository-foundation.md) · [T9](./order-flow-repository-read.md) · [T10](./receipt-reliability-repository-read.md)
> **Satisfies:** AC-14, AC-16, AC-18, AC-19, AC-20a — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** M · **Layer:** `app`

## Why

The Workspace is resolved from the session and **never** named by the request, which is AC-22 and
the cross-Workspace abuse case by construction. Each query scopes itself to the Workspace's active
Warehouses and reports the archived count as a field of its own ([sad.md §6.6](../sad.md)).

## What

Four queries in `usecases/queries/` — `read-demand-pressure`, `read-order-flow`,
`read-purchasing-spread`, `read-receipt-reliability` — each taking the Workspace from the resolved
request access, handing the repository one persistence-shaped request, and composing its response
inline including the archived-Warehouse count and, for Receipt Reliability, the Warehouses reported
as having **no rate** rather than as a number. Registered in `usecases/usecase.module.ts`.

## Definition of Done

- [ ] No query accepts a Workspace identifier as an argument from the request in any form (AC-22)
- [ ] Every response carries the archived-Warehouse count as its own field
- [ ] Order Flow's response names no Warehouse (AC-16)
- [ ] Purchasing Spread is the only one of the four admitting Closed and Discarded drafts (AC-18)
- [ ] A Warehouse with no admissible line reaches the response as **no rate**, proven by a unit test
      over a repository double (AC-20a)
- [ ] One `*Query` class per file; every branch a named predicate; no service, no mapper
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Shares `usecase.module.ts` with [T11](./warehouse-panel-queries.md)**, so the two serialize.

Neither of these four is a conjunction Panel: the single new Workspace Permission admits the whole
surface, so no query asserts an observed set and none declares one
([data-model.md § Entities](../data-model.md), "One entry, not one per record family").
