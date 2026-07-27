---
id: T11
title: 'Replace mock auth state with session bootstrap and guards'
layer: 'wiring'
deps: ['T9', 'T10']
acs: ['AC-07', 'AC-08', 'AC-09', 'AC-10', 'AC-11']
dod: 'Redux, bootstrap, and router tests prove unknown/anonymous/authenticated states, one coalesced restoration request, guard decisions only after initialization, sign-out state clearing, and separation from capability authorization.'
files_hint:
  [
    'apps/web/src/store/slices/authSlice.ts',
    'apps/web/src/store/index.ts',
    'apps/web/src/guards',
    'apps/web/src/router.ts',
    'apps/web/src/App.tsx',
    'apps/web/src/modules/auth/session',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T11 — Replace mock auth state with session bootstrap and guards

## Why

Session restoration must resolve before navigation as specified by [sad.md §6.3](../sad.md), and Redux remains the single cross-route state owner.

## What

Replace token state with the tri-state status and safe User, implement one coalesced bootstrap operation, and make anonymous/auth guards await initialization before selector-based navigation decisions.

## Definition of Done

- [ ] Slice tests prove `unknown`, `anonymous`, and `authenticated` transitions with no reusable credential field.
- [ ] Bootstrap tests prove concurrent callers share one request and valid/invalid Sessions resolve to the correct state.
- [ ] Router tests prove protected and anonymous-only decisions wait for bootstrap and use named selectors.
- [ ] Sign-out tests clear browser state only after completion; web test, lint, and build pass.

## Notes

Capability authorization remains in its owning feature; this task changes authentication guards only.
