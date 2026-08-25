---
id: T13
title: 'Build the freeze with its Demand Snapshot capture, and closure and discard as guarded transitions'
layer: 'app'
deps: ['T12']
acs: ['AC-14', 'AC-14a', 'AC-15', 'AC-21', 'AC-24', 'AC-24a']
files_hint:
  [
    'apps/server/src/purchase-drafts/domain/services/',
    'apps/server/src/purchase-drafts/usecases/commands/',
    'apps/server/src/shared/domain/repositories/purchase-draft-freeze.repository.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T13 — Build the freeze with its Demand Snapshot capture, and closure and discard as guarded transitions

> **Blocked by:** [T12](./purchase-draft-assembly.md) · **Layer:** `app` · **Owner:** Backend Lead · **Estimate:** L
> **Acceptance criteria:** [AC-14](../spec.md), [AC-14a](../spec.md), [AC-15](../spec.md), [AC-21](../spec.md), [AC-24](../spec.md), [AC-24a](../spec.md)

## Why

Ready for Ordering is the record of what the member told the supplier, so the freeze must capture the demand as it stood and the draft must become structurally unwritable. Derives from [spec §5 AC-14/AC-14a/AC-15/AC-21/AC-24/AC-24a](../spec.md), [sad §4 "The Demand Snapshot is captured rows"](../sad.md), [sad §6.7](../sad.md) and [sad §6.11](../sad.md).

## What

- Add `PurchaseDraftFreezeRepository` and `PurchaseDraftFreezeService` under `@Transactional()`: the guarded transition plus one Demand Snapshot row per linked Customer Order carrying that order's quantity, needed-by date and state at that instant.
- Add `PurchaseDraftClosureService`: close a frozen draft with a reason, and discard a draft that was never made ready.
- Add the discardable and closable predicates and the error factories for an empty draft, a discard-after-ready attempt and a concurrent transition.
- Each transition is a conditional update resolving the draft only in the state it is legal from.

## Definition of Done

- [ ] An integration test proves the freeze writes exactly one snapshot row per link with the captured quantity, needed-by date and state, in the same transaction as the transition
- [ ] A test proves two concurrent freezes leave exactly one succeeding, the second typed as a concurrency refusal rather than merged
- [ ] A test proves a draft holding no lines cannot be moved to Ready for Ordering (AC-14a)
- [ ] A test proves **every** assembly path from T12 — line, ordered quantity, link, Expected Arrival Date, Pre-receipt Requirement — is refused against a frozen draft, for the creator and the Warehouse Manager alike (AC-15)
- [ ] A test proves closure records the reason, member and time, keeps the frozen contents readable and leaves the Outstanding Quantity of every linked Customer Order untouched (AC-21)
- [ ] A test proves discarding a `Draft` records the member and time and leaves every linked Customer Order exactly as it was (AC-24), and that discarding a ready draft is refused with the AC-24a message
- [ ] lint + vet clean

## Notes

- "A frozen draft never changes" and "Arrival Confirmation happens at most once" are not expressible as row constraints — they are state-guarded transitions inside the owning command. An architecture check plus these integration tests are the evidence (`sad.md` §7, §10).
- The snapshot is captured rows, not a re-derivation — that is what makes "amended and then put back as it was reports no drift" true without a touch log.
