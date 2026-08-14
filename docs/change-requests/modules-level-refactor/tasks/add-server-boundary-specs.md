---
id: T13
title: 'Add the warehouses and access boundary specs and tighten the users boundary'
layer: 'tests'
deps: ['T12']
acs: ['CR-AC-05', 'CR-AC-06', 'CR-AC-07', 'CR-AC-08', 'CR-AC-12', 'CR-RG-02']
files_hint:
  - 'apps/server/src/warehouses/module-boundaries.spec.ts'
  - 'apps/server/src/access/module-boundaries.spec.ts'
  - 'apps/server/src/users/module-boundaries.spec.ts'
  - 'apps/server/src/workspaces/domain/module-boundaries.spec.ts'
  - 'apps/server/src/shared/domain/repositories/repository-boundaries.spec.ts'
  - 'tests/access/authorization-coverage.spec.mjs'
source_refs: ['CH-S6']
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T13 — Add the `warehouses` and `access` boundary specs and tighten the `users` boundary

## Why

The ownership rule has to outlive this change: written into documentation it regresses at the first
feature with nowhere obvious to go, so [CR-AC-12](../spec.md#cr-ac-12-cr-us-03-ch-w5-ch-s6--boundary)
requires a spec that fails and **names the file and the rule it violates**. This is the tail of
[CH-S6](../change.md#3-override-map) — the rest was distributed across T7, T10, T11 and T12, because a
boundary spec updated in a later commit than the move it governs leaves a commit that does not pass.

## What

- Add `warehouses/module-boundaries.spec.ts` and `access/module-boundaries.spec.ts`, following the
  static-source-scan pattern `users/module-boundaries.spec.ts` established (`readdirSync`/`readFileSync`
  - regex). Each asserts the module contains only its own entity's concerns and imports siblings **only**
    through exported use-case modules — extended per
    [CR-AC-08](../spec.md#cr-ac-08-cr-us-01-ch-s1-ch-s2-ch-s5-ch-s6--boundary) to cover error factories,
    domain predicates and DTOs, which the existing `server-architecture.md` wording does not reach.
- Extend `users/module-boundaries.spec.ts`'s forbidden-import list from `access/`, `auth/` to also include
  `warehouses/` and `workspaces/` — a genuinely **new** constraint, a tightening, never a relaxation.
- Confirm the re-pathed `workspaces/domain/module-boundaries.spec.ts`,
  `shared/domain/repositories/repository-boundaries.spec.ts` and
  `tests/access/authorization-coverage.spec.mjs` all hold their rules, and that
  `tests/{auth,users,workspaces}/release-gates.spec.mjs` pass with path-valued literals only.

## Definition of Done

- [ ] Given a fixture importing a foreign error factory, predicate or DTO, each new spec **fails** and its
      message names the offending file and the rule — a spec that cannot fail is not a boundary.
- [ ] `users/module-boundaries.spec.ts` forbids all four feature modules.
- [ ] No shared repository imports a feature module.
- [ ] Every re-pathed spec keeps its rule: **no rule weakened or deleted to accommodate the move**. A spec
      whose rule had to weaken is a refactor failure ([change.md §6](../change.md#6-rollout) abort
      threshold), not a spec to update.
- [ ] `pnpm --filter @warehouser/server lint && test && build` green and
      `node --test 'tests/**/*.spec.mjs'` green.

## Notes

Shares the `authorization-coverage.spec.mjs` lane with T7 and T11. Negative fixtures live **outside** the
scanned production trees, following the existing `tests/access/fixtures/authorization-coverage/`
precedent, so a deliberate violation never becomes a real one. These specs add **structural** assertions
only — no new behavioral assertion enters the suite, which is what keeps CR-AC-09's "no test surface
beyond the moved code" intact. What they check is the import graph and the file manifest, never the
owning-module judgement: _whose invariants does this file enforce?_ stays a human review test
([sad §4.7](../sad.md#47-flatness-is-a-property-of-module-identity-not-of-directory-depth)).
