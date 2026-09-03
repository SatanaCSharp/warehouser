---
id: T16
title: 'Freeze the delivery statement by value and refuse the two conditions that make a freeze unsound'
layer: 'app'
deps: [T11, T15]
acs: ['AC-15a', 'AC-16', 'AC-16a', 'AC-17']
files_hint:
  - 'apps/server/src/purchase-drafts/usecases/commands/ready-purchase-draft.command.ts'
  - 'apps/server/src/shared/domain/repositories/purchase-draft-freeze.repository.ts'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T16 — Freeze the delivery statement by value and refuse the two conditions that make a freeze unsound

## Why

The Delivery Address is the most consequential thing the member told the supplier, and the draft's whole value is that it says what was actually ordered. Capturing it **by value** is what makes AC-17 structural: there is no live reference left for an edit in place to travel along. Derives from [spec.md §5 AC-16, AC-16a, AC-17](../spec.md), [sad.md §4, §6.8](../sad.md) and [spec.md §8](../spec.md) second question at its stated default.

## What

Extend the readiness command so entering Ready for Ordering captures each line's Delivery Address text, access notes and customer name as they read at that instant, and each Demand Snapshot entry's captured Delivery Address for the order it links. Refuse the transition when a Via Warehouse line's Warehouse has no Delivery Address, and when the direct-line agreement does not hold.

## Definition of Done

- [ ] An integration test proves a later edit of the source address does **not** move a captured value.
- [ ] The frozen line holds non-null captured address text and retains no live address reference.
- [ ] The transition is refused when the Warehouse has no Delivery Address, naming `WAREHOUSES:ADDRESS_UPDATE` as what unblocks it — while adding and revising lines on that draft keeps working.
- [ ] The transition is refused on a disagreeing link set, naming every disagreement.
- [ ] A Via Warehouse line captures no customer name; a Direct to Customer line captures one.
- [ ] lint + vet clean.

## Notes

**Hard rule** ([spec.md §6](../spec.md) Frozen-address integrity): 0 recorded changes to a frozen line's mode or Delivery Address; the recorded endings and the move to Closed are the only permitted additions. AC-16a is a **freeze precondition, not a line-level one**.
