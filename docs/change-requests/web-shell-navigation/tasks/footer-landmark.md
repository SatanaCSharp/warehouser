---
id: T4
title: 'Build Footer landmark component'
layer: 'ui'
deps: []
acs: ['CR-AC-01']
source_refs: ['change.md#CH-01']
files_hint: ['apps/web/src/shared/layouts/Footer.tsx']
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T4 — Build Footer landmark component

## Why

[spec §CR-AC-01](../spec.md) requires a footer as a full-width bar at the bottom of the viewport at
every breakpoint. [spec §8](../spec.md) leaves exact content an open question, defaulting to an
empty, non-interactive `<footer>` landmark as a conforming minimum.

## What

Create `shared/layouts/Footer.tsx` rendering a `<footer>` landmark, full-width, at the bottom of the
layout at every breakpoint. Ship the empty, non-interactive default per the open question's
resolution; no interactive control inside it.

## Definition of Done

- [ ] Component unit test asserts the `<footer>` landmark role renders
- [ ] Component unit test asserts it contains no focusable/interactive element
- [ ] lint + vet clean

## Notes

If Product Owner resolves [spec §8](../spec.md)'s open question with actual content before this
task starts, add it here as non-interactive text only — do not add a link or button, which would
turn this into a navigation surface outside this change's scope.
