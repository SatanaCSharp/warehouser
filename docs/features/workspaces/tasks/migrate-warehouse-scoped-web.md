---
id: T40
title: 'Migrate the Warehouse-scoped web surface to per-Warehouse keying'
layer: 'ui'
deps: ['T26', 'T27', 'T33']
acs: ['AC-05', 'AC-12', 'AC-12a', 'AC-36']
files_hint:
  [
    'apps/web/src/modules/access/api/',
    'apps/web/src/modules/access/hooks/',
    'apps/web/src/modules/access/components/',
    'apps/web/src/shared/api/access-permissions-api.ts',
    'apps/web/public/locales/en/access.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T40 — Migrate the Warehouse-scoped web surface to per-Warehouse keying

## Why

[T26](./reshape-access-rest.md) and [T27](./reshape-users-rest.md) break every current web call at
once — the §11 risk row that says contract and web ship in the same release. Beyond re-pathing,
[sad §5 Web](../sad.md#web) requires cache entries to be **keyed by Warehouse**, so switching never
shows another Warehouse's data and a member's authority is always that of the Warehouse being acted
on (AC-05).

## What

- Re-point every `modules/access` and users-related query and mutation at
  `/api/v1/warehouses/{warehouseId}/...`, taking the Warehouse from the effective selection in
  `shared/api/workspace-context-api.ts` ([T33](./workspace-context-api-and-gate.md)).
- Key every Warehouse-scoped cache entry and tag by `warehouseId`, so a switch refetches rather than
  reusing another Warehouse's data.
- Derive Warehouse capabilities from that Warehouse's projection
  (`GET .../access/current`), never from the Workspace projection.
- Render an archived Warehouse's Access page read-only: mutating controls disabled with their reason
  exposed, reads still working and marked archived, `Restore` absent here because its subject is the
  Warehouse record and it lives on the Workspace surface
  ([T36](./warehouses-tab.md)).
- Keep the Manager transfer control working on an archived Warehouse, per
  [ADR 0003](../adr/0003-archived-tolerant-membership-edge-mutations.md) and AC-36.
- Update `access.json` copy for the archived and authority-lost states in `en` and `uk`.

## Definition of Done

- [ ] Tests prove every Warehouse-scoped request carries its `warehouseId` and that no request is
      issued when no Warehouse is selected.
- [ ] Tests prove switching Warehouses refetches rather than serving another Warehouse's cached data,
      and that capabilities come from the newly selected Warehouse's projection (AC-05).
- [ ] Tests prove an archived Warehouse renders its Access page read-only with each disabled control
      exposing its reason, while its reads still work and are marked archived (AC-12, AC-12a).
- [ ] Test proves the Manager transfer remains available on an archived Warehouse and reports its
      outcome (AC-36).
- [ ] Test covers the authority-lost state (`OD62T`): safe explanation, capability state refreshed,
      the target's existence never disclosed.
- [ ] The existing `modules/access` suite is migrated and green.
- [ ] lint + build + web suite green.

## Notes

This is the largest breaking-change surface in the epic and the one most likely to be under-scoped —
`api-sync-report.md` **F-2** records that the `users` handlers were missing from the design's own
blast-radius statement. Sweep for every call site rather than the ones the compiler flags: a hook
that builds a URL from a string will type-check and fail at runtime.
