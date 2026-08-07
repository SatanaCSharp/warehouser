---
id: T3
title: 'Add Sidebar off-canvas drawer variant with focus trap and header toggle'
layer: 'ui'
deps: ['T2']
acs: ['CR-AC-09']
source_refs: ['change.md#CH-02']
files_hint: ['apps/web/src/shared/layouts/Sidebar.tsx']
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T3 — Add Sidebar off-canvas drawer variant with focus trap and header toggle

## Why

[spec §CR-AC-09](../spec.md) requires the sidebar to collapse to an off-canvas drawer below `sm`,
opened by a header-hosted toggle, with the same focus-trap/return discipline the app already holds
its dialogs to ([sad §8 Accessibility](../sad.md), matching `DeleteMemberDialog.tsx`'s convention).

## What

Extend `Sidebar.tsx` (from T2) so that below `sm` it renders only a toggle affordance; activating it
mounts an off-canvas drawer over a dimmed scrim containing the same nav items as the persistent
variant. The drawer traps focus while open, and closes via scrim tap, Escape, or selecting a nav
item, returning focus to the toggle control on close.

## Definition of Done

- [ ] Component unit tests cover opening the drawer and closing it via each of: scrim tap, Escape, and nav-item selection
- [ ] Focus is trapped inside the open drawer and returns to the toggle control on every close path
- [ ] Persistent (T2) rendering is unaffected at or above `sm`
- [ ] lint + vet clean

## Notes

Shares `Sidebar.tsx` with T2 (`files_hint` overlap) — `implement` serializes these into one lane;
this is intentional since they're the same building block per [sad §5](../sad.md), not two
components. This is the first use of an off-canvas drawer pattern for navigation in this codebase —
verify keyboard/focus behavior against CR-AC-09's exact wording rather than assuming a library
default matches (see [sad §11](../sad.md) risk row on HeroUI `Dropdown`/`Menu` defaults, same
caution applies here).
