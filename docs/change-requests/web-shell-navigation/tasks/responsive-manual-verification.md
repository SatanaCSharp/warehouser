---
id: T9
title: 'Verify responsive fit and hit targets at 390px/640px/1440px'
layer: 'tests'
deps: ['T3', 'T5', 'T6', 'T7']
acs: []
source_refs: []
files_hint:
  [
    'apps/web/src/shared/layouts/',
    'apps/web/src/modules/access/components/access-administration/',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T9 — Verify responsive fit and hit targets at 390px/640px/1440px

## Why

[spec §6 NFR table](../spec.md) and [sad §10 Verification strategy](../sad.md) require manual
verification of layout fit and hit targets that automated component tests don't cover on their own
— header control fit, sidebar width, and kebab hit target across specific viewport widths.

## What

At 390px viewport width: confirm the header's full control set (drawer toggle, brand, language
selector, sign-out) fits without horizontal overflow or clipping; confirm the kebab trigger's hit
target is at least 32x32px; confirm the opened member-actions menu does not overflow the viewport;
confirm row height still respects the unchanged `min-h-[72px]` floor. At 640px and 1440px: confirm
the sidebar renders persistently at a fixed 240px width and the members-list content column is
unconstrained and non-wrapping.

## Definition of Done

- [ ] Each NFR-table row (Row action affordance width, Sidebar affordance width, Sidebar persistent width, Header control fit at 390px) is checked and recorded pass/fail
- [ ] Any failure is filed against the owning task (T3/T5/T6/T7) before this task is marked done

## Notes

This task produces no code diff — it verifies the composed output of T3, T5, T6, and T7 in a real
browser per the app's UI-change verification practice, not just green unit tests.
