---
id: T5
title: 'Add loadAccessSurface and give accessRoute its loader'
layer: 'ui'
deps: ['T1', 'T2']
acs: ['CR-AC-04', 'CR-AC-13', 'CR-AC-14', 'CR-AC-15', 'CR-RG-02']
source_refs:
  - 'change.md#3-override-map CH-04'
  - 'change.md#3-override-map CH-15'
  - 'change.md#3-override-map CH-16'
  - 'sad.md#43-the-access-loader-is-two-rounds-deliberately'
  - 'adr/0002-one-pending-boundary-per-route-branch.md'
files_hint:
  - 'apps/web/src/modules/access/loaders/access-surface.loader.ts'
  - 'apps/web/src/modules/access/loaders/access-surface.loader.spec.ts'
  - 'apps/web/src/modules/access/route.tsx'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T5 — Add `loadAccessSurface` and give `accessRoute` its loader

## Why

`accessRoute` has neither `beforeLoad` nor `loader` today, so `getCurrentAccess` and each tab's
dataset are fetched after `AccessPage` mounts. CH-04 moves them to the route; CH-16 fixes what the
loader must do around a refusal, which is nothing.

Derives from [`sad.md` §4.3](../sad.md#43-the-access-loader-is-two-rounds-deliberately) and
[§5.5](../sad.md#55-what-each-loader-awaits).

## What

Add `modules/access/loaders/access-surface.loader.ts` exporting `loadAccessSurface`, declared as
`accessRoute.loader`.

**Gate first (CH-16).** `warehouseRoute.beforeLoad:56-61` _returns_ a refusal verdict rather than
throwing, so this loader still runs on a refusal. Unless the parent verdict is `entered`, return
immediately having issued **nothing** — not `getCurrentAccess`, not any dataset. Request count around
a refusal equals `baseline_revision`, which is zero (CR-AC-14).

**Then two rounds, deliberately** — every access skip set is derived from `getCurrentAccess`'s
`permissionIds` (`useAccessRoles.ts:35` → `useHasPermission` → `usePermissions.ts:48-59`), so the
projection must resolve before the tab datasets can be selected. CR-RG-02 forbids flattening that by
fetching unconditionally.

1. **Primary** — `await` `getCurrentAccess`, unwrapped, with the **identical argument**
   `useEnteredWarehouse()` supplies to `useCurrentPermissions`, so `AccessPage` reads the entry the
   loader filled rather than opening a second one (CR-AC-04). A rejection propagates to
   `RouteErrorState`.
2. **Secondary** — one `Promise.allSettled` round over the three tab datasets, gated by T2's
   constants: `listAccessRoles` (`rolesReadPermissions`, 8), `listAccessMembers`
   (`membersReadPermissions`, 7), `listAccessPermissions` (`rolesTabPermissions`, 6 — the widened
   set).

All dispatches use `subscribe: false`.

## Definition of Done

- [ ] `accessRoute` declares `loadAccessSurface`; `route.tsx` contains no dispatch.
- [ ] The spec proves **zero** requests for a `refused` verdict, for **both** refusal reasons
      (CR-AC-14).
- [ ] The spec proves `getCurrentAccess` resolves before any tab dataset is dispatched, and that the
      argument matches the one `useEnteredWarehouse()` supplies so no second cache entry is opened
      (CR-AC-04).
- [ ] The spec proves exactly **two** rounds — a third fails `spec.md` §6 row 2.
- [ ] The spec proves a rejected primary propagates and a rejected secondary is absorbed (CR-AC-15).
- [ ] The spec covers each of CR-RG-02's four `accessRoute` rows under its stated gate kind, in both
      directions.
- [ ] With T1's `wrapInSuspense: false` in place, a cold navigation mounts `RoutePendingState` once
      and it is replaced directly by the finished destination (CR-AC-13 — fully pinned in T7).
- [ ] `pnpm --filter @warehouser/web lint` and `test` clean.

## Notes

- Reads T2's constants; must not restate a Permission literal, or CR-RG-02's drift risk returns.
- `useRecordWarehouseEntry` now fires one round later on this route
  ([`sad.md` §6.1](../sad.md#61-cold-navigation-to-warehousesidaccess-cr-ac-13-cr-ac-02)). The
  guarantee it carries — only on an `entered` verdict — is unchanged. Recorded, not mitigated.
- Shares a lane with T1 on `modules/access/route.tsx`.
- The loader must not import a page module (`sad.md` §8).
