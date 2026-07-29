---
id: T12
title: 'Implement the approved create-account experience'
layer: 'ui'
deps: ['T10', 'T11']
acs: ['AC-01', 'AC-01b', 'AC-02', 'AC-03']
dod: 'Accessible component and route tests prove the approved desktop/mobile sign-up flow, exact validation behavior, duplicate and unavailable outcomes, loading/focus behavior, authenticated navigation, and sign-up success feedback.'
files_hint:
  [
    'apps/web/src/modules/auth/sign-up',
    'apps/web/src/modules/auth/components',
    'apps/web/src/shared/layouts/RootLayout.tsx',
    'apps/web/src/shared/constants/routes.ts',
    'apps/web/src/router.ts',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T12 — Implement the approved create-account experience

## Why

The UI must implement approved frame `E9i5Ma` and its mobile/state companions from [design-handoff.md](../design-handoff.md), satisfying [spec AC-01–AC-03](../spec.md).

## What

Build the separate sign-up route, page, React Hook Form, and genuinely shared auth shell/field presentation. Reuse HeroUI `Input`, `Button`, `Card`, `CardHeader`, `CardBody`, `Link`, semantic tokens from `styles/hero.ts`, Lucide conventions, `ROUTES`, and the RootLayout extension.

## Definition of Done

- [ ] Accessible tests cover labels, password visibility name, first-invalid-field focus, exact password preservation, email corrections, loading text, and disabled submission.
- [ ] Page/route tests cover successful orchestration, duplicate email with sign-in route, rollback/unavailable feedback, Redux update, notification, and navigation.
- [ ] Desktop/mobile screenshots match approved nodes `E9i5Ma`, `WSRa3`, `iwzam`, and `NC8C7` for relevant states.
- [ ] Keyboard order, 44 px targets, responsive overflow, and WCAG AA intent are checked; web test, lint, and build pass.

## Notes

T12 and T13 overlap in shared auth components, RootLayout, routes, and router files, so `implement` must serialize them in one overlap lane.
