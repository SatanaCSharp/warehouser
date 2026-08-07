---
id: T15
title: 'Record SignOutButton.tsx traceability (review finding #4)'
layer: 'docs'
deps: []
acs: []
source_refs: ['../_review/review-2026-08-07.md#Stage-1']
files_hint:
  [
    'docs/change-requests/web-shell-navigation/change.md',
    'docs/change-requests/web-shell-navigation/sad.md',
  ]
owner: 'Frontend Lead'
estimate: 'XS'
status: 'todo'
---

# T15 — Record SignOutButton.tsx traceability

## Why

[Review finding #4](../_review/review-2026-08-07.md): `SignOutButton.tsx` was amended (icon-only
collapse below `sm`) as part of T6, but is absent from `change.md`'s `affected_sources` and
`sad.md` §3's in-scope list.

## What

Add `apps/web/src/modules/auth/sign-out/components/SignOutButton.tsx` to `change.md`
`affected_sources` and to `sad.md` §3's in-scope list, with a short note explaining why (required by
spec.md §6's NFR row on icon-only collapse, which `RootLayout.tsx` alone can't satisfy).

## Definition of Done

- [ ] `change.md` `affected_sources` lists `SignOutButton.tsx`
- [ ] `sad.md` §3 in-scope list lists `SignOutButton.tsx` with the same rationale
