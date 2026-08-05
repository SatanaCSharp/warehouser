---
id: T12
title: 'Build the approved access review workspace'
layer: 'ui'
deps: ['T9']
acs: ['AC-15', 'AC-20', 'AC-21', 'AC-22']
files_hint:
  [
    'apps/web/src/modules/access/api',
    'apps/web/src/modules/access/route.tsx',
    'apps/web/src/modules/access/page.tsx',
    'apps/web/src/modules/access/components/access-workspace',
    'apps/web/src/guards/access.guard.ts',
    'apps/web/src/router.ts',
    'apps/web/src/shared/constants/routes.ts',
    'apps/web/src/shared/layouts/RootLayout.tsx',
    'apps/web/public/locales/en/access.json',
    'apps/web/public/locales/uk/access.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T12 — Build the approved access review workspace

## Why

Approved nodes `W48Rk` and `G0Yvp` in [design-handoff.md](../design-handoff.md) define the responsive access workspace for the partial-authority flow in [sad.md §6.5](../sad.md).

## What

Inject current-access/read endpoints into the shared RTK Query API; add access route guard, route, page, responsive Roles/Members/Permissions views, shell navigation, and mirrored locales. Reuse `RootLayout`, HeroUI `Tabs`/`Card`/`Input`/`Button`, Lucide icons, semantic tokens, and existing normalized feedback.

## Definition of Done

- [ ] Route tests prove `ROLES:WATCH` and `USERS:WATCH` independently control tabs, requests, and retained data.
- [ ] Loading, empty, search-empty, selected, protected, and denied states render accessibly.
- [ ] Capability removal invalidates data and removes unavailable navigation without serving as the security boundary.
- [ ] Keyboard order, landmarks, tabs/tabpanels, focus visibility, text expansion, and 390px layout pass checks.
- [ ] Desktop/mobile renders match approved nodes `W48Rk`/`G0Yvp` with no unapproved visible deviation.
- [ ] Web tests, build, lint, and accessibility assertions pass.

## Notes

Do not fetch or retain a dataset the caller cannot read. New components are limited to access-specific workspace composition because existing HeroUI primitives cover the controls.
