---
id: T13
title: 'Add UsersController REST endpoints and wire the users module'
layer: 'ports'
deps: ['T7', 'T9', 'T10', 'T11', 'T12']
acs: ['AC-03', 'AC-09', 'AC-10']
files_hint:
  [
    'apps/server/src/users/rest/',
    'apps/server/src/users/users.module.ts',
    'apps/server/src/app.module.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T13 — Add UsersController REST endpoints and wire the users module

## Why

[contracts/openapi.yaml](../contracts/openapi.yaml) defines the four routes; [sad §5](../sad.md)
requires each to compose `SessionAuthGuard` + `WarehouseAccessGuard` exactly as `access`'s own
endpoints do, declaring one of the four Permissions via `@RequiredPermission`, and requires the
existing authorization-coverage architecture scan to cover `users` too.

## What

Add `users/rest/controllers/users.controller.ts` (`POST /api/v1/users`,
`PATCH /api/v1/users/{userId}/email`, `PATCH /api/v1/users/{userId}/password`,
`DELETE /api/v1/users/{userId}`) with thin Zod DTO adapters from
[T7](./users-contracts-and-shared-types.md)'s contracts and route-level `@RequiredPermission`
declarations (`USERS:CREATE`, `USERS:EMAIL_UPDATE`, `USERS:PASSWORD_CHANGE`, `USERS:DELETE`).
Controllers invoke commands only — no business rules. Add `users.module.ts` registering the
controller and the four commands, and register it in `app.module.ts` alongside `AccessRestModule`/
`AuthModule`. Extend the existing authorization-coverage architecture test's scan to include
`UsersController`.

## Definition of Done

- [ ] REST contract test: each endpoint validates the shared Zod schema and returns `400` on a
      malformed body.
- [ ] REST contract test: an actor missing the required Permission gets `403` without executing the
      command (AC-03 for create, AC-10 for the other three).
- [ ] REST contract test: a cross-Warehouse or missing target/Role returns the same denial shape
      without revealing existence (AC-09).
- [ ] Architecture test: `UsersController`'s every handler is Permission-gated and Warehouse-scoped
      (extends `access`'s existing scan) or explicitly documented as infrastructure-exempt.
- [ ] Architecture test: `users` imports no `access/*` or `auth/*` feature-owned file.
- [ ] `UsersModule` is registered in `AppModule`; the server boots.
- [ ] lint + vet clean.

## Notes

No new guard is introduced — `SessionAuthGuard`/`WarehouseAccessGuard` are reused exactly as-is
(`sad §2`). List/read access for the Members tab continues to use `access`'s existing
`GET /api/v1/access/members` endpoint — this task adds no read endpoint.
