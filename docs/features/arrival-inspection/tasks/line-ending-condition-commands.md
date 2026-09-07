---
id: T10
title: 'Give both ending commands the condition half of the ending and narrow the Allocation bound to the derived Accepted Quantity'
layer: 'app'
deps: [T5, T8, T9]
acs:
  [
    'AC-01',
    'AC-01a',
    'AC-01b',
    'AC-02',
    'AC-04',
    'AC-04a',
    'AC-05',
    'AC-08',
    'AC-10',
    'AC-11',
    'AC-12',
    'AC-13',
    'AC-15',
    'AC-15a',
    'AC-24',
    'AC-25',
  ]
files_hint:
  - 'apps/server/src/purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command.ts'
  - 'apps/server/src/purchase-drafts/usecases/commands/record-purchase-draft-line-delivery.command.ts'
  - 'apps/server/src/purchase-drafts/usecases/commands/purchase-draft-line-ending.spec.ts'
  - 'apps/server/src/purchase-drafts/usecases/commands/purchase-draft-line-ending.integration.spec.ts'
  - 'apps/server/src/customer-orders/domain/services/demand-allocation.service.ts'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T10 — Give both ending commands the condition half, and narrow the Allocation bound

## Why

This is the feature: the ending stops recording only how much and starts recording in what state, and
the quantity an Allocation may draw on narrows from what the supplier presented to what was accepted —
so a refusal leaves the customer's Outstanding Quantity where it was. Derives from
[sad.md §6.1](../sad.md), [sad.md §6.2](../sad.md) and [sad.md §4](../sad.md)
§ "The Allocation bound narrows inside the service that already owns it".

## What

Extend `ConfirmPurchaseDraftLineArrivalCommand` and `RecordPurchaseDraftLineDeliveryCommand` with the
condition half, **in one order**: lock, `assertAdmitsEnding` (unchanged), the Rejection-capability
assertion, the Condition Split assertion, the Pre-receipt Conformance assertion, the writes, then the
delegation to `customer-orders` bounded by the derived Accepted Quantity. Each keeps its own single
`@Transactional()` boundary and its own input type. A line where nothing was received records neither
judgement and runs neither assertion (AC-04a).

Rename `DemandAllocationService`'s line-wide bound input field to `assignableQuantity` and its
violation to `allocations_exceed_accepted_quantity`, carrying the accepted **and** rejected figures
AC-11's message names. Its two other bounds, its lock order, its Fulfilled transition and its absence
of a transaction of its own are unchanged, and it remains the only exported member of
`customer-orders`' use-case module.

## Definition of Done

- [ ] Unit tests prove the capability refusal fires on a Rejection-carrying submission and is
      **unreachable** on a refusal-free one, which still records (AC-01a, AC-01b).
- [ ] Unit tests prove every Condition Split and conformance refusal records **nothing** — no ending,
      no conformance, no Rejection, no Allocation.
- [ ] A unit test proves the **accepted** figure, not the presented one, reaches the demand delegation.
- [ ] A unit test proves the unknown-Reason refusal carries the available Reasons (AC-06 via T8).
- [ ] A unit test proves a nothing-received ending writes the ending alone and runs neither condition
      assertion (AC-04a).
- [ ] Unit tests cover the direct-delivery path's mirrored Source rule: every Rejection on that line
      takes the customer-reported Source, a refusal claiming inspection at the dock is refused, and the
      refused quantity is assigned to nobody (AC-24, AC-25).
- [ ] `DemandAllocationService` refuses an over-assignment with `allocations_exceed_accepted_quantity`
      carrying both figures (AC-11), and still refuses a cancelled or Fulfilled order as it does today
      (AC-12). Its shipped suites stay green.
- [ ] An integration test proves the ending writes its quantity, its conformance, every Rejection,
      every Allocation and every resulting Outstanding Quantity **together or not at all**, under an
      injected failure mid-way **and** under a failure raised by a Condition Split rule.
- [ ] An integration test proves the draft closes exactly when the last line's ending lands, and that a
      second ending on one line is refused (AC-04).
- [ ] `pnpm --filter @warehouser/server test`, `test:integration`, `lint` and `build` are green.

## Notes

**Compile-coupled by design.** Renaming `DemandAllocationService`'s exported input field breaks both
callers at once, so the rename and both callers land in this one task rather than in a standalone
contract task that could not be committed green
([sad.md §2](../sad.md) § "A shipped exported service's bound is renamed, not replaced").

**Hard rule** ([sad.md §4](../sad.md)): the bound that refuses must be the bound that can name what it
refused. Do not leave `DemandAllocationService` untouched and enrich its refusal in `purchase-drafts`
— [use case boundaries](../../../system/guides/server-use-case-boundaries.md) forbids mapping an error
to another type before the global filter.

**Hard rule** ([spec.md §6](../spec.md) Ending atomicity): one `@Transactional()` boundary, the same
one the ending has today — widened in what it writes, never split.

**Hard rule**: the Accepted Quantity is **derived inside the command** from input it has already
validated. No column, no member-writable figure, no second read.

Nothing here writes stock. No Item's On-hand Quantity changes on either path.
