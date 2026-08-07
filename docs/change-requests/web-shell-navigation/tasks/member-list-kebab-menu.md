---
id: T7
title: 'Replace MemberList row action buttons with a kebab trigger and menu'
layer: 'ui'
deps: ['T1']
acs: ['CR-AC-03', 'CR-AC-04', 'CR-AC-05', 'CR-AC-10', 'CR-RG-01', 'CR-RG-02']
source_refs: ['change.md#CH-03', 'change.md#CH-04']
files_hint:
  [
    'apps/web/src/modules/access/components/access-administration/MemberList.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T7 — Replace MemberList row action buttons with a kebab trigger and menu

## Why

[spec §CR-AC-03/§CR-AC-04/§CR-AC-05/§CR-AC-10](../spec.md) and [sad §6.2](../sad.md) require
collapsing the three separate per-row icon buttons into one kebab trigger + `Dropdown`/`Menu`, at
every viewport, without changing which capability gates which action or how protected/self rows
behave (CR-RG-01, CR-RG-02 — same handlers, same server enforcement).

## What

In `MemberList.tsx`, replace the three conditionally-rendered `Button`s with one trailing icon-only
HeroUI `Dropdown` trigger per eligible row, reusing the existing `canEditEmail`/`canResetPassword`/
`canDeleteMember` props and the existing `onEditEmail`/`onResetPassword`/`onDeleteMember` callbacks
unchanged. The trigger's accessible name identifies the member (e.g. "Actions for {email}"). The
menu lists only true-capability items as plain labels; Delete member keeps its danger treatment.
Escape or an outside click/tap closes the menu and returns focus to the trigger; Arrow Up/Down move
focus among items; selecting an item closes the menu and invokes the corresponding callback, which
opens the existing dialog unchanged. If a non-protected, non-self row has all three capabilities
false, render no trigger for it. Protected/self rows keep rendering only their `Chip` — no trigger.

## Definition of Done

- [ ] Component unit tests cover: trigger renders only when >=1 capability is true; menu lists exactly the true-capability items; no trigger for a non-protected/non-self row with all capabilities false
- [ ] Component unit tests cover: Escape and outside-click close the menu and return focus to the trigger; Arrow Up/Down move focus among items; Enter/Space on a focused trigger opens the menu
- [ ] Component unit test confirms protected and self rows render only their `Chip`, no trigger
- [ ] Component unit test confirms selecting a menu item still invokes the existing unchanged callback
- [ ] lint + vet clean

## Notes

Row markup outside the action affordance (identity stack, spacing, `min-h-[72px]` height floor) is
unchanged — do not touch it. This is the first use of HeroUI `Dropdown`/`Menu` in this codebase;
verify its Escape/outside-click/Arrow-key/focus-return behavior against these exact requirements
rather than trusting the library default matches ([sad §11](../sad.md)).
