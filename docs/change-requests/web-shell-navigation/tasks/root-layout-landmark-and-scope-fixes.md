---
id: T13
title: 'Fix RootLayout nested landmark and flex-col scope (review findings #6, #7, #12)'
layer: 'ui'
deps: []
acs: ['CR-RG-03', 'CR-RG-04']
source_refs: ['../_review/review-2026-08-07.md#Stage-2']
files_hint:
  [
    'apps/web/src/shared/layouts/RootLayout.tsx',
    'apps/web/src/shared/layouts/RootLayout.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T13 — Fix RootLayout nested landmark and flex-col scope

## Why

[Review findings #6, #7](../_review/review-2026-08-07.md): the authenticated branch's `<main>`
wraps `<Outlet/>`, but `/access` pages already render their own `<main>`, producing nested `<main>`
landmarks; the outer wrapper's `flex flex-col` class was added to all three `RootLayout` branches
instead of only the authenticated one, reaching outside CR-RG-03/CR-RG-04's scope. Finding #12 also
wants the branch's `<sm`/`>=sm` responsive class contract pinned by a test.

## What

- Remove the nested `<main>` in the authenticated branch (the page content already provides its
  own), or otherwise ensure only one `<main>` landmark exists per authenticated page render.
- Move `flex flex-col` off the shared outer wrapper and apply it only within the authenticated
  branch, leaving the auth-route and chrome-less branches' markup exactly as before.

## Definition of Done

- [ ] No nested `<main>` landmarks render on an authenticated `/access` page
- [ ] `flex flex-col` no longer applies to the auth-route or chrome-less branches; a test (or an
      existing one extended) confirms their markup is unchanged
- [ ] A test asserts the authenticated branch's `<sm`/`>=sm` responsive class contract
- [ ] lint + vet clean
