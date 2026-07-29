---
id: T13
title: 'Implement the approved sign-in and sign-out experience'
layer: 'ui'
deps: ['T10', 'T11']
acs: ['AC-04', 'AC-05', 'AC-07', 'AC-08', 'AC-09']
dod: 'Accessible component and route tests prove the approved desktop/mobile sign-in states, indistinguishable credential failures, expired-session focus, no sign-in success toast, and sign-out revocation before feedback and navigation.'
files_hint:
  [
    'apps/web/src/modules/auth/sign-in',
    'apps/web/src/modules/auth/sign-out',
    'apps/web/src/modules/auth/components',
    'apps/web/src/shared/layouts/RootLayout.tsx',
    'apps/web/src/shared/constants/routes.ts',
    'apps/web/src/router.ts',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T13 — Implement the approved sign-in and sign-out experience

## Why

The sign-in surface uses approved frame `lYkRJ` and its mobile/state companions in [design-handoff.md](../design-handoff.md), while sign-out follows [sad.md §6.4](../sad.md).

## What

Replace the mock login module with the distinct sign-in route/page/form, reuse the auth shell/fields from T12, and connect sign-out from the authenticated shell. Preserve the generic credential explanation and approved feedback timing.

## Definition of Done

- [ ] Accessible form tests cover exact password preservation, labels, password visibility, loading, focus, and the same generic message for unknown email and wrong password.
- [ ] Route tests prove successful sign-in updates Redux/navigates without a success toast and expired/revoked redirects focus the explanation or heading.
- [ ] Sign-out tests prove server revocation completes before anonymous state, success feedback, and Visitor navigation.
- [ ] Desktop/mobile screenshots match approved nodes `lYkRJ`, `ZlykT`, `iwzam`, and `NC8C7`; web test, lint, and build pass.

## Notes

This shares an overlap lane with T12 through the listed shared files; reuse existing HeroUI and semantic tokens only.
