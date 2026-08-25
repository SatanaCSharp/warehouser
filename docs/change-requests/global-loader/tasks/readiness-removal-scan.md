---
id: T18
title: 'Add the readiness-removal repository scan'
layer: 'tests'
deps: ['T16', 'T17']
acs:
  [
    'CR-AC-05',
    'CR-AC-06',
    'CR-AC-07',
    'CR-AC-08',
    'CR-AC-09',
    'CR-AC-11',
    'CR-AC-13',
    'CR-AC-15',
    'CR-RG-07',
  ]
source_refs:
  - 'sad.md#structural-by-test'
  - 'test-plan.md#where-the-rows-land'
files_hint:
  - 'apps/web/src/test/readiness-removal/readiness-removal.spec.ts'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T18 — Add the readiness-removal repository scan

## Why

The structural criteria are statements about **absence** across many files, and no single file owns
them — which is exactly the case `placing-web-tests.md` §3 files in its own `src/test/` directory.
[`sad.md` §10](../sad.md#structural-by-test) calls for it; without it, nothing stops an eighth
affordance being reintroduced later.

It lands after T16 and T17 because it asserts the finished state.

## What

Add `src/test/readiness-removal/readiness-removal.spec.ts` with a header comment saying why no single
file owns it. Assertions:

- Each file CR-AC-05–CR-AC-09 and CR-AC-11 name contains **no** readiness branch, **no** `Spinner`
  import and **no** removed prop.
- `WorkspaceListSkeleton.tsx` and `WarehouseListSkeleton.tsx` do not exist.
- The four routes carry the declarations in
  [`sad.md` §5.1](../sad.md#51-route-declarations-after-the-change) — including `accessRoute`'s
  `wrapInSuspense: false` beside its `pendingComponent`, so deleting either line fails here as well
  as in T7 (CR-AC-13's declaration check).
- `warehouseDashboardRoute` gained **no** loader — its destination reads no dataset, so the parent's
  `pendingComponent` is the whole of its readiness (CR-AC-15's dashboard row).
- `AccessDataset.isError` is still present, and `isLoading` / `isFetching` / `isReady` are still legal
  at exactly their four allowed sites: RTK Query's own query results,
  `router.state.isLoading` (`modules/home/route.spec.tsx:228`), `mutation-feedback.middleware.ts`,
  and the CR-RG-06 components (CR-AC-09's scope bound).
- **No capability boolean was introduced** and every `WarehousePermissionGate` /
  `WorkspacePermissionGate` / `usePermittedItems` / `useWorkspacePermittedItems` call site is
  unchanged; the tab sets on `/workspace` and the access surface keep their order, count and
  admission rules (CR-RG-07's structural row).

## Definition of Done

- [ ] Every bullet above has an assertion that fails when its condition is broken.
- [ ] The scope bound is enforced **as a bound**: the spec fails both if a forbidden identifier
      returns and if one of the four allowed sites is stripped.
- [ ] The spec's header comment states why no single file owns it.
- [ ] `pnpm --filter @warehouser/web lint`, `test` and `build` clean.

## Notes

- CR-AC-12's key-set assertion belongs to T17's locale baseline, not here.
- This is a structural gate, not a substitute for T7's behavioral rows — both are required.
