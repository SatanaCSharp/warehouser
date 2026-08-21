---
id: T7
title: 'Pin route readiness across the four routes before any component readiness is removed'
layer: 'tests'
deps: ['T4', 'T5', 'T6']
acs:
  [
    'CR-AC-02',
    'CR-AC-03',
    'CR-AC-10',
    'CR-AC-13',
    'CR-AC-16',
    'CR-RG-04',
    'CR-RG-06',
    'CR-RG-08',
  ]
source_refs:
  - 'test-plan.md#where-the-rows-land'
  - 'sad.md#10-verification-strategy'
  - 'change.md#6-rollout'
files_hint:
  - 'apps/web/src/test/route-readiness/route-readiness.spec.tsx'
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T7 — Pin route readiness across the four routes

## Why

**This is the phase gate.** [`change.md` §6](../change.md#6-rollout) permits step 3 — removing
component readiness — only once the routes _demonstrably_ cover the window. Rollout steps 1 and 2
(T1–T6) are additive and leave both models in place; this task is the proof that lets the second one
go. Every removal task depends on it.

It spans four routes and no single file owns it, so it gets its own directory under `src/test/` per
[`placing-web-tests.md`](../../../system/guides/placing-web-tests.md) §3 and
[`test-plan.md` § Where the rows land](../test-plan.md#where-the-rows-land).

## What

Add `src/test/route-readiness/route-readiness.spec.tsx` with a header comment saying why no single
file owns it. It carries the behavioral rows from
[`sad.md` §10](../sad.md#behavioral-by-test) that need the whole route stack assembled:

| Criterion | Case                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CR-AC-02  | Each of the three routes: `RoutePendingState` on screen before the route settles; the destination after — or `RouteErrorState` on a primary failure                 |
| CR-AC-03  | Every admitted tab renders content on first paint; switching between admitted tabs issues no request and shows no waiting affordance; the dwell-past-retention case |
| CR-AC-13  | Cold navigation to `/warehouses/$id/access`: count `RoutePendingState` mounts — **exactly one** — and assert `WarehouseLayout` never commits beside a pending state |
| CR-AC-16  | `cause === 'stay'` with a warm access cache: `RoutePendingState` never mounts                                                                                       |
| CR-AC-10  | Invalidate the members tag on a painted access destination: rows persist **and** the loader does not re-run, so `RoutePendingState` never mounts                    |
| CR-RG-04  | `WarehouseEntryRefusal` at the requested address, same non-disclosing reason, never pending and never a redirect                                                    |
| CR-RG-06  | No route pending state appears for a mutation; `mutationFeedbackMiddleware` is not involved                                                                         |
| CR-RG-08  | `Sidebar.spec.tsx:227,404` continue to pass unchanged — the shell renders no skeleton of its own while the outlet is pending                                        |

## Definition of Done

- [ ] Every row above has a case and fails when its behavior is broken.
- [ ] CR-AC-13's mount-count assertion runs against the **installed** React and router versions
      rather than being reasoned about — it rests on React keeping a Suspense fallback mounted when
      the same boundary re-suspends, which is framework behavior this repo does not own
      (`sad.md` §11 risk row 1).
- [ ] CR-AC-10's case asserts **both** clauses: rows persist _and_ `RoutePendingState` never mounts.
- [ ] CR-RG-04's row passes. **Merge blocker.**
- [ ] The spec's header comment states why no single file owns it.
- [ ] `pnpm --filter @warehouser/web lint` and `test` clean.

## Notes

- **Do not start T9–T15 until this is green.** Removing component readiness before the routes are
  proven to cover the window is the single thing `change.md` §6's ordering exists to prevent.
- CR-AC-16 is pinned in `sad.md` §11's amended form: "does not paint for a wait shorter than
  150 ms", not the literal "does not replace the live destination".
- CR-AC-03's colocated force-mount case lives in T6; this file carries the paint, tab-switch and
  retention rows. Both are needed.
- The only `router.invalidate()` in the app is `RouteErrorState.tsx:32`'s retry, which is deliberate
  and unrelated; CR-AC-10's case pins the absence of any _other_ coupling
  ([`sad.md` §4.7](../sad.md#47-a-mutation-cannot-reach-a-route-loader)).
