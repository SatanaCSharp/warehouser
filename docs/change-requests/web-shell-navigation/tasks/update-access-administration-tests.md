---
id: T8
title: 'Update AccessAdministration test selectors for the kebab menu'
layer: 'tests'
deps: ['T7']
acs: ['CR-RG-01', 'CR-RG-02']
source_refs: ['change.md#CH-03']
files_hint:
  [
    'apps/web/src/modules/access/components/access-administration/AccessAdministration.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T8 — Update AccessAdministration test selectors for the kebab menu

## Why

[sad §8 Testing impact](../sad.md) flags that `AccessAdministration.spec.tsx` may query row action
buttons directly and needs updated selectors once T7 replaces them with a kebab trigger, so the
existing regression coverage for CR-RG-01/CR-RG-02 keeps passing against the new UI.

## What

Update any assertion in `AccessAdministration.spec.tsx` that queries the old per-action icon
buttons to instead open the row's kebab trigger and select the corresponding menu item.

## Definition of Done

- [ ] `AccessAdministration.spec.tsx` passes against the T7 implementation
- [ ] Each action's existing dialog/handler/request assertion still fires exactly as before
- [ ] lint clean

## Notes

No behavioral change here — this is a test-selector-only follow-up to T7, not a new assertion
about product behavior.
