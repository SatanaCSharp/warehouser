---
id: T18
title: 'Build the Items destination: table with on-hand and its reason, the create/correct/deactivate dialogs and the Item picker'
layer: 'ui'
deps: ['T17', 'T7']
acs: ['AC-06', 'AC-06a', 'AC-06b', 'AC-06d', 'AC-08', 'AC-09a']
files_hint:
  [
    'apps/web/src/modules/item/',
    'apps/web/public/locales/en/item.json',
    'apps/web/public/locales/uk/item.json',
    'apps/web/src/test/baselines/module-chunk-manifest.json',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T18 — Build the Items destination: table with on-hand and its reason, the create/correct/deactivate dialogs and the Item picker

> **Blocked by:** [T17](./ordering-web-shell.md), [T7](./items-rest-surface.md) · **Layer:** `ui` · **Owner:** Frontend Lead · **Estimate:** M
> **Acceptance criteria:** [AC-06](../spec.md), [AC-06a](../spec.md), [AC-06b](../spec.md), [AC-06d](../spec.md), [AC-08](../spec.md), [AC-09a](../spec.md)

## Why

The Item catalogue is what makes the same physical good aggregate into one Demand Line. Derives from [spec §5 AC-06/AC-06a/AC-06b/AC-06d/AC-08/AC-09a](../spec.md), approved frames `XIvAZ` and `VHU6r` in [design-handoff](../design-handoff.md), and [sad §5 Web](../sad.md).

## What

- Add `modules/item/{route,page}.tsx` at `ROUTES.WAREHOUSE_ITEMS`, plus `loaders`, `api`, `components`, `hooks`, `schemas` and `alerts`.
- The loader gates its dispatch on `ITEMS:WATCH` so a refused address issues zero requests, and imports no page and no component.
- Build `Ordering/Item Row` (`xEIH0`) and `Item Card Mobile` (`QSHsy`) — the on-hand cell carries the figure **and** its reason line.
- The create, correct and deactivate dialogs on `FormModalDialog` / `ConfirmAlertDialog`, and the on-hand adjustment dialog.
- Expose the **Item picker** on the module's declared public surface for `modules/customer-order` and `modules/purchase-draft` to reach.

**Reuses (no new primitive where one exists):** Reuses `shared/components/FormModalDialog.tsx`, `ConfirmAlertDialog.tsx`, `FormTextField.tsx`, `FormSelectField.tsx`, `DatasetCard.tsx`, `RoutePendingState.tsx`, `shared/alerts/{toast,api-feedback,mutation-actions}.ts` and HeroUI `Chip`, `Button`, `Separator`, `Alert`, `Skeleton`. New components are the two listed above only. Tokens bind the existing themed `semantic` variables — `--success-soft` for the active chip, `--default-soft` and `--border-secondary` for the inactive treatment; **no new variable is defined**.

## Definition of Done

- [ ] A component test proves the on-hand cell renders the counted figure **and** its reason line — the reason is part of the contract, not decoration
- [ ] A test proves a loader refused by a missing `ITEMS:WATCH` issues zero requests and the destination is unreachable
- [ ] A test proves an inactive Item is chipped as such and is not offered by the picker, while its rows stay readable (AC-06d)
- [ ] A test proves each dialog handles server denial independently and its failure copy states that nothing changed (AC-09a)
- [ ] A test proves the adjustment dialog does not duplicate server validation rules client-side
- [ ] Frames `XIvAZ` (1440) and `VHU6r` (390) are matched, with focus restored on dialog close, en/uk copy at full parity, and per-Warehouse cache keying with refetch on switch
- [ ] `pnpm --filter @warehouser/web test`, `lint` and `tsc --noEmit` clean, with `chunk-manifest` regenerated deliberately

## Notes

- Shares `apps/web/src/test/baselines/module-chunk-manifest.json` with T19 and T20 — three new `loaders/` directories invalidate the frozen manifest, so `implement` serializes the three module tasks and the baseline is regenerated, never silenced (`sad.md` §10).
- `ITEMS:WATCH` independently controls this destination: never expose a dataset merely because room exists.
