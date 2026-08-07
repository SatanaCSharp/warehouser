---
id: T17
title: 'Build the Members list and wire the Members tab, including delete'
layer: 'ui'
deps: ['T16', 'T14']
acs: ['AC-08', 'AC-09', 'AC-10', 'AC-11', 'AC-13', 'AC-14', 'AC-18']
files_hint:
  [
    'apps/web/src/modules/access/components/access-administration/MemberList.tsx',
    'apps/web/src/modules/access/components/access-administration/MemberRow.tsx',
    'apps/web/src/modules/access/components/access-administration/AccessAdministration.tsx',
    'apps/web/src/modules/access/components/access-workspace/AccessWorkspace.tsx',
    'public/locales',
  ]
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T17 — Build the Members list and wire the Members tab, including delete

## Why

[design-handoff.md](../design-handoff.md) approved frame `Users / Administration / Desktop / v1`
(node `e4e0H`) replaces the placeholder `MemberRoleActions` with a full Members workspace. `sad
§6.5` specifies the listing/gating flow: actions render only for Permissions the actor holds, and
the protected Warehouse Manager row and the actor's own row render a status chip instead of action
controls.

## What

Add `MemberList.tsx`/`MemberRow.tsx` under `access-administration/`, per the design handoff's
`HeroUI Card / Member Row` (`72px`, `68px` mobile) component mapping — avatar-initials circle, email,
role text as content; row structure/spacing/height must remain equivalent to the approved frame.
Replace `MemberRoleActions.tsx` in `AccessAdministration.tsx` and swap the "members" `Tab` in
`AccessWorkspace.tsx` from the read-only `MembersDatasetCard` to this new workspace (mirroring how
the "roles" tab already swaps in `AccessAdministration`), gated by `USERS:WATCH`. Wire the delete
action using the existing `DeletionDialog` shell. Add Members-workspace copy under the existing
`access` locale namespace.

## Definition of Done

- [ ] Component test: loading, empty, and populated list states render per the design handoff.
- [ ] Component test: the protected Warehouse Manager row and the actor's own row render a status
      chip in place of action controls (AC-13/AC-14/AC-18).
- [ ] Component test: per-row and "Create member" actions are enabled only for Permissions the actor
      currently holds; a denied action is hidden, not disabled-with-no-explanation (AC-03/AC-10
      surfaced as hidden controls).
- [ ] Component test: triggering delete opens the existing `DeletionDialog` shell, confirms, and on
      success the target row disappears and the list/current-access projection refetch (AC-08,
      AC-11 self-row has no delete control, AC-09 target that vanished mid-session refetches away).
- [ ] Accessibility: icon-only actions are labeled using the member's email (per
      [T14](./access-member-list-email-join.md)'s new field), per design-handoff §Accessibility.
- [ ] lint + typecheck clean.

## Notes

Shares `AccessAdministration.tsx` with [T18](./create-member-dialog.md) and
[T19](./credential-change-dialogs.md) — `files_hint` overlap serializes these three UI tasks into one
lane.
