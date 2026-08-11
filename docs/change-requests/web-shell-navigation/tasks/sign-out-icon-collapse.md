---
id: T12
title: 'Fix SignOutButton icon-only collapse below sm (review findings #11, #12)'
layer: 'ui'
deps: []
acs: []
source_refs: ['../_review/review-2026-08-07.md#Stage-2', '../spec.md#6']
files_hint:
  [
    'apps/web/src/modules/auth/sign-out/components/SignOutButton.tsx',
    'apps/web/src/modules/auth/sign-out/components/SignOutButton.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'XS'
status: 'todo'
---

# T12 — Fix SignOutButton icon-only collapse below sm

## Why

[Review findings #11, #12](../_review/review-2026-08-07.md): the "Sign out" label is hidden below
`sm` via `hidden sm:inline`, but the button never actually shrinks to icon-only sizing, leaving
slack against `spec.md` §6's NFR row and the approved mobile frame. No test pins the responsive
class contract.

## What

Make the button genuinely icon-only below `sm` (matching HeroUI's own `isIconOnly` sizing/padding
for its size, applied responsively), not just hide the text span.

## Definition of Done

- [ ] The button's below-`sm` classes match icon-only sizing (no reserved label width); a test
      asserts the responsive class contract
- [ ] lint + vet clean
