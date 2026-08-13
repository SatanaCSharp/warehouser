---
id: T1
title: 'Add the new context-switcher/refusal/no-context locale keys and the two new icons'
layer: 'ui'
deps: []
acs: ['CR-AC-03', 'CR-AC-07', 'CR-AC-14', 'CR-AC-17', 'CR-AC-18']
source_refs: ['change.md#CH-01', 'change.md#CH-08']
files_hint:
  [
    'apps/web/public/locales/en/common.json',
    'apps/web/public/locales/uk/common.json',
    'apps/web/public/locales/en/workspace.json',
    'apps/web/public/locales/uk/workspace.json',
    'apps/web/src/shared/icons/LogInIcon.tsx',
    'apps/web/src/shared/icons/LayoutGridIcon.tsx',
    'apps/web/src/shared/icons/index.ts',
    'apps/web/src/shared/icons/icons.spec.tsx',
    'apps/web/src/i18n.spec.ts',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T1 — Add the new context-switcher/refusal/no-context locale keys and the two new icons

## Why

Every surface this change request builds is copy-bearing and icon-bearing, so the strings and icons
land first and nothing downstream invents its own. Derives from
[spec §6 "Locale completeness"](../spec.md#6-non-functional-requirements),
[sad §8 Internationalization](../sad.md#internationalization) and
[design-handoff § Icons](../design-handoff.md#icons).

## What

Add to the **existing** `common` and `workspace` namespaces in **both** `en` and `uk` — no new
namespace, and `i18n.ts` is not modified:

- `common` — the grouped-switcher trigger's accessible name that survives every context
  (design-handoff § Accessibility), the Workspace row label and the unnamed-Workspace placeholder
  (CR-AC-01), the two group labels, the `Current` / `Archived` / `No access` trailing labels, the
  inert Workspace row's one-line explanation (CR-AC-03), the non-disclosing refusal and the archived
  refusal (CR-AC-07, CR-AC-17), the no-context state (CR-AC-18), and the landing pending and error
  states (CR-AC-08).
- `workspace` — the Enter action label (CR-AC-14).

Leave the three retained `workspaceSwitcher.*` messages (`empty`, `selectionEnded`, `unavailable`)
exactly as they are: CR-RG-03 keeps their copy and intent, only their placement changes.

Add `LogInIcon` (Lucide `log-in`) and `LayoutGridIcon` (Lucide `layout-grid`) under
`shared/icons/`, following the existing wrapper pattern, and export both from `shared/icons/index.ts`.

## Definition of Done

- [ ] Every key above exists in all four locale files with matching key shape
- [ ] The three retained `workspaceSwitcher.*` messages are byte-identical to today in all four files
- [ ] No new namespace is added and `i18n.ts` is unchanged
- [ ] The localization parity test asserts identical key sets across `en` and `uk` for all 8 namespaces
- [ ] `icons.spec.tsx` covers both new icons
- [ ] lint + vet clean

## Notes

Exact key names are an implementation choice; what is fixed is the namespace (`common` /
`workspace`) and `en`/`uk` parity. The refusal copy itself is constrained by CR-AC-07 — it must name
nothing about the Warehouse, not even indirectly — and by CR-AC-17, which names the archived state
and nothing further. Write it once here so T2 cannot drift.
