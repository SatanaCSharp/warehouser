---
id: T15
title: "Set a line's Delivery Mode and Delivery Address, and enforce the direct-line agreement at the link and the revision"
layer: 'app'
deps: [T12, T14]
acs: ['AC-13', 'AC-14', 'AC-15', 'AC-15a', 'AC-15b']
files_hint:
  - 'apps/server/src/purchase-drafts/domain/services/'
  - 'apps/server/src/purchase-drafts/usecases/commands/revise-purchase-draft-line.command.ts'
  - 'apps/server/src/purchase-drafts/usecases/commands/add-purchase-draft-line.command.ts'
  - 'apps/server/src/purchase-drafts/usecases/commands/add-purchase-draft-line-link.command.ts'
  - 'apps/server/src/purchase-drafts/usecases/commands/revise-purchase-draft-line-link.command.ts'
  - 'apps/server/src/shared/domain/repositories/purchase-draft-assembly.repository.ts'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T15 — Set a line's Delivery Mode and Delivery Address, and enforce the direct-line agreement at the link and the revision

## Why

This is the one place the product overrules a member's judgement: goods delivered to one company's depot cannot simultaneously be at another's, which is not a decision but a physical fact. AC-15a makes the agreement **continuous** — required at the link, at the revision and at the freeze — which is why it is one shared read and not three copies. Derives from [spec.md §5 AC-13…AC-15b](../spec.md) and [sad.md §4, §6.7](../sad.md).

## What

Carry Delivery Mode and Delivery Address on the line add and revise commands. Extend `PurchaseDraftAssemblyService` with the disagreeing-link read — "which of this line's links name a Delivery Address other than the line's?" — and invoke it from the link command and the line-revision command. A Via Warehouse line runs no such check.

## Definition of Done

- [ ] A direct line is refused any link to a Customer Order going to another address, naming the address each of the two is bound for.
- [ ] A revision that would strand existing links is refused, **naming every** disagreement and **withdrawing none**.
- [ ] A Via Warehouse line accepts links to several different addresses with quantities that do not add up, and no quantity is adjusted.
- [ ] Setting a line Direct to Customer while naming the Warehouse's own address is refused.
- [ ] The agreement check exists once and all its callers use it — no second copy.
- [ ] lint + vet clean.

## Notes

**Hard rule** ([spec.md §6](../spec.md) Direct-line agreement): 100% of direct lines link only to orders naming the same address, checked at all three moments. Which link to withdraw stays the member's decision — the system names, it never repairs.
