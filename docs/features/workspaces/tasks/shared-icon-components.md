---
id: T32
title: 'Add the missing shared icon components'
layer: 'ui'
deps: []
acs: []
files_hint: ['apps/web/src/shared/icons/']
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T32 — Add the missing shared icon components

## Why

[design-handoff.md §Icons](../design-handoff.md#icons) lists 21 Lucide icons the approved frames use;
`apps/web/src/shared/icons/` exports 13. The handoff's open question — hand-roll or adopt
`lucide-react` — was resolved at `tasks` in favour of **hand-rolling**, following the existing file
pattern and adding no runtime dependency. Every workspace UI task needs these, so it starts on day
one.

## What

Add the missing icons as components under `apps/web/src/shared/icons/`, one file each, matching the
Lucide geometry and the existing `*Icon.tsx` shape (size and colour inherited from props and
`currentColor`, no hard-coded fill): `warehouse`, `building-2`, `archive`, `user-plus`, `pencil`,
`arrow-right-left`, `chevron-left`, `triangle-alert`, `info`, `shield`, `shield-x`, `circle-check`,
`x`, `layout-dashboard` — whichever of these `index.ts` does not already export. Export each from
`index.ts`.

## Definition of Done

- [ ] Every icon in `design-handoff.md` §Icons has a component exported from
      `apps/web/src/shared/icons/index.ts`.
- [ ] Each new component follows the existing file pattern exactly: same props contract, same
      `currentColor` and size handling, `aria-hidden` by default with a labelled escape hatch.
- [ ] A render test mounts every exported icon and asserts it produces an `svg` inheriting colour and
      size.
- [ ] No new dependency is added to `apps/web/package.json`.
- [ ] lint + build clean.

## Notes

The `warehouse` brand mark gap predates this feature — the approved Access v3 frames already render
one with no `shared/icons` component ([design-handoff.md](../design-handoff.md#icons)). Closing it
here is in scope; re-migrating the Access frames is not.
