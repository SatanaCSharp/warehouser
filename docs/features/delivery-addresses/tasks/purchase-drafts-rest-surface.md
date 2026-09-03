---
id: T19
title: 'Serve the purchase-drafts REST surface: line delivery, readiness, the by-line read and the redacted draft reads'
layer: 'ports'
deps: [T15, T16, T18]
acs:
  [
    'AC-09a',
    'AC-13',
    'AC-14',
    'AC-15',
    'AC-16',
    'AC-16a',
    'AC-17',
    'AC-18',
    'AC-22',
    'AC-23',
  ]
files_hint:
  - 'apps/server/src/purchase-drafts/rest/'
  - 'packages/contracts/src/purchase-drafts/'
  - 'tests/refactor/route-table.baseline.json'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T19 — Serve the purchase-drafts REST surface: line delivery, readiness, the by-line read and the redacted draft reads

## Why

Nine of the twenty endpoints in the contract are purchase-draft ones, and three of them can carry customer identity, so this is where the observed Permission meets the largest read surface. Derives from [openapi.yaml](../contracts/openapi.yaml) and [sad.md §7 HTTP](../sad.md).

## What

Serve the line-delivery `PATCH`, the readiness `POST`, `GET /purchase-draft-lines`, and the draft list and detail reads. Declare `@ObservedPermission(CUSTOMERS:WATCH)` on every read whose response schema can carry identity, and extend the `purchase-drafts` contracts subpath with both projection forms. Regenerate the route-table baseline.

## Definition of Done

- [ ] Every endpoint validates its shared schema and maps its stable refusal code.
- [ ] The draft list, one draft and the by-line read serve both the redacted and the unredacted shape.
- [ ] **No frozen delivery column is reachable** through the redirection, ending or closure payload.
- [ ] Every mutation is denied on an archived Warehouse and every read succeeds on one.
- [ ] `tests/refactor/route-table.spec.mjs` passes and no method-and-path pair is served twice.
- [ ] lint + vet clean.

## Notes

The by-line read is `/purchase-draft-lines` at the top level, **not** `/purchase-drafts/lines`, so no literal segment competes with a `{draftId}` parameter ([sad.md §7](../sad.md)). Shares the purchase-drafts contract and route-table lanes with T17.
