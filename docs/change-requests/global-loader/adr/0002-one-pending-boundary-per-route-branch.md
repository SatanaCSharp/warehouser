---
status: Accepted
owner: 'YuriiH'
reviewers: ['Tech Lead']
updated_at: '2026-08-21'
feature_size: 'L'
ticket: 'change-request:global-loader'
---

# 0002 — A route branch owns one pending boundary

## Context

CH-02 gives `workspaceRoute`, `warehouseRoute` and `accessRoute` a `pendingComponent`.
`accessRoute` is a child of `warehouseRoute`, and both now have their own await window: the parent's
`beforeLoad` resolves the entry verdict, and the child's loader awaits `getCurrentAccess` plus the
admitted tab datasets.

Two acceptance criteria constrain what the actor may see across those two windows, and as written
they cannot both hold.

- **CR-AC-13** — on a cold navigation to `/warehouses/$id/access`, `RoutePendingState` mounts
  **exactly once** and is replaced directly by the finished destination. "The actor never sees a
  pending state, then partial chrome, then a second pending state."
- **CR-AC-16** — on a navigation between that Warehouse's surfaces (`cause === 'stay'`),
  `RoutePendingState` does **not** replace the live destination. Its stated rationale is narrow:
  `warehouse.route.tsx:44-54` is `async` unconditionally and awaits `requireAuth` before its
  `lastVerdictByStore` lookup, so even a cached verdict resolves through a microtask, and a
  non-zero `pendingMs` "is what keeps that microtask from painting".

`spec.md` §8 left the CR-AC-13 mechanism to `design` and recorded `pendingMs: 0` on `accessRoute` as
the standing default.

Three facts about the installed router (`@tanstack/react-router@1.170.17`, `router-core@1.171.14`)
decide the options:

1. **A route gets its own Suspense boundary if and only if it resolves one.** `Match.js:79` wraps a
   match in `React.Suspense` when `wrapInSuspense ?? pendingComponent ?? errorComponent?.preload` is
   truthy. `MatchInner` throws the match's load promise while it is pending, so a route with a
   `pendingComponent` catches its own suspension; a route with neither `pendingComponent` nor
   `wrapInSuspense` lets it propagate to the nearest ancestor boundary.
2. **The commit is global; the fallback is per-boundary.** `triggerOnReady`
   (`load-matches.js:8-13`) fires once per navigation and commits _all_ pending matches together.
   Until it fires, the actor stays on the previous page. Any match's pending timer can fire it —
   and `setupPendingTimeout` (`load-matches.js:169-177`) only registers a timer for a route that has
   a `pendingComponent`.
3. **A pending timer is cleared when that match's own load completes**
   (`load-matches.js:492`), not when the subtree is ready. A parent that resolves quickly takes its
   timer with it, and a slow child left without one has nothing to trigger the commit.

Together: if `accessRoute` owns a boundary, a cold navigation paints the parent's fallback, then
commits `WarehouseLayout`, then paints the child's fallback — two mounts, CR-AC-13's falsifier
fails. If `accessRoute` declares nothing at all, it has no timer, and any navigation where
`warehouseRoute` resolves under its `pendingMs` goes entirely unpainted — including `/workspace` →
`/access`, where `getWorkspaceContext` is already warm and the parent resolves in a tick, which is
the common path.

## Decision drivers

- CR-AC-13's mount count is an observable with a test, not a stylistic preference.
- CR-AC-02 is the whole point of the request: no route's await window may go unpainted.
- CR-AC-16's real target is a microtask, not a network round trip.
- `WarehouseLayout` renders no chrome of its own — it is an `<Outlet>` plus the entry-record effect —
  so the harm in a second boundary is a remount and a re-run, not a visible flash. That makes this a
  correctness decision rather than a cosmetic one, and correctness decisions want a mechanism, not a
  timing coincidence.
- Every future child of `warehouseRoute` inherits whatever is decided here.

## Considered options

1. **Child owns its boundary, `pendingMs: 0`** — `spec.md`'s standing default. Always paints
   immediately. Mounts `RoutePendingState` twice on a cold navigation with `WarehouseLayout`
   committed between them; CR-AC-13 fails and its test cannot pass.
2. **Child declares nothing** — CR-AC-16 holds in full and CR-AC-13 holds. But the child registers
   no pending timer, so every navigation whose parent resolves under 150 ms paints nothing at all
   and the actor waits out two network rounds on the page they came from. CR-AC-02 unmet on the
   common path.
