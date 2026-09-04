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

## Defect inherited from T15 — a 500 where the contract promises 404/409

`sad.md` §6.7 step 4 requires the line-delivery flow to "prove the address belongs to a Customer of
the acting Warehouse and is active". **That proof is not implemented.** T15 left it deliberately: it
enforces AC-12, which is in neither T15's nor T19's declared `acs`, and it needs a new read on
`CustomerAddressBookRepository`, outside T15's `files_hint`.

Consequence today: naming an unknown or cross-Warehouse Customer Delivery Address on a Direct to
Customer line reaches `fk_purchase_draft_lines_delivery_address`, and the resulting
`QueryFailedError` is surfaced by the global filter as a **500**. `revisePurchaseDraftLine` declares
`404 PurchaseDraftTargetUnavailable` and `409 PurchaseDraftLineDestinationConflict` and no such
internal failure, so the implementation contradicts its own contract on this path. An Inactive
address is the same story with no constraint to catch it at all.

**T19 owns closing this** (or an explicit follow-up task, if T19's scope is already full — but it must
not be left silent). The fix is a Customer-scoped, Warehouse-scoped availability read before the
write, refusing with the declared codes rather than letting the constraint fire.

## Interface change T15 made that T19 must map

`ReviseLineInput` carries the destination as **one optional property**,
`destination: { deliveryMode, customerDeliveryAddressId }`, rather than two flat ones — so "an
address with no mode" is unrepresentable at the use-case boundary, which is the contract's
`dependentRequired` expressed as a type. The REST DTO must fold the two payload properties into it.
Setting `via_warehouse` normalizes the address to `null`, per the contract's "setting
`via_warehouse` clears it".

## Precondition inherited from T11

T11's Definition of Done includes "the address is readable from the Warehouse-scoped draft and line
projections by a member holding no Workspace Role at all". Only half of that was provable in T11:
those projections are `warehouseDestination` on a Via Warehouse line, which this task owns, and at
T11 a line had no Delivery Mode yet. T11 pinned the half it owns — that the recorded address and
notes sit unredacted on the `warehouses` row, and that a member with a Warehouse membership and no
`workspace_memberships` row is refused the Workspace-scoped read and write — and recorded the gap
in a header comment.

**T19 must assert the end-to-end read**: a member holding `PURCHASE_DRAFTS:WATCH` and **no Workspace
Role at all** reads the Warehouse's Delivery Address through the draft and line projections.

**Correction (2026-09-04).** An earlier version of this note said the read "does not carry
`accessNotes`; those stay behind `WAREHOUSES:ADDRESS_UPDATE`". That was wrong, and T19 was right to
follow the contract instead. `openapi.yaml` `LineWarehouseDestination` lists `accessNotes` in
`required` and states the object is "readable by any member holding `PURCHASE_DRAFTS:WATCH` in that
Warehouse and is **never** gated on `CUSTOMERS:WATCH` — a member who prepares the dock may hold no
Workspace Role at all". `spec.md` § "Personal data touched" agrees: the Warehouse's own address and
notes are the operator's own premises data, not a third party's. The note conflated the _write_
Permission with the read: a member receiving goods needs the gate code. AC-09a withholds the
_customer's_ address and notes, which is a different object.

## Notes

The by-line read is `/purchase-draft-lines` at the top level, **not** `/purchase-drafts/lines`, so no literal segment competes with a `{draftId}` parameter ([sad.md §7](../sad.md)). Shares the purchase-drafts contract and route-table lanes with T17.
