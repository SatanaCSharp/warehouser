---
id: T10
title: 'Move the four workspace list queries, the authority predicates and the role-deletion service into access'
layer: 'app'
deps: ['T8']
acs: ['CR-AC-06', 'CR-AC-08', 'CR-RG-01']
files_hint:
  - 'apps/server/src/access/usecases/queries/'
  - 'apps/server/src/access/domain/predicates/workspace-authority.predicates.ts'
  - 'apps/server/src/access/domain/services/workspace-role-deletion.service.ts'
  - 'apps/server/src/access/domain/errors/workspace-access.errors.ts'
  - 'apps/server/src/workspaces/usecases/queries/'
  - 'apps/server/src/workspaces/domain/'
source_refs: ['CH-S2']
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T10 — Move the four workspace list queries, the authority predicates and the role-deletion service into `access`

## Why

The read side and the domain rules of workspace-scoped Access belong with the write side T9 moves.
`workspaces` carries its own protected-role and reserved-permission predicates and its own role-deletion
service beside the access module's own ([CH-S2](../change.md#3-override-map)) — the duplication
[spec §7](../spec.md#7-metrics--kpis) counts as two implementations of one capability.

## What

Move into `apps/server/src/access/`, with their specs:

- `usecases/queries/list-workspace-roles.query.ts`, `list-workspace-permissions.query.ts`,
  `list-workspace-members.query.ts`, `list-workspace-users.query.ts` (+ four integration specs).
- `domain/predicates/workspace-authority.predicates.ts` (+ spec) — **content unchanged**; it enforces
  invariants that do not move.
- `domain/services/workspace-role-deletion.service.ts` (+ spec).

Rewrite their error imports to `workspace-access.errors.ts` and `shared/errors/`, and export every
provider `AccessUsecaseModule` must offer the controller T11 adds.

## Definition of Done

- [ ] The four queries, the predicates and the deletion service run from `access` with their specs
      passing, changed only in file location and import specifiers.
- [ ] `AccessUsecaseModule` exports every provider `WorkspaceAccessController` will inject in T11 — a
      missing export surfaces there as a resolution failure, so verify it here.
- [ ] `workspaces/domain/` no longer holds a predicate or service that enforces an Access rule; what
      remains is on [CR-AC-07](../spec.md#cr-ac-07-cr-us-01-ch-s3-ch-s4-ch-s6--structure)'s list.
- [ ] `workspaces/domain/module-boundaries.spec.ts` passes with its **rule intact** — no NestJS, HTTP or
      TypeORM import in `domain/`; only its scanned-directory glob shrinks with the module.
- [ ] `pnpm --filter @warehouser/server lint && test && build` green, plus the integration tier serially.

## Notes

**Compile-coupled lane with T8 and T9** through `workspace-access.errors.ts`. Runs in parallel with T9 in
the DAG but is serialized by the shared file — that is deliberate, not a modelling artifact. All 13
TypeORM entities and all 17 repositories stay in `shared/domain/`; these queries read through the same
repositories they read through today ([CR-RG-03](../spec.md#cr-rg-03--persistence-and-published-contracts-are-untouched)).
