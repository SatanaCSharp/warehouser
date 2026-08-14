---
id: T2
title: 'Commit the three identity baselines and the gates that diff them'
layer: 'tests'
deps: ['T1']
acs: ['CR-AC-11', 'CR-RG-01', 'CR-RG-04']
files_hint:
  - 'tests/refactor/route-table.mjs'
  - 'tests/refactor/route-table.baseline.json'
  - 'tests/refactor/route-table.spec.mjs'
  - 'tests/refactor/split-cases.mjs'
  - 'tests/refactor/split-cases.baseline.json'
  - 'tests/refactor/split-cases.spec.mjs'
  - 'apps/web/src/test/locale-baseline.json'
  - 'apps/web/src/i18n.spec.ts'
source_refs: []
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T2 — Commit the three identity baselines and the gates that diff them

## Why

"Nothing changed" is the claim under test across ~150 moved files, and
[sad §5.5](../sad.md#55-route-table-identity-gate-closes-changemd-96) settles that it is proved by
comparison against committed captures rather than asserted at review. The three baselines
[test-plan.md § Test data](../test-plan.md#test-data) names must exist before the first move, or there
is nothing to compare the after-tree to.

## What

Follow the extractor + baseline + spec pattern `tests/access/authorization-coverage-classifier.mjs`
already establishes — static source parsing with `globSync` + regex, never loading Nest.

- **Route table** — `tests/refactor/route-table.mjs` emits, sorted: `METHOD`, full path
  (`@Controller` prefix + handler path), guard classes, permission decorator + argument, DTO class.
  `route-table.baseline.json` is the capture at `baseline_revision`. `route-table.spec.mjs` asserts
  current == baseline **and** that no method+path pair appears twice.
- **Split-case inventory** — `tests/refactor/split-cases.mjs` collects the case names of the four
  specs whose subject splits (`name-validation.spec.ts`, `warehouse.controller.spec.ts`,
  `workspace.controller.spec.ts`, `workspace-http-contract.integration.spec.ts`);
  `split-cases.spec.mjs` asserts the union after equals `split-cases.baseline.json`.
- **Locale snapshot** — `apps/web/src/test/locale-baseline.json` captures every key and value in both
  languages. Extend the existing `apps/web/src/i18n.spec.ts` to assert value-for-value equality,
  `en`/`uk` key symmetry, and that key **paths** move only for `access.json`'s three scope-named
  parents. The snapshot lives under `apps/web/src/test/` rather than `tests/refactor/` because a web
  spec reads it and [frontend-architecture.md](../../../system/frontend-architecture.md) §"Testing"
  reserves that directory for cross-cutting test support.

## Definition of Done

- [ ] `node --test 'tests/**/*.spec.mjs'` passes, running both new gates through the existing root
      `test` script with no new script added.
- [ ] The route-table baseline contains all 21 handlers across the two current controllers.
- [ ] `pnpm --filter @warehouser/web test` passes with the locale assertions active.
- [ ] Each gate **fails** when fed a deliberately altered baseline — a gate that cannot fail is not a
      gate.
- [ ] lint clean.

## Notes

The `.spec.mjs` suffix is load-bearing: the root script is
`node --test tests/**/*.spec.mjs && turbo run test`, so these run with the existing release gates.
The route-table gate is **kept permanently after ship** ([sad §5.5](../sad.md#55-route-table-identity-gate-closes-changemd-96)) —
regenerating its baseline becomes a deliberate, reviewable act. The split-case inventory is retired
once the four splits land. Response **schemas** are erased at runtime and are deliberately out of this
extractor's reach; the existing `*-http-contract.integration.spec.ts` suites cover them. Per
[test-plan.md](../test-plan.md#new--no-baseline-therefore-unclassified) these gates add structural
assertions only — no new behavioral assertion enters the suite.
