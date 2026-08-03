---
id: T13
title: 'Build approved access administration workflows'
layer: 'ui'
deps: ['T10', 'T12']
acs:
  [
    'AC-03',
    'AC-04',
    'AC-05',
    'AC-06',
    'AC-06a',
    'AC-06b',
    'AC-07',
    'AC-08',
    'AC-09',
    'AC-09a',
    'AC-11',
    'AC-12',
    'AC-12a',
    'AC-13',
    'AC-14',
    'AC-14a',
    'AC-15',
    'AC-19',
  ]
files_hint:
  [
    'apps/web/src/modules/access/api',
    'apps/web/src/modules/access/components/role-editor',
    'apps/web/src/modules/access/components/member-assignment',
    'apps/web/src/modules/access/components/role-deletion',
    'apps/web/src/modules/access/components/manager-transfer',
    'apps/web/public/locales/en/access.json',
    'apps/web/public/locales/uk/access.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T13 — Build approved access administration workflows

## Why

The interaction hierarchy and approved frames in [design-handoff.md](../design-handoff.md) cover the lifecycle actions in [spec AC-03–AC-19](../spec.md).

## What

Add Role create/editor, Permission selection, member assignment, deletion/replacement, and manager-transfer workflows to the approved workspace. Reuse HeroUI `Modal`, `Checkbox`, `Chip`, `Card`, `Input`, and `Button`, access RTK Query invalidation, semantic tokens, and centralized feedback/locales.

## Definition of Done

- [ ] Role tests cover validation, exact-name conflicts, empty grants, reserved disabled reasons, protected presentation, and capability-based controls.
- [ ] Assignment tests omit manager choices and prevent ordinary current-manager reassignment.
- [ ] Deletion tests distinguish unassigned confirmation from assigned replacement and announce atomic success/failure.
- [ ] Transfer tests offer only valid recipients/replacements and identify both affected members.
- [ ] Race denial refreshes current capabilities, removes stale controls, and announces the safe failure.
- [ ] Modal focus trap/return, Escape behavior, live regions, reduced motion, responsive full-width/mobile treatment, web tests, build, and lint pass.

## Notes

Use approved nodes `W48Rk`/`G0Yvp` and their interaction system. Any visible deviation requires new design approval.
