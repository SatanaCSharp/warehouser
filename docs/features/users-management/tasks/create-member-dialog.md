---
id: T18
title: 'Build the Create Member dialog'
layer: 'ui'
deps: ['T16']
acs: ['AC-01', 'AC-02', 'AC-03', 'AC-05', 'AC-16', 'AC-20']
files_hint:
  [
    'apps/web/src/modules/access/components/access-administration/CreateMemberDialog.tsx',
    'apps/web/src/modules/access/components/access-administration/AccessAdministration.tsx',
    'public/locales',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T18 — Build the Create Member dialog

## Why

[design-handoff.md](../design-handoff.md) §States and interactions specifies the Create Member
modal/sheet; [sad §5](../sad.md) places it in `access-administration/`, driven by
[T9](./create-member-command.md)'s `createMember` mutation from
[T16](./rtk-query-slice-and-mutation-hooks.md).

## What

Add `CreateMemberDialog.tsx` collecting email, initial password, and an existing custom Role,
submitted via the `createMember` mutation. Wire it into `AccessAdministration.tsx` behind the
`USERS:CREATE` capability check. Surface field-level validation (AC-02), duplicate-email (AC-05),
Permission-exceeded-Role (AC-16), and reserved-Role-selection (AC-20) errors per the design
handoff's field-error presentation. Add copy under the `access` locale namespace.

## Definition of Done

- [ ] Component test: successful submission shows the created member and closes the dialog (AC-01).
- [ ] Component test: invalid email/password field errors render inline and block submission
      (AC-02).
- [ ] Component test: duplicate-email response renders the duplicate-email message (AC-05).
- [ ] Component test: a Role-exceeds-Permissions response renders the cap explanation (AC-16).
- [ ] Component test: attempting to select the reserved Warehouse Manager Role is prevented at the
      Role picker, or its server denial renders the transfer-only explanation if selectable (AC-20).
- [ ] Component test: the "Create member" trigger is absent when the actor lacks `USERS:CREATE`
      (AC-03).
- [ ] lint + typecheck clean.

## Notes

Shares `AccessAdministration.tsx` with [T17](./members-list-and-tab-wiring.md) and
[T19](./credential-change-dialogs.md) — serialized by `files_hint` overlap.
