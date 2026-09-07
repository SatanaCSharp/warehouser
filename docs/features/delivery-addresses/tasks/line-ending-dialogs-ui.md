---
id: T24
title: 'Replace the whole-draft arrival modal with the two 720px per-line ending dialogs'
layer: 'ui'
deps: [T17, T23]
acs: ['AC-19', 'AC-20', 'AC-20a', 'AC-21']
files_hint:
  - 'apps/web/src/modules/purchase-draft/components/purchase-draft-transitions/'
  - 'apps/web/src/shared/alerts/mutation-actions.ts'
  - 'packages/contracts/src/purchase-drafts/'
  - 'apps/web/public/locales/'
  - 'apps/web/src/test/locale-baseline.json'
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T24 — Replace the whole-draft arrival modal with the two 720px per-line ending dialogs

## Why

The shipped whole-draft arrival modal is served by a route this feature withdraws, so it cannot survive the change — and [sad.md §11](../sad.md) requires the web half to land **with** the server half rather than after it. Derives from [spec.md §5 AC-19…AC-21](../spec.md), [ADR 0002](../adr/0002-per-line-purchase-draft-endings.md) and [design-handoff.md § Component mapping](../design-handoff.md).

## What

Replace `ConfirmArrivalDialog` with the two 720px per-line ending dialogs — arrival at the dock, and delivery to the customer — each reusing `PurchaseDraftLinkRow` as its assignment row with only the field label and trailing control differing. Remove every call to the withdrawn whole-draft arrival endpoint.

## Definition of Done

- [ ] Each dialog is offered only for its line's own delivery mode, and server refusal of the other is handled independently.
- [ ] A line whose ending is already recorded offers no second one, and the server's refusal is surfaced if it is attempted anyway.
- [ ] The success toast states the outcome **and** its invisible consequence — that a direct delivery moved no stock.
- [ ] Both modals are 720px; Cancel precedes the primary in DOM and keyboard order.
- [ ] **No call to the withdrawn whole-draft arrival endpoint remains anywhere in `apps/web`.**
- [ ] en/uk parity holds with the baseline regenerated; `pnpm --filter @warehouser/web build` passes; lint + vet clean.

## Notes

**Compile-coupled lane with T17** on `packages/contracts/src/purchase-drafts/`: `implement` serializes the pair and may close both with one gate and one commit, which is how [sad.md §11](../sad.md)'s "in one task" requirement is honoured without a single unreviewable change. The server half must not be committed alone.
