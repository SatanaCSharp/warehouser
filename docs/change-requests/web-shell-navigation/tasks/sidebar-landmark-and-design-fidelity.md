---
id: T14
title: 'Fix Sidebar drawer landmark and restore design-approved icons/active tint (review findings #8, #9, #12)'
layer: 'ui'
deps: []
acs: ['CR-AC-09']
source_refs: ['../_review/review-2026-08-07.md#Stage-2']
files_hint:
  [
    'apps/web/src/shared/layouts/Sidebar.tsx',
    'apps/web/src/shared/layouts/Sidebar.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T14 — Fix Sidebar drawer landmark and restore design-approved icons/active tint

## Why

[Review findings #8, #9](../_review/review-2026-08-07.md): the drawer variant of the sidebar has no
`<nav>` landmark (the persistent variant does); the sidebar dropped the icons and active-item tint
approved in `design-handoff.md` frames `tCIFz`/`jUVaK` without recording it as an approved
deviation. Finding #12 also wants the persistent/drawer `sm` responsive class contract pinned by a
test.

## What

- Wrap the drawer's `navList(...)` output in a `<nav aria-label={t('nav.label')}>` landmark, same as
  the persistent variant.
- Restore per-item icons (Dashboard/Access) and the active-item `#E6E5FB` tint (the same swatch
  already used for the "Protected" chip; `primary-100` in `src/styles/hero.ts`), matching frames
  `tCIFz`/`jUVaK`.

## Definition of Done

- [ ] The drawer's nav list is inside a `<nav>` landmark
- [ ] Nav items render an icon and the active item (matching the current route) gets the approved
      tint; a test covers the active-item state
- [ ] A test asserts the persistent (`sm:block`) / drawer (`hidden` below `sm`) responsive class
      contract
- [ ] lint + vet clean