3. **Child suspends into the parent's boundary, and keeps a timer of its own** — declare
   `pendingComponent` (which registers the timer) together with `wrapInSuspense: false` (which
   suppresses the boundary). One fallback element spans both windows; the child can still trigger
   the commit.
4. **Hoist the access datasets into `warehouseRoute`'s loader** — one window, one boundary,
   trivially one mount. Rejected outright: it would fetch the access surface's datasets for the
   Warehouse dashboard, which no criterion asks for and CR-RG-02 forbids.

## Decision outcome

Chosen: **option 3 — a route branch owns one pending boundary, at its top.**

`accessRoute` declares `pendingComponent: RoutePendingState` and `wrapInSuspense: false`. The
`pendingComponent` is never rendered by that route; it is declared because
`setupPendingTimeout` gates on its presence, and the timer is what guarantees the router commits and
something paints. `wrapInSuspense: false` suppresses the route's own boundary, so its loader's
suspension propagates to `warehouseRoute`'s — the same boundary, the same fallback element, the same
position — and React keeps it mounted across the parent's resolution rather than remounting it.

`pendingMs` is set per route, not per depth:

| Route            | `pendingMs` | `pendingMinMs` | Why                                                                                                   |
| ---------------- | ----------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `homeRoute`      | `0`         | `0`            | unchanged; `/` resolves rather than renders, so there is nothing to keep on screen                    |
| `workspaceRoute` | `0`         | `0`            | a root child with no live parent destination behind it; the awaited window is a real round trip       |
| `warehouseRoute` | `150`       | `0`            | its `beforeLoad` resolves through a microtask on a cached verdict; 150 ms is what stops that painting |
| `accessRoute`    | `150`       | `0`            | the same guard one level down, and the timer that covers a fast-resolving parent                      |

`pendingMinMs: 0` is explicit everywhere: TanStack's default is `500`, which would hold a fallback on
screen after its data had arrived.

**CR-AC-16 narrows accordingly**, and the amendment is recorded in `sad.md` §11: on a
`cause === 'stay'` navigation, `RoutePendingState` does not paint for a wait shorter than 150 ms.
The microtask its rationale names is suppressed; a genuine two-round-trip wait is painted, because
leaving it unpainted is the disease this change request exists to cure.

## Consequences

### Positive

- CR-AC-13 holds by construction rather than by timing: there is one boundary in the branch, so
  there is one mount, on every path.
- CR-AC-02 holds on the fast-parent path, which option 2 loses silently.
- `WarehouseLayout` never commits beside a pending state, so no partial destination is observable
  and no chrome flashes.
- The rule generalizes: any future child of `warehouseRoute` that awaits data declares
  `wrapInSuspense: false` and inherits the branch's one boundary.

### Negative

- The pairing is non-obvious. A `pendingComponent` that never renders, beside a `wrapInSuspense`
  that is the reason it never renders, reads as a mistake to anyone who has not read this record.
  Both lines carry a comment naming the criterion they serve, and deleting either one fails a
  different test.
- CR-AC-16 is narrowed, which is a real reduction in what the specification promised.
- `useRecordWarehouseEntry` now fires when `WarehouseLayout` mounts _after_ the access loader
  settles, one round later than before on that route. The guarantee it carries — it runs only on an
  `entered` verdict — is unchanged.
- CR-AC-13 depends on React preserving a Suspense fallback when the same boundary re-suspends. That
  is true for the same element at the same position, but it is framework behavior this repository
  does not own, which is why the mount-count assertion is a test rather than an argument.

### Neutral

- `warehouseDashboardRoute` declares nothing and needs nothing: `WarehousePage` reads no dataset, so
  the parent's boundary is the whole of its readiness.
- 150 ms is one constant on two routes. `/run` on _Fast 3G_ may justify a shorter value; the
  structure does not depend on it.

## Links

- [`sad.md` §5.1, §6.1–§6.3, §11](../sad.md)
- [`spec.md` CR-AC-02, CR-AC-13, CR-AC-16, CR-RG-04](../spec.md)
- [`change.md` CH-02, CH-02a](../change.md#3-override-map)
- `modules/home/route.tsx:22-30` — the wiring this generalizes
- `@tanstack/react-router@1.170.17` `Match.js:79,205-222`; `@tanstack/router-core@1.171.14`
  `load-matches.js:8-13,169-177,492`; `router.js:806-807` (the `1000` / `500` defaults)
