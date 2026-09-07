---
id: T14
title: 'Extend the purchase-drafts domain with Delivery Mode, the ending rules and the closure predicate'
layer: 'domain'
deps: [T4]
acs: ['AC-13', 'AC-14', 'AC-17', 'AC-19', 'AC-20', 'AC-20a']
files_hint:
  - 'apps/server/src/purchase-drafts/domain/'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T14 — Extend the purchase-drafts domain with Delivery Mode, the ending rules and the closure predicate

## Why

Four rules decide whether a line's delivery statement and its ending are coherent, and each is a pure predicate that belongs below the commands that enforce it. Derives from [spec.md §5 AC-13, AC-14, AC-17, AC-20, AC-20a](../spec.md) and [sad.md §5 `purchase-drafts/domain`](../sad.md).

## What

Add the Delivery Mode value object and the predicates: a Direct to Customer line never names the Warehouse's own address; a new line starts as Via Warehouse; a line's ending matches its mode; an ending is recorded at most once; a draft closes exactly when every line has an ending. Add error factories for a mode or address change after freeze, a disagreeing link set, a missing Warehouse Delivery Address, a wrong-mode ending and a repeated ending.

## Definition of Done

- [ ] Unit tests cover both directions of the ending-matches-its-mode rule.
- [ ] A unit test proves the closure predicate holds exactly when every line has an ending, and not before.
- [ ] A unit test proves a direct line naming the Warehouse's own Delivery Address is refused.
- [ ] Every error factory is reachable and carries its stable `ErrorCode`.
- [ ] lint + vet clean.

## Notes

`PurchaseDraftLineEndingService` is created **only if** the two ending commands share a rule beyond the shared repository operation — a service exactly one command calls is forbidden by [server use-case boundaries](../../../system/guides/server-use-case-boundaries.md).
