---
id: T11
title: 'Wire the shell chrome to the entered context without changing anything else in it'
layer: 'ui'
deps: ['T9', 'T10']
acs: ['CR-AC-18', 'CR-RG-06']
source_refs: ['change.md#CH-06', 'change.md#CH-07']
files_hint:
  [
    'apps/web/src/shared/layouts/RootLayout.tsx',
    'apps/web/src/shared/layouts/RootLayout.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T11 — Wire the shell chrome to the entered context without changing anything else in it

## Why

[spec §CR-AC-18](../spec.md#5-acceptance-criteria) requires that with no navigation list the header
renders no drawer toggle — there is nothing for a drawer to contain — while
[§CR-RG-06](../spec.md#51-regression-boundaries) fixes every other chrome control as unchanged.
Derives from [sad §5 Modified](../sad.md#modified), [sad §8 Accessibility](../sad.md#accessibility)
and approved frames `Shell / No Context / Desktop / v1` (`cJkDD`) and `Mobile / v1` (`MOuOz`).

## What

`shared/layouts/RootLayout.tsx`:

- Render the narrow-viewport drawer toggle **only** when the sidebar has a list to show, so no
  context can open an empty drawer.
- Keep rendering the grouped switcher in the same two places as today — the header at/above `sm` and
  the full-width context bar below `sm`.
- Change nothing else. The brand link keeps targeting `ROUTES.HOME`, which now resolves through the
  landing rules (CR-AC-08) — that is a behavior change in `/`, not an edit here.

## Definition of Done

- [ ] Unit test: no drawer toggle in the no-context state and around a refusal
- [ ] Unit test: the drawer toggle is present in both entered contexts
- [ ] Unit test: the switcher renders in the header at/above `sm` and in the context bar below `sm`
- [ ] Regression test: brand link, language selector, sign-out control, footer, the 240px persistent
      sidebar container, the drawer's focus trap and focus return, and the auth-route and chrome-less
      branches all render and behave exactly as before
- [ ] lint + vet clean

## Notes

Only two things inside this chrome change across the whole change request, and both are stated
overrides (CR-RG-06): what the brand link resolves to, and what the sidebar lists. If this task finds
itself touching the header layout, the footer, the breakpoints or the drawer mechanics, it has gone
beyond its scope.
