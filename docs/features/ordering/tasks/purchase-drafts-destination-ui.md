---
id: T20
title: 'Build the Purchase drafts destination: list and detail, the three tabs, line and link editing, the frozen treatment and the Drift Signal'
layer: 'ui'
deps: ['T17', 'T16']
acs: ['AC-10', 'AC-10a', 'AC-11a', 'AC-12', 'AC-15', 'AC-16', 'AC-16a']
files_hint:
  [
    'apps/web/src/modules/purchase-draft/',
    'apps/web/public/locales/en/purchase-draft.json',
    'apps/web/public/locales/uk/purchase-draft.json',
    'apps/web/src/test/baselines/module-chunk-manifest.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'done'
---

# T20 — Build the Purchase drafts destination: list and detail, the three tabs, line and link editing, the frozen treatment and the Drift Signal

> **Blocked by:** [T17](./ordering-web-shell.md), [T16](./purchase-drafts-rest-surface.md) · **Layer:** `ui` · **Owner:** Frontend Lead · **Estimate:** L
> **Acceptance criteria:** [AC-10](../spec.md), [AC-10a](../spec.md), [AC-11a](../spec.md), [AC-12](../spec.md), [AC-15](../spec.md), [AC-16](../spec.md), [AC-16a](../spec.md)

## Why

The draft is where the member decides what to phone the supplier about, and where the frozen record and its Drift Signal are read. Derives from [spec §5 AC-10/AC-10a/AC-11a/AC-12/AC-15/AC-16/AC-16a](../spec.md), approved frames `yGhkK`, `F0SpRx` and `O42LHI`, and [sad §5 Web](../sad.md).

## What

- Add `modules/purchase-draft/{route,page}.tsx` at `ROUTES.WAREHOUSE_PURCHASE_DRAFTS`, plus `loaders`, `api`, `components`, `hooks`, `schemas` and `alerts`.
- List-and-detail at 1440 (340px list, fill detail, 24px gap); two screens at 390 with a `chevron-left` "All purchase drafts" back affordance.
- The three tabs — `Being worked on` / `Ready for ordering` / `Closed` — segmented at both viewports.
- Build `Ordering/Draft Card` (`l5QF7B`), `Draft Line` (`ehtEw`) as **one** component for the editable and the frozen line, and `Link Row` (`BSmrU`).
- The Drift Signal presentation and the frozen treatment.

**Reuses (no new primitive where one exists):** Reuses HeroUI `Tabs` as used in `modules/access/.../AccessWorkspace.tsx`, HeroUI `Chip`, `Button` (incl. icon-only), `Alert` with `shared/alerts/api-feedback.ts` copy, `Separator`, and `DatasetCard.tsx` / `RoutePendingState.tsx` for the loading, empty and error contract. Reaches the Item picker and the Customer Order picker through `modules/item` and `modules/customer-order`'s declared public surfaces. Tokens: `--warning-soft` and `--warning` for the Drift Signal, `--default` / `--default-soft` / `--border-secondary` for frozen fields, `--surface-secondary` for the line block and link rows; **no new variable**.

## Definition of Done

- [ ] A test proves draft state renders through a total `Record<State, ReactElement>` lookup, never an `if`/`else if` chain
- [ ] A test proves a frozen line uses the HeroUI **disabled field treatment and exposes the reason**, never a read-only lookalike, and that no frozen control is submittable (AC-15)
- [ ] A test proves the Drift Signal is icon **plus text** and never colour alone, and that a card without drift is visibly distinguished from one with it (AC-16, AC-16a)
- [ ] A test proves link quantities are never adjusted client-side and that overlapping links render without warning (AC-11a)
- [ ] A test proves per-line Packaging Type and Value-adding Note both render when the draft is opened (AC-12)
- [ ] A test proves a loader refused by a missing `PURCHASE_DRAFTS:WATCH` issues zero requests
- [ ] Frames `yGhkK`, `F0SpRx` (1440) and `O42LHI` (390) are matched, including the three documented mobile differences: the detail drops its outer card frame, the line field row stacks, and the link row narrows its quantity field to 96px so the customer name wraps rather than the unlink action moving
- [ ] `pnpm --filter @warehouser/web test`, `lint` and `tsc --noEmit` clean, with `chunk-manifest` regenerated deliberately

## Notes

- The Value-adding Note is free text at the line, with the member splitting the line when two customers need different labelling (`spec.md` §8, fourth question, taking its stated default).
- Free text is rendered as text and never as markup or a link (`spec.md` §6.1).
