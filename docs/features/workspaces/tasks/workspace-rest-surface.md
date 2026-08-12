---
id: T24
title: 'Add the Workspace-level REST controller and module wiring'
layer: 'ports'
deps: ['T6', 'T13', 'T15', 'T16', 'T17', 'T18', 'T19', 'T23']
acs: ['AC-30', 'AC-34']
files_hint:
  [
    'apps/server/src/workspaces/rest/',
    'apps/server/src/workspaces/usecases/usecase.module.ts',
    'apps/server/src/workspaces/index.ts',
    'apps/server/src/app.module.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T24 — Add the Workspace-level REST controller and module wiring

## Why

The HTTP surface for everything whose subject is the Workspace itself
([openapi.yaml](../contracts/openapi.yaml), `/api/v1/workspace/*`). Controllers stay thin per
[sad §5](../sad.md#5-building-blocks-and-ownership): they invoke commands and queries only and take
the principal from shared request infrastructure.

## What

Add `workspaces/rest/` with `createZodDto` adapters over `@warehouser/contracts/workspaces` and thin
controllers for: `context`, `active-warehouse`, `workspace` (rename), `roles` and
`roles/{workspaceRoleId}`, `permissions`, `members`, `members/{userId}`,
`members/{userId}/role`, `owner-transfer` and `users`. Each protected handler declares
`@RequiredWorkspacePermission(...)`; `context` is the self-projection read described in
[T23](./active-warehouse-selection.md); `active-warehouse` is the session-only-with-a-documented-
membership-check route [sad §8](../sad.md#8-cross-cutting-concerns) already names.

Wire `workspaces/usecases/usecase.module.ts` and `workspaces/index.ts`, and register the module in
`AppModule`.

## Definition of Done

- [ ] REST contract tests cover every `/api/v1/workspace/*` path and method in `openapi.yaml`:
      request schema validation, the success shape, and the stable error code and status of each
      documented failure branch.
- [ ] Tests prove a cross-Workspace target returns the same non-enumerating failure as a missing one
      on every route (AC-34).
- [ ] Tests prove a handler declaring a Warehouse Permission on this surface resolves nothing and
      denies, and that a User lacking the Permission is told access is not permitted (AC-30, AC-31).
- [ ] A test proves no controller contains business logic — each delegates to a command or query and
      returns its result.
- [ ] `AppModule` registers `WorkspacesModule`; the server boots and the existing suites stay green.
- [ ] lint + vet clean.

## Notes

Shares a lane with [T25](./warehouse-record-rest-surface.md): both register controllers under
`workspaces/rest/` and in the same use-case module, so `implement` serializes them. Workspace-scoped
routes carry **no** Workspace identifier — the guard derives it from the actor
([sad §7](../sad.md#7-data-and-interface-impact)).
