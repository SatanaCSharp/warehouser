---
id: T36
title: 'Build the Warehouses tab: list, detail pane and lifecycle dialogs'
layer: 'ui'
deps: ['T35']
acs: ['AC-06', 'AC-08', 'AC-09', 'AC-11', 'AC-11a', 'AC-12a', 'AC-33']
files_hint:
  [
    'apps/web/src/modules/workspace/components/warehouses/',
    'apps/web/src/modules/workspace/api/workspace-warehouses-api.ts',
    'apps/web/public/locales/en/workspace.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T36 — Build the Warehouses tab: list, detail pane and lifecycle dialogs

## Why

The Workspace's ownership of the Warehouse lifecycle made visible: US-03, US-04, US-05 and the
`WAREHOUSES:WATCH` half of US-11. Frames `mY6Hb` (list), `NATgU`/`m6hDj` (detail pane), `ZfNnP` and
`QidCt` (dialogs), `N840R` and `yUU5P` (states) are the contract.

## What

- `workspace-warehouses-api.ts` — inject the Warehouse read, create, rename, archive and restore
  endpoints into the shared API slice, tagged so a mutation refreshes the list, the detail pane and
  the actor context (a new or archived Warehouse changes the switcher).
- List (340px on desktop) of the Workspace's Warehouses with archived state: selected = 2px accent
  stroke; archived = neutral chip plus meta text, never colour alone; in-operation uses
  `$success/soft`.
- Detail pane: name field with a dimmed, non-actionable Save while unchanged; the people list; the
  footer action pair.
- Dialogs: add a warehouse, rename, archive, restore — each naming what changes, what is preserved,
  and what the boundary refuses; Cancel precedes the primary in DOM and keyboard order; destructive
  primaries use solid `danger`; on mobile the primary becomes full-width and sits **above** Cancel.
- Collapse: below the split-view breakpoint the list becomes full-width cards and selecting one
  navigates to a full-width detail screen with a `chevron-left` "All warehouses" affordance.

## Definition of Done

- [ ] Tests cover the list rendering archived and in-operation states with a chip and meta text, and
      the loading skeleton announced as "Loading warehouses" (`j9Y6bX`).
- [ ] Tests cover add and rename: success toast stating the committed outcome, and an invalid name
      binding its error to the field and naming the rule that failed (AC-06, AC-08, AC-09).
- [ ] Tests cover archive and restore, including the archived read-only presentation (`N840R`):
      `Archived` chip, explanatory alert, mutating controls disabled with their reason exposed, and
      `Restore warehouse` still available because its subject is the Warehouse record (AC-11,
      AC-12a).
- [ ] Test covers the last-non-archived refusal (`yUU5P`): danger alert, archive action disabled, the
      constructive alternative offered (AC-11a).
- [ ] Test proves the detail pane renders **no** person's Warehouse Role and carries the level-boundary
      line (AC-33, `design-handoff.md` §"The level boundary is part of the design").
- [ ] Responsive tests at 1440 (split view, 24px gap) and 390 (stacked, back affordance).
- [ ] Accessibility: list semantics, labelled controls, dialogs trapping focus and returning it,
      Escape when dismissal is safe.
- [ ] lint + build + web suite green.

## Notes

Do **not** "improve" the detail pane by joining in Warehouse Role data — that would exceed the read
the actor holds and invite the level confusion AC-31 forbids. Grant and withdrawal live in
[T37](./warehouse-access-grant-withdraw.md), which shares this task's files and follows it in the
same lane.
