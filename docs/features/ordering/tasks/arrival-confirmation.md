---
id: T15
title: 'Build Arrival Confirmation: received quantities, delegated Allocations and the move to Closed in one transaction'
layer: 'app'
deps: ['T13', 'T9']
acs: ['AC-17', 'AC-17a', 'AC-17b', 'AC-18', 'AC-18a']
files_hint:
  [
    'apps/server/src/purchase-drafts/domain/services/arrival-confirmation.service.ts',
    'apps/server/src/shared/domain/repositories/arrival-confirmation.repository.ts',
    'apps/server/src/purchase-drafts/usecases/commands/',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T15 — Build Arrival Confirmation: received quantities, delegated Allocations and the move to Closed in one transaction

> **Blocked by:** [T13](./purchase-draft-freeze-and-closure.md), [T9](./demand-allocation-service.md) · **Layer:** `app` · **Owner:** Backend Lead · **Estimate:** L
> **Acceptance criteria:** [AC-17](../spec.md), [AC-17a](../spec.md), [AC-17b](../spec.md), [AC-18](../spec.md), [AC-18a](../spec.md)

## Why

Arrival Confirmation closes the loop back to the named customers, and it is the one write the frozen record still accepts. Derives from [spec §5 AC-17/AC-17a/AC-17b/AC-18/AC-18a](../spec.md), [ADR 0002](../adr/0002-arrival-confirmation-ownership.md) and [sad §6.9](../sad.md).

## What

- Add `ArrivalConfirmationRepository` and `ArrivalConfirmationService` under one `@Transactional()` boundary.
- Record the received quantity of every line, call `DemandAllocationService` for the demand effect, and move the draft to Closed — all inside that one boundary.
- The confirmation is a conditional update resolving the draft only in Ready for Ordering; a second confirmation is a typed refusal.
- Write nothing else: the frozen lines, ordered quantities, links, Expected Arrival Date and Pre-receipt Requirements are unreachable through it.

## Definition of Done

- [ ] An integration test with an **injected mid-way failure** proves received quantities, Allocations, Outstanding Quantities and the Closed state are recorded together or not at all (`spec.md` §6 "Arrival atomicity")
- [ ] A test proves two concurrent confirmations of one draft leave exactly one succeeding
- [ ] A test proves a line that arrived short of, and one that exceeded, what was ordered are both recorded, and that a line allocating nothing records what arrived and no Allocation while the draft still moves to Closed (AC-17b)
- [ ] A test proves each AC-18 bound blocks the confirmation and records **nothing** of it, naming which assignment was refused and why
- [ ] A test proves the linked orders are afterwards Fulfilled or still counting for the unreceived part (AC-17a)
- [ ] A test proves no Item's On-hand Quantity changed (AC-18a)
- [ ] An architecture check proves no frozen field is writable through this path (AC-15, `spec.md` §6.1 "Allocation as a back door")
- [ ] lint + vet clean

## Notes

- Follows the one fixed lock order: the draft row, then its lines, then the Customer Orders it touches in ascending identifier order — the same order T8's amendment path takes, which is what keeps the two from deadlocking (`sad.md` §8, §11).
- Confirming an arrival closes a draft once and for all; goods the supplier still owes are ordered on a new draft.
