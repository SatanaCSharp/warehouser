---
id: T16
title: 'Add users endpoints to the RTK Query API slice and mutation hook handlers'
layer: 'ui'
deps: ['T7']
acs: []
files_hint:
  [
    'apps/web/src/modules/access/api/access-api.ts',
    'apps/web/src/modules/access/hooks/useAccessAdministrationActions.ts',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T16 — Add users endpoints to the RTK Query API slice and mutation hook handlers

## Why

[sad §5](../sad.md) requires the four new `users` endpoints to be injected into the shared RTK Query
API slice alongside the existing `access` endpoints, and `useAccessAdministrationActions.ts` to gain
matching handlers following the existing success/field-error mapping pattern used for role
mutations.

## What

In `modules/access/api/access-api.ts`, add `createMember`/`changeMemberEmail`/
`changeMemberPassword`/`deleteMember` mutations typed against
[T7](./users-contracts-and-shared-types.md)'s contracts, with invalidation tags covering the member
list and current-access projection (mirroring how role mutations invalidate today). In
`useAccessAdministrationActions.ts`, add the four corresponding handlers.

## Definition of Done

- [ ] Unit tests confirm each mutation invalidates the member-list and current-access projection
      tags on success.
- [ ] Unit tests confirm each hook handler maps a field-level validation error the same way existing
      role-mutation handlers do.
- [ ] typecheck + lint clean.

## Notes

This task only adds the data layer — no UI renders yet. [T17](./members-list-and-tab-wiring.md),
[T18](./create-member-dialog.md), and [T19](./credential-change-dialogs.md) consume these hooks.
