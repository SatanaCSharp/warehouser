---
id: T5
title: 'Build LanguageSelector component'
layer: 'ui'
deps: ['T1']
acs: ['CR-AC-06', 'CR-AC-07']
source_refs: []
files_hint: ['apps/web/src/shared/layouts/LanguageSelector.tsx']
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T5 — Build LanguageSelector component

## Why

[spec §CR-AC-06/§CR-AC-07](../spec.md) and [sad §4](../sad.md) ("Language value flows through
i18next only") require a selector whose displayed value is always `i18n.resolvedLanguage` — never
independent state — and which calls `i18n.changeLanguage()` on selection.

## What

Create `shared/layouts/LanguageSelector.tsx` using HeroUI `Dropdown`/`Menu`. It lists exactly two
fixed native-name labels — "English" and "Українська" (literal strings, not translation keys,
identical regardless of active language) — and shows the currently resolved language (resolving a
region variant to its base language) as its displayed value. At or above `sm` it shows a globe icon

- label + chevron; below `sm` it collapses to an icon-only trigger with the value conveyed only via
  accessible name. It holds no local language state.

## Definition of Done

- [ ] Component unit test: displayed value tracks `i18n.resolvedLanguage`, including a region-variant input resolving to its base language
- [ ] Component unit test: selecting an option calls `i18n.changeLanguage()` with the chosen language
- [ ] Component unit test: renders icon+label+chevron at/above `sm`, icon-only with accessible name below `sm`
- [ ] lint + vet clean

## Notes

Does not touch `apps/web/src/i18n.ts` — consumes it read-only (out of scope per [sad §3](../sad.md)).
`source_refs` is empty: this is an ADD (CH-05), not an amendment of previously documented behavior.
