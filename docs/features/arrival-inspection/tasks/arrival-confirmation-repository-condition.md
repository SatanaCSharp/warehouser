---
id: T5
title: 'Extend ArrivalConfirmationRepository: widen the locked-line projection by exactly two frozen columns and write the conformance and every Rejection with the ending'
layer: 'infra'
deps: [T3]
acs: ['AC-01', 'AC-04', 'AC-08', 'AC-15', 'AC-17', 'AC-17a']
files_hint:
  - 'apps/server/src/shared/domain/repositories/arrival-confirmation.repository.ts'
  - 'apps/server/src/shared/domain/repositories/arrival-confirmation.repository.integration.spec.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T5 — Extend ArrivalConfirmationRepository for the condition half of the ending

## Why

AC-17 and AC-17a decide the Pre-receipt Conformance against the Packaging Type and Value-adding Note
**frozen on the line**, so both must be readable from the row the ending already locks — and from
nothing else. AC-01 and AC-08 need the ending, its conformance and every Rejection written in one
statement set so [spec.md §6](../spec.md)'s "Ending atomicity" holds. Derives from
[sad.md §6.1 step 3](../sad.md), [sad.md §2](../sad.md) § "Three consequences" and
[data-model.md §Repository boundaries](../data-model.md).

## What

Widen `lockDraftLineForEnding`'s projection by **`packaging_type_id` and `value_adding_note`, and by
nothing else**. `ordered_quantity` stays withheld.

Extend `recordLineEnding` to write the ending quantity, the Pre-receipt Conformance and one Rejection
row per stated Reason in the same statement set, keeping its existing `recorded`/`closed` answers and
the fixed lock order — the draft row, then its line, then that line's refusals, then the Customer
Orders in ascending identifier order.

## Definition of Done

- [ ] `lockDraftLineForEnding` returns `packagingTypeId` and `valueAddingNote` alongside what it
      returns today, and an assertion in the spec proves `ordered_quantity` is **not** in the
      projected column list.
- [ ] `recordLineEnding` writes the conformance verdict and note onto the line and inserts one row per
      stated Reason, all inside the caller's transaction — the repository opens none of its own.
- [ ] An integration test proves a failure raised after the ending row is written leaves **no**
      Rejection and no conformance behind (AC-01, AC-08).
- [ ] An integration test proves a nothing-received ending writes neither a Rejection nor a
      conformance (AC-04a's persistence half).
- [ ] The existing `recorded`/`closed` answers are unchanged, and the shipped
      `arrival-confirmation.repository.integration.spec.ts` cases stay green (AC-04).
- [ ] The refusal rows take their place in the lock order between the line and the Customer Orders; an
      assertion covers the statement order.
- [ ] `pnpm --filter @warehouser/server test`, `test:integration`, `lint` and `build` are green.

## Notes

**Hard rule** ([sad.md §11](../sad.md), [spec.md §6.1](../spec.md)): `ordered_quantity` stays out of
this projection. It is what keeps "Refusal as a route around the Allocation bound" a **property** of
the write path rather than a check on it. T14 adds the architecture check that asserts it; this task
must not widen the projection further, and a reviewer should treat any third added column as a
finding.

The file it lives in documents its withholding as deliberate. Update that comment to say exactly which
two columns were given up and why — [sad.md §2](../sad.md) records this as a bounded narrowing, not a
reversal.

**Hard rule** ([sad.md §8](../sad.md)): the lock order is `delivery-addresses`', extended rather than
replaced. A fourth write path adopting a different order reintroduces the deadlock.
