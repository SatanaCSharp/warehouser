---
id: T17
title: 'Replace the whole-draft arrival with per-line endings and withdraw POST /purchase-drafts/{id}/arrival'
layer: 'app'
deps: [T14, T16]
acs: ['AC-19', 'AC-20', 'AC-20a', 'AC-21']
files_hint:
  - 'apps/server/src/purchase-drafts/usecases/commands/confirm-purchase-draft-line-arrival.command.ts'
  - 'apps/server/src/purchase-drafts/usecases/commands/record-purchase-draft-line-delivery.command.ts'
  - 'apps/server/src/purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command.ts'
  - 'apps/server/src/purchase-drafts/usecases/commands/close-purchase-draft.command.ts'
  - 'apps/server/src/shared/domain/repositories/arrival-confirmation.repository.ts'
  - 'apps/server/src/purchase-drafts/rest/'
  - 'packages/contracts/src/purchase-drafts/'
  - 'tests/refactor/route-table.baseline.json'
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T17 — Replace the whole-draft arrival with per-line endings and withdraw POST /purchase-drafts/{id}/arrival

## Why

A dock arrival and a direct delivery on one draft fall on different days, so one whole-draft act cannot express them. [ADR 0002](../adr/0002-per-line-purchase-draft-endings.md) records the replacement; making the ending kind a **routing fact** rather than a payload field is what puts AC-20's refusal in front of the request instead of behind a submitted value. Derives from [spec.md §5 AC-19…AC-21](../spec.md) and [sad.md §6.10](../sad.md).

## What

Replace `ConfirmPurchaseDraftArrivalCommand` with `ConfirmPurchaseDraftLineArrivalCommand` and `RecordPurchaseDraftLineDeliveryCommand`, served at the two per-line sub-resources; **withdraw** `POST /purchase-drafts/{id}/arrival` from the contract and the route-table baseline. Extend `ArrivalConfirmationRepository` for the per-line ending and the last-line closure. The demand effect stays delegated to `customer-orders`' `DemandAllocationService` inside the one `@Transactional()` boundary the ending owns.

## Definition of Done

- [ ] One line's ending writes its quantity, every Allocation made from it and every resulting Outstanding Quantity **together or not at all**, proven with an injected mid-way failure.
- [ ] An ending against the wrong mode is refused, telling the member which of the two ways the goods travelled.
- [ ] A second ending on one line is refused, naming when and by whom the first was recorded.
- [ ] The draft stays Ready for Ordering while any line has no ending and moves to Closed exactly when the last one lands.
- [ ] Closing with a reason stays a whole-draft act available at any time, closing the draft whatever lines remain unrecorded.
- [ ] **No Item's On-hand Quantity changes** on either ending.
- [ ] The withdrawn route is absent from the regenerated route-table baseline.
- [ ] lint + vet clean.

## Notes

**Compile-coupled lane with T24.** Both list `packages/contracts/src/purchase-drafts/` in `files_hint`, so `implement` serializes them and may close both with one shared gate and one commit. [sad.md §11](../sad.md) is explicit: the contract, the baseline, the server command and the web dialog change together and **the server half must not land first**.
