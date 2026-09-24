---
id: T11
title: "Add the dashboards module's panel-access predicates and the four Warehouse Panel queries"
layer: 'app'
deps: [T3, T5, T6, T7]
acs: ['AC-02', 'AC-03', 'AC-07', 'AC-08a', 'AC-10', 'AC-11', 'AC-12', 'AC-13']
files_hint:
  - 'apps/server/src/dashboards/domain/'
  - 'apps/server/src/dashboards/usecases/queries/read-coverage-gap.query.ts'
  - 'apps/server/src/dashboards/usecases/queries/read-arrival-timing.query.ts'
  - 'apps/server/src/dashboards/usecases/queries/read-purchasing-pipeline.query.ts'
  - 'apps/server/src/dashboards/usecases/queries/read-reason-concentration.query.ts'
  - 'apps/server/src/dashboards/usecases/usecase.module.ts'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T11 — Add the dashboards module's panel-access predicates and the four Warehouse Panel queries

> **Blocked by:** [T3](./dashboards-contracts-subpath.md) · [T5](./coverage-gap-repository.md) · [T6](./arrival-timing-repository.md) · [T7](./warehouse-purchasing-and-rejection-repositories.md)
> **Satisfies:** AC-02, AC-03, AC-07, AC-08a, AC-10, AC-11, AC-12, AC-13 — see [spec.md §5](../spec.md)
> **Owner:** Backend Lead · **Estimate:** L · **Layer:** `app`

## Why

Two of the four Warehouse Panels are admitted by a **set** of watch Permissions, and
`@RequiredPermission` is variadic but the guard evaluates only the first identifier — so two of them
have no expressible required declaration today. The conjunction is asserted in the query, over the
resolved observed-grant set, before any read is issued
([ADR 0001](../adr/0001-conjunction-gated-panel-reads.md), [sad.md §6.2](../sad.md)).

## What

The new `apps/server/src/dashboards` module's domain and query layers:

- `domain/predicates/panel-access.predicates.ts` — `readsCoverageGap`, `readsArrivalTiming` over
  `observedPermissionIds`, as named predicates;
- `domain/predicates/dashboard-week.predicates.ts` — the named branch predicates the queries read;
- `usecases/queries/` — `read-coverage-gap`, `read-arrival-timing`, `read-purchasing-pipeline`,
  `read-reason-concentration`, each holding its own Panel's rules and composing its response
  **inline**;
- `usecases/usecase.module.ts`.

**No `domain/entities/`, no `domain/services/`, no `domain/mappers/`, no `handlers/`.** A service
exactly one use case calls is forbidden, and an anonymous inline composition is not a mapper.

## Definition of Done

- [ ] Each conjunction query asserts its predicate and raises the shared non-enumerating denial
      **before** issuing any read (AC-02, AC-13, ADR 0001)
- [ ] Unit tests over repository doubles exercise the conjunction on **both sides of every member**
      of each set — the risk `sad.md` §11 names is a handler declaring an observed Permission its
      query never asserts
- [ ] Each state predicate is proven (AC-03, AC-07, AC-08a, AC-10, AC-11, AC-12)
- [ ] Every exclusion count is carried through from the repository, never derived in the query
- [ ] No query takes a logger parameter and no `with*` timing wrapper exists
- [ ] One `*Query` class per file in `usecases/queries/`; every branch a named predicate
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Shares `usecase.module.ts` with [T13](./workspace-panel-queries.md)**, so the two serialize.

Queries are **not** pass-throughs: each holds which states count, which exclusions are stated, how
buckets are bounded, and the Permission conjunction, and hands the repository a persistence-shaped
request.

The Permission conjunction is deliberately **not** a repository concern — a repository that knew
about `observedPermissionIds` would be importing a feature concept
([data-model.md § Repository boundaries](../data-model.md)).
