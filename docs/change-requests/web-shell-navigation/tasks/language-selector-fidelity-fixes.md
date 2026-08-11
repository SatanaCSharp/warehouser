---
id: T11
title: 'Fix LanguageSelector label fidelity, checkmark, and icon-only collapse (review findings #3, #10, #11, #12)'
layer: 'ui'
deps: []
acs: ['CR-AC-06']
source_refs: ['../_review/review-2026-08-07.md#Stage-2']
files_hint:
  [
    'apps/web/src/shared/layouts/LanguageSelector.tsx',
    'apps/web/src/shared/layouts/LanguageSelector.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T11 — Fix LanguageSelector label fidelity, checkmark, and icon-only collapse

## Why

[Review findings #3, #10, #11, #12](../_review/review-2026-08-07.md): option labels render via
`t('language.english')`/`t('language.ukrainian')` — a translation-key lookup — when CR-AC-06
requires literal, fixed native-name strings so the invariant isn't tied to locale-file content; the
open menu omits the active-option checkmark specified by `design-handoff.md` frame `ZQ4vO`; the
trigger's text label is hidden below `sm` but the button never actually collapses to icon-only
sizing, leaving slack against the approved mobile frame; no test pins the responsive class
contract.

## What

- Replace `t(LANGUAGE_LABEL_KEYS[...])` menu-item labels with the literal strings `'English'` /
  `'Українська'` (still keep `i18n.resolvedLanguage`-driven `currentLabel` for the trigger's own
  display, which already reads correctly — only the option list must stop depending on translation
  keys).
- Add a checkmark (reuse the existing icon-component convention, e.g. a small inline `CheckIcon`)
  next to the active `DropdownItem`.
- Make the trigger genuinely icon-only below `sm` (matching HeroUI's own `isIconOnly` sizing/padding
  for its size, applied responsively), not just hide the text span.

## Definition of Done

- [ ] Option labels are literal native-name strings, not translation-key lookups
- [ ] A test confirms the active language's menu item is marked (e.g. via an accessible check
      indicator)
- [ ] The trigger's below-`sm` classes match icon-only sizing (no reserved label width); a test
      asserts the responsive class contract
- [ ] lint + vet clean
