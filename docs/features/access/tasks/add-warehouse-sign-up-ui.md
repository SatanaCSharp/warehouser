---
id: T11
title: 'Add Warehouse registration to the approved sign-up UI'
layer: 'ui'
deps: ['T4']
acs: ['AC-01', 'AC-02', 'AC-02a']
files_hint:
  [
    'apps/web/src/modules/auth/sign-up',
    'apps/web/src/modules/auth/api/auth-api.ts',
    'apps/web/public/locales/en/sign-up.json',
    'apps/web/public/locales/uk/sign-up.json',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T11 — Add Warehouse registration to the approved sign-up UI

## Why

The approved registration frames `f4Icg` and `jtBOB` in [design-handoff.md](../design-handoff.md) realize [spec AC-01–AC-02a](../spec.md).

## What

Extend the existing sign-up form and API with the shared `warehouseName` contract. Reuse `RootLayout`, HeroUI `Input`/`Button`, `src/styles/hero.ts` tokens, existing feedback adapters, and mirrored English/Ukrainian sign-up resources.

## Definition of Done

- [ ] Component tests cover desktop/mobile field placement, valid submission, loading, and immediate-access success.
- [ ] Accessible inline validation covers empty, grapheme-length, and control/format failures and focuses the first invalid field.
- [ ] Atomic failure copy never implies a partial Account or Warehouse exists.
- [ ] The desktop/mobile render matches approved nodes `f4Icg`/`jtBOB` with no unapproved visible deviation.
- [ ] Web tests, build, lint, and accessibility assertions pass.

## Notes

Client feedback is advisory; the server remains authoritative. Do not create a parallel form or styling system.
