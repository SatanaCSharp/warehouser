---
id: T34
title: 'Add the Warehouse switcher to the application shell'
layer: 'ui'
deps: ['T32', 'T33']
acs: ['AC-03', 'AC-03b', 'AC-04']
files_hint:
  [
    'apps/web/src/shared/layouts/WarehouseSwitcher.tsx',
    'apps/web/src/shared/layouts/RootLayout.tsx',
    'apps/web/public/locales/en/common.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T34 — Add the Warehouse switcher to the application shell

## Why

The switcher is how a member exercises US-02, and
[design-handoff.md §Responsive behavior](../design-handoff.md#responsive-behavior) calls it the
highest-priority control on the page. It is shell-level, not module-level, because every
Warehouse-scoped view depends on it.

## What

Add `WarehouseSwitcher.tsx` under `shared/layouts/`, reading
`shared/api/workspace-context-api.ts` ([T33](./workspace-context-api-and-gate.md)) and writing the
selection through its mutation. Render per the approved frames:

- Desktop (`n7Th5`) in the 80px header; mobile (`ciqhD`) in a full-width context bar directly beneath
  the 68px header — same component identity, same information, different placement.
- Popover (`XbWdw`): memberships listed, the current one carrying a **check** (not colour alone),
  archived entries listed but dimmed, non-selectable, `aria-disabled` with the reason, labelled
  `Archived · not selectable`.
- No Active Warehouse (`p2NiLo`): explicit empty state; nothing is chosen on the member's behalf when
  more than one membership exists (AC-03b).
- Selection ended (`pUVt0`): the member is told the Warehouse is no longer available to them, left
  with no selection, offered the switcher, and told their other access is unchanged.

It must render as a select with 12px radius — never a pill button
([design-handoff.md §Component mapping](../design-handoff.md#component-mapping)).

## Definition of Done

- [ ] Component tests cover: the member's memberships rendered with archived state; selecting one
      writing the selection and updating what is shown; the single-membership auto-selection and the
      multi-membership no-selection case (AC-03, AC-03b).
- [ ] A test proves a Warehouse the member holds no membership in is never offered, and a server
      denial leaves the current selection unchanged (AC-04).
- [ ] A test proves the effective selection re-derives on the next actor-context read after a
      membership is withdrawn or a Warehouse archived — the `pUVt0` state — with no client-side
      fallback logic guessing a replacement.
- [ ] Accessibility: labelled combobox whose accessible name includes the current Warehouse, archived
      options exposing `aria-disabled` **and** the reason, keyboard operable, visible focus ring.
- [ ] Responsive tests at 1440 and 390 place the switcher per the approved frames.
- [ ] Copy lives in `common.json` for `en` and `uk`.
- [ ] lint + build + web suite green.

## Notes

Selecting writes **presentation state only** — the switcher never influences an authorization
decision, and every Warehouse-scoped request names its Warehouse explicitly
([spec §6.1](../spec.md#61-security--privacy)). The per-Warehouse cache keying that makes a switch
refetch is owned by [T40](./migrate-warehouse-scoped-web.md).
