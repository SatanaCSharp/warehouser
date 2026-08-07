---
id: T19
title: 'Build the Edit-email and Reset-password dialogs'
layer: 'ui'
deps: ['T16']
acs:
  [
    'AC-04',
    'AC-05',
    'AC-06',
    'AC-07',
    'AC-09',
    'AC-10',
    'AC-14',
    'AC-18',
    'AC-19',
  ]
files_hint:
  [
    'apps/web/src/modules/access/components/access-administration/EditEmailDialog.tsx',
    'apps/web/src/modules/access/components/access-administration/ResetPasswordDialog.tsx',
    'apps/web/src/modules/access/components/access-administration/AccessAdministration.tsx',
    'public/locales',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T19 — Build the Edit-email and Reset-password dialogs

## Why

[sad §5](../sad.md) has these dialogs "sharing the existing `RoleDialog`/`DeletionDialog` shell";
[design-handoff.md](../design-handoff.md) specifies their states and error presentation for the
email-update and password-change actions driven by [T10](./change-member-email-command.md)/
[T11](./change-member-password-command.md) via [T16](./rtk-query-slice-and-mutation-hooks.md)'s
mutations.

## What

Add `EditEmailDialog.tsx` and `ResetPasswordDialog.tsx`, reusing the existing `RoleDialog` shell for
layout/interaction consistency. Wire both into `AccessAdministration.tsx` behind their respective
`USERS:EMAIL_UPDATE`/`USERS:PASSWORD_CHANGE` capability checks per row. Surface validation
(AC-02/AC-07 rules), duplicate-email (AC-05, email dialog only), protected-Manager (AC-14), and
Permission-exceeded-target (AC-19) errors. Add copy under the `access` locale namespace.

## Definition of Done

- [ ] Component test: successful email change shows the updated email and leaves other state alone
      (AC-04).
- [ ] Component test: successful password reset shows confirmation (AC-06).
- [ ] Component test: invalid email format / password length renders inline field errors (AC-02/
      AC-07 rules).
- [ ] Component test: duplicate-email response renders on the email dialog only (AC-05).
- [ ] Component test: both dialogs are unreachable for the protected Warehouse Manager row and the
      actor's own row (AC-14/AC-18 — covered primarily by [T17](./members-list-and-tab-wiring.md)'s
      row-chip rendering; this task verifies the dialog itself also handles a stale-state server
      denial gracefully).
- [ ] Component test: a target-exceeds-actor's-Permissions server response renders the peer-
      protection explanation (AC-19).
- [ ] Component test: a stale/cross-Warehouse target server response (AC-09) renders the generic
      denial and closes the dialog.
- [ ] lint + typecheck clean.

## Notes

Shares `AccessAdministration.tsx` with [T17](./members-list-and-tab-wiring.md) and
[T18](./create-member-dialog.md) — serialized by `files_hint` overlap. The missing-Permission trigger
absence (AC-10) is [T17](./members-list-and-tab-wiring.md)'s concern (row-level action gating); this
task only handles the dialog's own server-response states.
