---
id: T6
title: 'Reorganize `shared/api` into four domain directories and rewrite its 68 importers'
layer: 'infra'
deps: ['T1', 'T3', 'T4', 'T5']
acs: ['CR-AC-05', 'CR-RG-07']
files_hint: ['apps/web/src/shared/api']
source_refs:
  [
    'apps/web/src/shared/api/api-client.ts',
    'apps/web/src/shared/api/mutation-outcome.ts',
    'apps/web/src/shared/api/workspace-context-api.ts',
    'apps/web/src/shared/api/workspace-context-api.spec.ts',
    'apps/web/src/shared/api/workspace-users-api.ts',
    'apps/web/src/shared/api/workspace-mutation.ts',
    'apps/web/src/shared/api/access-permissions-api.ts',
    'apps/web/src/shared/api/access-permissions-api.spec.ts',
    'apps/web/src/shared/api/warehouse-path.ts',
  ]
owner: 'YuriiH'
estimate: 'L'
status: 'done'
---

# T6 — Reorganize `shared/api` into four domain directories and rewrite its 68 importers

## Why

CH-W6, step 1 of [`sad.md` §4.7](../sad.md#47-documentation-lands-before-the-code-it-governs)'s order. It runs **before** the move deliberately (`change.md` §6, `sad.md` R3): it proves the unassisted 68-file import rewrite on independent path churn before T7 depends on the same technique.

## What

Move the nine files into the tree [`sad.md` §5.5](../sad.md#55-sharedapi-after-ch-w6--closes-specmd-8) fixes:

```text
shared/api/client/{api-client.ts, mutation-outcome.ts}
shared/api/workspace/{workspace-context-api.ts, workspace-context-api.spec.ts,
                     workspace-users-api.ts, workspace-mutation.ts}
shared/api/access/{access-permissions-api.ts, access-permissions-api.spec.ts}
shared/api/warehouse/warehouse-path.ts
```

Then rewrite the specifier in all 68 referencing files — distributed `modules/access` 33, `modules/warehouse` 12, `shared/hooks` 3, `modules/auth` 2, `modules/workspace` 1, `guards/` 3, `store/` 2, `shared/` 3, `routes/` 1, `router.spec.tsx` 1, `test/workspace-fixtures.ts` 1, and 6 inside `shared/api` itself.

Add the static guard the criterion needs: a test that enumerates `shared/api` and asserts the four directories, the nine files and an empty root.

## Definition of Done

- [ ] the static layout guard passes and fails when a file is added at the `shared/api` root
- [ ] `git diff -M --find-copies-harder 42f1205 -- <old> <new>` per moved module yields import-specifier hunks only — no exported symbol, endpoint, `providesTags` value or cache key differs
- [ ] `pnpm --filter @warehouser/web lint && test && build` all clean
- [ ] `modules/home` is byte-identical to `42f1205` (it imports no `shared/api` module)
- [ ] the review record names every moved module and states that each was diff-checked

## Notes

**`warehouse-path.ts` keeps a one-file directory on purpose** (`sad.md` §5.5): four consumers in three trees, so CH-D2's sole-consumer tiebreak never reaches it, and `warehouse/` names the domain its paths address. Filing it under `client/` is a **rejected** alternative — it would leave `warehouse/` empty and contradict CR-AC-05's four named destinations.

**A green build does not discharge CR-AC-05.** The criterion says so outright, and `test-plan.md` §Review gates makes the per-module diff record _the_ evidence. Do not close this task on `build` alone.

No tsconfig path alias, barrel or `index.ts` may be introduced to make the rewrite easier (`spec.md` §3, CR-RG-05).
