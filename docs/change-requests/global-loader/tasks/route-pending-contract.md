---
id: T1
title: 'Declare the pending and error contract on the three unpainted authenticated routes'
layer: 'wiring'
deps: []
acs: ['CR-AC-02', 'CR-AC-16', 'CR-RG-04', 'CR-RG-08']
source_refs:
  - 'change.md#3-override-map CH-02'
  - 'change.md#3-override-map CH-02a'
  - 'sad.md#51-route-declarations-after-the-change'
  - 'adr/0002-one-pending-boundary-per-route-branch.md'
files_hint:
  - 'apps/web/src/modules/workspace/route.tsx'
  - 'apps/web/src/modules/access/route.tsx'
  - 'apps/web/src/modules/access/route.spec.tsx'
  - 'apps/web/src/routes/warehouse.route.tsx'
  - 'apps/web/src/routes/warehouse.route.spec.tsx'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T1 — Declare the pending and error contract on the three unpainted authenticated routes

## Why

Rollout step 1 of [`change.md` §6](../change.md#6-rollout). Three of four authenticated routes paint
nothing while their guard awaits the network, and the actor sits on the page they came from. This
task makes both models cover the window before anything is removed, so it is purely additive.

Derives from [CH-02 / CH-02a](../change.md#3-override-map),
[`sad.md` §5.1](../sad.md#51-route-declarations-after-the-change) and
[ADR 0002](../adr/0002-one-pending-boundary-per-route-branch.md).

## What

Add the route options in [`sad.md` §5.1](../sad.md#51-route-declarations-after-the-change)'s table —
its `+` cells only; `homeRoute` and `warehouseDashboardRoute` are untouched.

- `workspaceRoute` — `pendingComponent: RoutePendingState`, `errorComponent: RouteErrorState`,
  `pendingMs: 0`, `pendingMinMs: 0`.
- `warehouseRoute` — `pendingComponent: RoutePendingState`, `pendingMs: 150`, `pendingMinMs: 0`
  (`errorComponent` already declared at `warehouse.route.tsx:43`).
- `accessRoute` — `pendingComponent: RoutePendingState`, `errorComponent: RouteErrorState`,
  `pendingMs: 150`, `pendingMinMs: 0`, **`wrapInSuspense: false`**.

No `loader` here — T4 and T5 add those.

Three of those values are not inferable from the option name and each carries a comment naming the
criterion it serves, per `sad.md` §5.1: `warehouseRoute`'s `150` (the unconditional `async`
`beforeLoad` resolves through a microtask on every in-Warehouse navigation), `accessRoute`'s `150`
(the router clears a parent's pending timer once the parent settles), and `wrapInSuspense: false`
(the route registers the commit timer but suspends into the parent's boundary so one
`RoutePendingState` spans both).

`pendingMinMs: 0` is written explicitly on all four routes — TanStack's default is `500`, which would
hold the fallback on screen after its data arrived.

## Definition of Done

- [ ] The three routes declare exactly the `sad.md` §5.1 values, and each of the three non-obvious
      lines carries a comment naming its criterion.
- [ ] `RoutePendingState` is on screen before `workspaceRoute` settles and is replaced by the
      destination afterwards (CR-AC-02, the part reachable without a loader).
- [ ] A `cause === 'stay'` navigation between a Warehouse's surfaces paints no pending state for a
      wait shorter than 150 ms (CR-AC-16, in `sad.md` §11's amended form).
- [ ] A refused Warehouse still renders `WarehouseEntryRefusal` at the requested address with the
      same non-disclosing reason — never pending, never a redirect (CR-RG-04). **Merge blocker.**
- [ ] `Sidebar.spec.tsx:227,404` still pass: the shell renders no skeleton or spinner of its own
      (CR-RG-08).
- [ ] `pnpm --filter @warehouser/web lint` and `test` clean.

## Notes

- Shares a lane with T4 (`modules/workspace/route.tsx`) and T5 (`modules/access/route.tsx`); both
  depend on this task, so the ordering is already forced.
- **CR-AC-16 is implemented in its amended form** — "does not paint for a wait shorter than 150 ms",
  not `spec.md`'s literal "does not replace the live destination". Holding the literal form would
  also suppress the paint on `/workspace` → `/access` with a warm context, leaving CR-AC-02 unmet on
  the common path ([`sad.md` §11](../sad.md#amendments-this-sad-proposes-to-specmd)).
- Do not delete `wrapInSuspense: false` or the `pendingComponent` beside it as "dead" — the pairing
  is deliberate and each deletion breaks a different criterion (`sad.md` §11 risk row 2).
- 150 ms is one constant on two routes and stays open until `/run` on _Fast 3G_ settles it
  (`sad.md` §11). The structure does not depend on the value.
