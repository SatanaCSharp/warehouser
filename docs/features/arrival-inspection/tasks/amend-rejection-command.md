---
id: T11
title: 'Add AmendPurchaseDraftRejectionCommand, the first write this product aims at a Closed draft'
layer: 'app'
deps: [T4, T7, T9]
acs: ['AC-18', 'AC-18a', 'AC-18b', 'AC-19', 'AC-20', 'AC-26']
files_hint:
  - 'apps/server/src/purchase-drafts/usecases/commands/amend-purchase-draft-rejection.command.ts'
  - 'apps/server/src/purchase-drafts/usecases/usecase.module.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T11 — Add the Rejection amendment command

## Why

AC-18's telephone call happens after closure, so the Disposition and the description must stay
writable on a Closed draft while the quantity, Reason, Source and line never do. Derives from
[sad.md §6.4](../sad.md) and [sad.md §5](../sad.md)
§ `amend-purchase-draft-rejection.command.ts`.

## What

Add `AmendPurchaseDraftRejectionCommand`. It resolves one Rejection in the acting Warehouse under lock
through `PurchaseDraftRejectionRepository`, refuses a return to Undecided and an unoffered
Disposition, and writes the new description and/or Disposition with the acting member and the time.
Its state precondition is **the Rejection, not the draft's state**. Register it on `UsecaseModule`.

## Definition of Done

- [ ] A unit test proves a Disposition aimed back at `undecided` from a decided one is refused with the
      message AC-18a names (AC-18a).
- [ ] A unit test proves a Disposition outside the offered set is refused with those it offers (AC-19).
- [ ] A unit test proves a correction between two decided Dispositions succeeds — no decision is
      terminal (AC-18).
- [ ] A unit test proves a description-only amendment leaves the Disposition untouched and still
      records the acting member and the time (AC-18b).
- [ ] A unit test proves the command touches **no** quantity, Reason, Source or line on any path.
- [ ] A unit test proves a Rejection in another Warehouse fails identically to one that does not
      exist, disclosing nothing (AC-26).
- [ ] An integration test amends a Rejection whose draft is **Closed** and asserts it succeeds, and
      that no Allocation, Outstanding Quantity or draft state moved (AC-18).
- [ ] The command carries its own single `@Transactional()` boundary and opens no other.
- [ ] `pnpm --filter @warehouser/server test`, `test:integration`, `lint` and `build` are green.

## Notes

**This is the first write this product aims at a Closed draft** ([sad.md §6.4](../sad.md) flags). Any
repository-wide assertion that a Closed draft is immutable — in a spec, a check, or a reviewer's
memory — is now wrong. That is the **seventh item** the change request
[sad.md §11](../sad.md) owes must carry, and it is still unraised; see the epic's
"Outstanding gates".

**Hard rule** ([spec.md §6](../spec.md) Condition immutability): the fixed part of a Rejection Record —
its quantity, Reason, Source and line — is unwritable after insert, and every amendment records the
acting member and the time.

AC-20's refusal is the guard's (`REJECTIONS:UPDATE`), delivered by T13's route; this command must not
re-implement admission.
