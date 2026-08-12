---
id: T38
title: 'Build the Workspace roles and Permissions tabs'
layer: 'ui'
deps: ['T35']
acs: ['AC-14', 'AC-14a', 'AC-15', 'AC-16', 'AC-17', 'AC-17a', 'AC-18', 'AC-32']
files_hint:
  [
    'apps/web/src/modules/workspace/components/roles/',
    'apps/web/src/modules/workspace/api/workspace-roles-api.ts',
    'apps/web/public/locales/en/workspace.json',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T38 — Build the Workspace roles and Permissions tabs

## Why

US-06 and the `WORKSPACE_ROLES:WATCH` half of US-11. Frames `sDL1Q` (list) and `AmkoM` (editor) mirror
the shipped `RoleDirectory`/`RoleEditor` split one level up, so this is composition of existing
primitives rather than new interaction design
([design-handoff.md §Component mapping](../design-handoff.md#component-mapping)).

## What

- `workspace-roles-api.ts` — the Workspace Role list, the Permission catalogue, and create, update
  and delete-with-replacement, tagged so a mutation refreshes the Role list, the Members tab (a
  replacement moves people) and the actor context (the actor may have changed their own capability).
- **Workspace roles tab**: the list/editor split with the approved footer button order — soft-danger
  delete on the left, Cancel then primary on the right. The protected Owner Role offers no rename,
  no delete and no permission edit, and shows why (AC-16).
- Permission rows (`woPxV`): checked = `accent/soft` row, unchecked = `surface/secondary`; the
  reserved row is disabled, muted, carries an `Owner only` chip and exposes both the disabled state
  and the reason (AC-18).
- Delete: prompts for a replacement **only** when the Role is assigned; deleting an unassigned Role
  takes no replacement (AC-17, AC-17a).
- **Permissions tab**: the read-only catalogue with its assignable/reserved classification (AC-32).

## Definition of Done

- [ ] Tests cover create with zero and with several Permissions, and update including changing the
      Permission set to empty and renaming (AC-14, AC-14a).
- [ ] Test covers the exact-name conflict error stating that differently cased names are distinct
      (AC-15, `ONjLw`).
- [ ] Tests prove the protected Owner Role exposes no rename, delete or permission control, with the
      reason shown rather than the control silently missing (AC-16).
- [ ] Tests prove the reserved Permission row is disabled with its reason and cannot be submitted
      (AC-18).
- [ ] Tests cover delete-with-replacement for an assigned Role and delete-without-replacement for an
      unassigned one, each stating what changes and what is preserved (AC-17, AC-17a).
- [ ] Test proves neither tab requests its dataset without `WORKSPACE_ROLES:WATCH` (AC-32).
- [ ] Accessibility: labelled checkboxes, field-bound validation errors, form-level outcomes
      announced through a live region, focus moving to the first invalid field or the dialog heading.
- [ ] lint + build + web suite green.

## Notes

Do not duplicate the server's validation rules client-side — the field's description and error slots
are the contract, and the server stays authoritative
([design-handoff.md §Component mapping](../design-handoff.md#component-mapping)). Shares the
`workspace.json` lane with [T35](./workspace-route-shell.md), [T36](./warehouses-tab.md),
[T37](./warehouse-access-grant-withdraw.md) and [T39](./workspace-members-tab.md).
