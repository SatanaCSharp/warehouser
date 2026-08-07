---
id: T1
title: 'Add shell/menu/selector locale keys and remove obsolete per-action keys'
layer: 'ui'
deps: []
acs: ['CR-AC-11']
source_refs: ['change.md#CH-05']
files_hint:
  [
    'apps/web/public/locales/en/common.json',
    'apps/web/public/locales/en/access.json',
    'apps/web/public/locales/uk/common.json',
    'apps/web/public/locales/uk/access.json',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T1 — Add shell/menu/selector locale keys and remove obsolete per-action keys

## Why

[spec §CR-AC-11](../spec.md) requires the new sidebar/kebab/selector strings to join the existing
`common`/`access` namespaces with full `en`/`uk` parity and no new namespace, and requires removing
the three now-obsolete interpolated per-action keys. [sad §7](../sad.md) confirms this is a
key-level-only change to the two existing namespace files per locale.

## What

Add keys for: the two sidebar nav labels ("Dashboard", "Access"), the kebab trigger's
accessible-name template (parameterized by email), the kebab menu's three plain-label items (Edit
email / Reset password / Delete member), the language selector's own accessible label (e.g.
"Change language"), and the icon-only drawer-toggle/sign-out accessible labels needed below `sm`.
Remove `members.editEmail`, `members.resetPassword`, `members.deleteMember` from all four files.
Touch only `apps/web/public/locales/{en,uk}/{common,access}.json` — no new namespace, no edit to
`apps/web/src/i18n.ts`.

## Definition of Done

- [ ] New keys exist in both `en` and `uk`, in the same namespace (`common` or `access`) on both sides, with identical key shape
- [ ] `members.editEmail` / `members.resetPassword` / `members.deleteMember` are absent from all four files
- [ ] A localization parity test asserts no orphaned or missing key across all 8 namespaces per locale
- [ ] lint clean

## Notes

Downstream tasks (T2, T5, T7) consume these keys, so this task has no upstream dependency but gates
three others. Follow the existing localization guide's key-naming convention rather than inventing
a new shape.
