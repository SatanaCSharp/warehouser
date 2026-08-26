---
id: T6
title: 'Build the On-hand Quantity adjustment: mandatory reason, current figure and append-only history in one transaction'
layer: 'app'
deps: ['T5']
acs: ['AC-08', 'AC-09', 'AC-09a', 'AC-18a']
files_hint:
  [
    'apps/server/src/items/domain/services/on-hand-adjustment.service.ts',
    'apps/server/src/items/usecases/commands/',
    'apps/server/src/shared/domain/repositories/item-stock-adjustment.repository.ts',
  ]
owner: 'Backend Lead'
estimate: 'S'
status: 'done'
---

# T6 — Build the On-hand Quantity adjustment: mandatory reason, current figure and append-only history in one transaction

> **Blocked by:** [T5](./item-catalogue-domain.md) · **Layer:** `app` · **Owner:** Backend Lead · **Estimate:** S
> **Acceptance criteria:** [AC-08](../spec.md), [AC-09](../spec.md), [AC-09a](../spec.md), [AC-18a](../spec.md)

## Why

On-hand Quantity is a maintained figure with a reason attached, never a derived balance, and the consolidated demand shows it beside each Demand Line. Derives from [spec §5 AC-08/AC-09/AC-09a/AC-18a](../spec.md) and [sad §4 "On-hand Quantity is a set-to-a-count operation"](../sad.md).

## What

- Add `ItemStockAdjustmentRepository` to `shared/domain/repositories/`.
- Add `OnHandAdjustmentService` under `@Transactional()`: set the counted figure on the Item and write its immutable adjustment row together.
- Add the adjust use case. The operation sets a count; it is never expressed as a delta.

## Definition of Done

- [ ] An integration test proves the Item's figure and its adjustment row are written together or not at all, including under an injected mid-way failure
- [ ] A test proves the adjustment row carries the count, the reason, the acting member and the time, and is append-only
- [ ] Unit tests prove a negative and a fractional count are each refused with nothing changed and the plain-language message AC-09 requires
- [ ] A test proves an adjustment without a reason is refused (AC-09a)
- [ ] An architecture or integration check proves no other code path in the feature writes on-hand — Arrival Confirmation included (AC-18a)
- [ ] lint + vet clean

## Notes

- The append-only history is what keeps the `spec.md` §8 Stock-ledger default implementable later without inventing provenance. This task asserts nothing about which answer that question takes.
- The reason is free text of the same classification as the record carrying it: stored as text, rendered as text, never as markup or a link.
