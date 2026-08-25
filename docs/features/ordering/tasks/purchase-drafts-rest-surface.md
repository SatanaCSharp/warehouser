---
id: T16
title: 'Expose the purchase-drafts REST surface: contracts subpath, transition sub-resources, controllers and module wiring'
layer: 'ports'
deps: ['T14', 'T15', 'T4']
acs: ['AC-10', 'AC-14', 'AC-15', 'AC-17', 'AC-21', 'AC-22', 'AC-23', 'AC-24']
files_hint:
  [
    'packages/contracts/purchase-drafts/',
    'apps/server/src/purchase-drafts/rest/',
    'apps/server/src/purchase-drafts/purchase-drafts.module.ts',
    'tests/refactor/route-table.baseline.json',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T16 — Expose the purchase-drafts REST surface: contracts subpath, transition sub-resources, controllers and module wiring

> **Blocked by:** [T14](./purchase-draft-drift-read.md), [T15](./arrival-confirmation.md), [T4](./write-rate-limit-guard.md) · **Layer:** `ports` · **Owner:** Backend Lead · **Estimate:** L
> **Acceptance criteria:** [AC-10](../spec.md), [AC-14](../spec.md), [AC-15](../spec.md), [AC-17](../spec.md), [AC-21](../spec.md), [AC-22](../spec.md), [AC-23](../spec.md), [AC-24](../spec.md)

## Why

The Purchase drafts destination needs the HTTP surface, and each transition must declare its own Permission. Derives from [contracts/openapi.yaml](../contracts/openapi.yaml) `/purchase-drafts*` and `/packaging-types`, [sad §7](../sad.md) and [spec §5 AC-22](../spec.md).

## What

- Add the `packages/contracts/purchase-drafts` subpath, including the draft list with per-draft drift presence and the single draft with per-link drift detail. No endpoint accepts a Drift Signal as input.
- Add `purchase-drafts/rest/`: the draft and line and link routes, plus `readiness`, `arrival` and `closure` as **transition sub-resources** and `DELETE` for discard — never a `state` field on a general `PATCH`.
- Serve the Packaging Type catalogue at `/packaging-types` so no literal segment competes with a `{purchaseDraftId}` parameter.
- Wire `PurchaseDraftsModule` into `app.module.ts` and regenerate `tests/refactor/route-table.baseline.json`.

## Definition of Done

- [ ] Every endpoint validates its shared schema and maps its stable `purchase_drafts.*` error codes
- [ ] A contract test proves a Role carrying `PURCHASE_DRAFTS:WATCH` but none of `:CREATE`, `:READY` or `:RECEIVE` is denied each of those three, changes nothing, and continues to read the drafts it may (AC-22)
- [ ] A test proves no frozen field is reachable through the arrival or closure payload
- [ ] A test proves every read succeeds on an archived Warehouse and every mutation is denied on one (AC-23)
- [ ] `tests/refactor/route-table.spec.mjs` passes against a deliberately regenerated baseline, and no method-and-path pair is served twice
- [ ] lint + vet clean

## Notes

- A general `state` field would put the frozen-record rule behind a payload value; a distinct route per transition is what lets each declare its own Permission.
- Completes the ~26 new routes. Shares `route-table.baseline.json` with T7 and T11 — one serialized `ports` lane.
