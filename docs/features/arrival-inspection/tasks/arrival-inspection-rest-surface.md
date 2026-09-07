---
id: T13
title: 'Serve the REST surface: the two extended ending routes, the amendment route, the Rejection Reasons controller and the regenerated route-table baseline'
layer: 'ports'
deps: [T10, T11, T12]
acs: ['AC-01a', 'AC-06', 'AC-20', 'AC-21', 'AC-22', 'AC-26']
files_hint:
  - 'apps/server/src/purchase-drafts/rest/controllers/'
  - 'apps/server/src/purchase-drafts/rest/dtos/'
  - 'apps/server/src/purchase-drafts/rest/purchase-draft-response.ts'
  - 'apps/server/src/purchase-drafts/rest/rest.module.ts'
  - 'tests/refactor/route-table.baseline.json'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T13 — Serve the REST surface

## Why

Every rule the domain and the queries enforce reaches a member only through these four handlers, and
the observed-Permission declarations are what make the redaction and the capability refusal reachable
at all. Derives from [sad.md §7](../sad.md) § "HTTP and shared contracts",
[sad.md §5](../sad.md) § `purchase-drafts/rest` and
[contracts/openapi.yaml](../contracts/openapi.yaml).

## What

- Extend `POST .../lines/{purchaseDraftLineId}/arrival` and
  `POST .../lines/{purchaseDraftLineId}/direct-delivery` to accept the condition payload, declaring
  `@ObservedPermission(REJECTIONS:CREATE, CUSTOMERS:WATCH)` beside their unchanged
  `@RequiredPermission(PURCHASE_DRAFTS:RECEIVE)`. Both stay `@WriteRateLimited()`.
- Add `REJECTIONS:WATCH` to the observed list of `GET .../purchase-drafts/{purchaseDraftId}` and
  `GET .../purchase-draft-lines`.
- Add `PATCH .../purchase-drafts/{purchaseDraftId}/lines/{purchaseDraftLineId}/rejections/{rejectionId}`
  under `@RequiredPermission(REJECTIONS:UPDATE)`, rate-limited.
- Add `RejectionReasonsController` at `GET /api/v1/warehouses/{warehouseId}/rejection-reasons` — its
  own top-level segment, not nested under `/purchase-drafts`, read-only, `@ArchivedTolerantRead()`,
  under `PURCHASE_DRAFTS:WATCH`, mirroring `PackagingTypesController`. **No mutation handler
  anywhere.**

DTOs stay `createZodDto` adapters that redefine nothing.

## Definition of Done

- [ ] Every endpoint validates its shared schema and rejects an unknown property (`z.strictObject`).
- [ ] Every endpoint is denied without its Permission and permitted with it, and **no denial discloses
      existence** — a request aimed at another Warehouse's draft, line or Rejection fails identically
      to one aimed at nothing (AC-26).
- [ ] Every mutating endpoint is denied on an archived Warehouse and every read succeeds on one; no
      mutating handler declares `@ArchivedTolerantRead()`.
- [ ] A contract test proves an ending carrying a Rejection is refused for a member holding
      `PURCHASE_DRAFTS:RECEIVE` without `REJECTIONS:CREATE`, and that the same member's refusal-free
      ending records (AC-01a, AC-01b).
- [ ] A contract test proves the closed-draft read returns the cause-withheld shape for a member
      without `REJECTIONS:WATCH` and the full shape with it (AC-21, AC-22).
- [ ] The amendment endpoint reaches only a Rejection of the acting Warehouse (AC-20, AC-26).
- [ ] `rejection-reasons` is served whole, archived-tolerant, and has **no** POST, PATCH, PUT or DELETE
      handler on any controller (AC-06).
- [ ] `tests/refactor/route-table.baseline.json` is regenerated deliberately; the diff **gains exactly
      two rows and loses none**, and the regeneration is reviewed rather than silenced.
- [ ] `pnpm --filter @warehouser/server test`, `test:integration`, `lint` and `build` are green, and
      the root `tests/refactor` suite passes.

## Notes

**Hard rule** ([sad.md §10](../sad.md), gate 1): `route-table.spec.mjs` compares the resolved route
table against its baseline. Two added routes and no withdrawn one require a **deliberate, reviewed**
regeneration; it may never be silenced or skipped.

The catalogue gets its own top-level segment so no literal segment competes with a `{purchaseDraftId}`
parameter — which is why `PackagingTypesController` is its own controller too.

Handler metadata is asserted in each controller's own spec, not by a repository-wide check. T14 adds
the one repository-wide check this feature's goals depend on; metadata coverage alone is **not**
sufficient evidence ([sad.md §8](../sad.md) § Authorization coverage), which is why the per-endpoint
denial tests above are required here.
