---
id: T14
title: 'Build PurchaseDraftReadRepository and the drift queries comparing the snapshot against current demand'
layer: 'app'
deps: ['T13', 'T10']
acs: ['AC-16', 'AC-16a', 'AC-21a']
files_hint:
  [
    'apps/server/src/shared/domain/repositories/purchase-draft-read.repository.ts',
    'apps/server/src/purchase-drafts/usecases/queries/',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T14 — Build PurchaseDraftReadRepository and the drift queries comparing the snapshot against current demand

> **Blocked by:** [T13](./purchase-draft-freeze-and-closure.md), [T10](./consolidated-demand-read.md) · **Layer:** `app` · **Owner:** Backend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-16](../spec.md), [AC-16a](../spec.md), [AC-21a](../spec.md)

## Why

A member must learn that demand moved before the goods arrive rather than at the truck. Derives from [spec §5 AC-16/AC-16a/AC-21a](../spec.md), [sad §4](../sad.md) and [sad §6.8](../sad.md).

## What

- Add `PurchaseDraftReadRepository`: the Demand Snapshot joined against the Customer Orders as they stand now, as one purpose-built query.
- Add the queries: the Warehouse's drafts with per-draft drift presence and state, and one draft with its lines, links, Pre-receipt Requirements, per-link drift detail, received quantities and Allocations.
- A Drift Signal is a value comparison, computed on read and never stored.

## Definition of Done

- [ ] Integration tests prove a Drift Signal is reported when a linked Customer Order is cancelled, has its quantity changed, has its needed-by date moved, or becomes Fulfilled through a different draft — each naming the order and what changed (AC-16)
- [ ] A test proves a value amended and then put back as it was reports **no** drift
- [ ] A test proves the read alters no frozen value of the draft
- [ ] A test proves the drafts list distinguishes drafts carrying a Drift Signal from those still matching their demand (AC-16a)
- [ ] A test proves a Closed draft stays readable as the record of what was ordered and what arrived while presenting as Coverage against nothing (AC-21a)
- [ ] lint + vet clean

## Notes

- The draft is never a live projection of current demand. The comparison reports; the draft is left alone, because its value is that it says what was actually ordered.
