---
id: T19
title: 'Build the Demand destination: consolidated table, expandable Customer Order sub-rows, record/amend/cancel and the Customer Order picker'
layer: 'ui'
deps: ['T17', 'T11']
acs: ['AC-01', 'AC-02', 'AC-04', 'AC-05', 'AC-19', 'AC-19a', 'AC-20', 'AC-21a']
files_hint:
  [
    'apps/web/src/modules/customer-order/',
    'apps/web/public/locales/en/customer-order.json',
    'apps/web/public/locales/uk/customer-order.json',
    'apps/web/src/test/baselines/module-chunk-manifest.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'done'
---

# T19 — Build the Demand destination: consolidated table, expandable Customer Order sub-rows, record/amend/cancel and the Customer Order picker

> **Blocked by:** [T17](./ordering-web-shell.md), [T11](./customer-orders-rest-surface.md) · **Layer:** `ui` · **Owner:** Frontend Lead · **Estimate:** L
> **Acceptance criteria:** [AC-01](../spec.md), [AC-02](../spec.md), [AC-04](../spec.md), [AC-05](../spec.md), [AC-19](../spec.md), [AC-19a](../spec.md), [AC-20](../spec.md), [AC-21a](../spec.md)

## Why

The consolidated demand is the one place the decision to order is made from. Derives from [spec §5 AC-01/AC-02/AC-04/AC-05/AC-19/AC-19a/AC-20/AC-21a](../spec.md), approved frames `G6jhw` and `SjdPo`, and [sad §5 Web](../sad.md).

## What

- Add `modules/customer-order/{route,page}.tsx` at `ROUTES.WAREHOUSE_DEMAND`, plus `loaders`, `api`, `components`, `hooks`, `schemas` and `alerts`.
- The loader gates its dispatch on `CUSTOMER_ORDERS:WATCH`.
- Build `Ordering/Demand Row` (`prm7R`) with its six cells — item, outstanding, earliest needed by, on hand, covered by, actions — `Customer Order Row` (`s17RG`) as the indented sub-row, and their mobile cards `XYIfs` and `eGKuW`.
- The record, amend and cancel dialogs, and browser-only form schemas.
- Expose the **Customer Order picker** on the module's declared public surface for `modules/purchase-draft`.

**Reuses (no new primitive where one exists):** Reuses `FormModalDialog.tsx`, `ConfirmAlertDialog.tsx`, `FormTextField.tsx`, `DatasetCard.tsx`, `RoutePendingState.tsx`, the shared alert adapters, and HeroUI `Chip`, `Button`, `Alert`, `Skeleton`, `Separator`. Reaches the Item picker through `modules/item`'s declared public surface rather than promoting it to `shared/`. Tokens: `--accent-soft` for coverage chips, `--danger-soft` for overdue demand and cancelled links, `--surface-secondary` for the table header and sub-rows; **no new variable**.

## Definition of Done

- [ ] A component test proves all six demand cells and the coverage chips render, and that a Demand Line covered by two drafts still offers the record and draft affordances (AC-20)
- [ ] A test proves a Fulfilled or cancelled Customer Order is never rendered as a sub-row (AC-04, AC-17a)
- [ ] A test proves a loader refused by a missing `CUSTOMER_ORDERS:WATCH` issues zero requests, the destination is unreachable, and the denial surfaces no customer name, quantity or Item (AC-05)
- [ ] A test proves recording, amending and cancelling each invalidate the demand, drafts and Items tags so every affected view refreshes (AC-19, AC-19a)
- [ ] A test proves remaining demand under a Closed draft renders as covered by no draft (AC-21a)
- [ ] A test proves a permitted actor whose read failed reaches an error state rather than an empty surface
- [ ] Frames `G6jhw` (1440) and `SjdPo` (390) are matched — the mobile cards carry the same facts in the same priority order as the table columns — with en/uk parity and live-region and focus behaviour per § Accessibility
- [ ] `pnpm --filter @warehouser/web test`, `lint` and `tsc --noEmit` clean

## Notes

- Module named `customer-order` per `sad.md` §8; the destination, label and copy are **Demand**.
- Shares the chunk-manifest baseline with T18 and T20.
