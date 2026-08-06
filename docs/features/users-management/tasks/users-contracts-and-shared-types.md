---
id: T7
title: 'Add users contracts and extend shared-types PermissionId/ErrorCode'
layer: 'ports'
deps: []
acs: []
files_hint:
  [
    'packages/contracts/src/users/',
    'packages/shared-types/src/enums/permission-id.ts',
    'packages/shared-types/src/enums/error-code.ts',
  ]
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T7 — Add users contracts and extend shared-types PermissionId/ErrorCode

## Why

[contracts/openapi.yaml](../contracts/openapi.yaml) defines the wire shapes for
`createMember`/`changeMemberEmail`/`changeMemberPassword`/`deleteMember`; `sad §5` requires strict
Zod schemas in `packages/contracts/users` matching it. `data-model.md §Non-schema follow-ups` flags
`PermissionId` as needing three new members, string-literal-identical to the migration's catalogue
IDs.

## What

Add `packages/contracts/src/users/` with Zod schemas for `CreateMemberInput`/`Member`,
`EmailChangeInput`/`MemberEmail`, `PasswordChangeInput`/`MemberConfirmation`, and the delete
response, reusing `packages/contracts/access`'s `permissionIdSchema`/role-name conventions where
shapes overlap (per `sad §5`). Add `USERS_EMAIL_UPDATE`, `USERS_PASSWORD_CHANGE`, `USERS_DELETE` to
`packages/shared-types/src/enums/permission-id.ts` — the string values must match
`USERS:EMAIL_UPDATE`, `USERS:PASSWORD_CHANGE`, `USERS:DELETE` exactly, byte-for-byte, against
[T1](./grant-permissions-existing-managers.md)'s migration. Add this feature's new stable error codes
to `error-code.ts`.

## Definition of Done

- [ ] Every schema round-trips the example payloads in `contracts/openapi.yaml`.
- [ ] `PermissionId` string values match the migration's catalogue IDs exactly (a mismatch would
      silently break every `@RequiredPermission` declaration downstream).
- [ ] lint + vet + typecheck clean across `packages/contracts` and `packages/shared-types`.

## Notes

Additive-only change — no existing schema or enum member is modified or removed, so this does not
require compile-coupled serialization with its consumers ([T8](./grant-permissions-future-managers.md)–[T13](./users-controller-and-module-wiring.md),
[T16](./rtk-query-slice-and-mutation-hooks.md)).
