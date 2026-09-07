---
id: T9
title: 'Extend @warehouser/contracts/purchase-drafts with the condition payload, the amendment request and the Rejection Reason schema'
layer: 'ports'
deps: []
acs: ['AC-03', 'AC-14', 'AC-15b', 'AC-19', 'AC-24']
files_hint:
  - 'packages/contracts/src/purchase-drafts/purchase-drafts-mutations.ts'
  - 'packages/contracts/src/purchase-drafts/index.ts'
  - 'packages/contracts/src/purchase-drafts/purchase-drafts-contracts.spec.ts'
owner: 'Tech Lead'
estimate: 'M'
status: 'todo'
---

# T9 — Extend the shared purchase-drafts contracts

## Why

Six tasks on both sides of the boundary compile against these schemas, and none can start until the
shape is fixed. This is the epic's second root: it depends on nothing. Derives from
[sad.md §7](../sad.md) § "HTTP and shared contracts" and
[contracts/openapi.yaml](../contracts/openapi.yaml).

## What

Extend the **existing** `@warehouser/contracts/purchase-drafts` subpath:

- both ending request schemas gain `rejections` (quantity, Reason identifier, Source, optional
  description) and `preReceiptConformance` (verdict, optional note);
- a new amendment request schema carries the description and the Disposition;
- a Rejection Reason schema carries the identifier, label and `requiresDescription`.

**No new subpath is created**, which is what keeps the two-alias `vite.config.ts` trap untripped
([sad.md §10](../sad.md), gate 3) — that failure breaks only `pnpm --filter @warehouser/web build`
while the entire test suite stays green, which is why the build command is part of this task's DoD.

The four-shape **line projection** is deliberately **not** here: it is a union its implementers must
satisfy, so it lands with T12, the query that builds it.

## Definition of Done

- [ ] Every schema is `z.strictObject`, so an unknown property is a validation failure rather than a
      silently ignored one; a contract spec proves it for each.
- [ ] No schema accepts the Accepted Quantity, the Rejected Quantity, a count, the raising member or
      the time — each is derived or attributed, **never input** ([sad.md §7](../sad.md)).
- [ ] The Rejection Source is present in the request schema but its legal value is proven by the
      server against the line's Delivery Mode, not by the schema (AC-24, AC-25 belong to T7/T10).
- [ ] The Reason identifier is a plain identifier validated by the **server** against the catalogue,
      not enumerated in the schema — the catalogue is data (AC-06).
- [ ] Contract specs prove the description and note bounds at 1 000 characters (AC-14, AC-15b), the
      quantity's whole-number-at-least-one rule (AC-03), and the Disposition value domain (AC-19).
- [ ] `pnpm --filter @warehouser/contracts test`, `pnpm --filter @warehouser/server build` and
      **`pnpm --filter @warehouser/web build`** are all green.

## Notes

**Compile-coupled lane.** This file is also touched by T12 (the projection shapes) and is imported by
T10, T11 and T13. `implement` serializes tasks whose `files_hint` overlaps; that is intended here.

Keep this task **additive**. Adding new schemas and adding properties to the two ending request
schemas compiles green on its own; changing the line projection into a four-member union does not,
which is why it is folded into its implementing task rather than emitted standalone.
