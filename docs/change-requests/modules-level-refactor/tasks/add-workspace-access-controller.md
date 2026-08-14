---
id: T11
title: 'Move the eleven workspace-access handlers onto access WorkspaceAccessController'
layer: 'ports'
deps: ['T9', 'T10']
acs: ['CR-AC-06', 'CR-AC-11', 'CR-RG-01', 'CR-RG-02']
files_hint:
  - 'apps/server/src/access/rest/controllers/workspace-access.controller.ts'
  - 'apps/server/src/access/rest/dtos/'
  - 'apps/server/src/access/rest/rest.module.ts'
  - 'apps/server/src/workspaces/rest/'
  - 'tests/access/authorization-coverage.spec.mjs'
source_refs: ['CH-S2', 'CH-S6']
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T11 — Move the eleven workspace-access handlers onto `access`'s `WorkspaceAccessController`

## Why

Eleven of `WorkspaceController`'s fourteen handlers serve roles, members, permissions, users and owner
transfer — Access, not the Workspace record ([CH-S2](../change.md#3-override-map)). Their use cases now
live in `access` (T9, T10), so leaving the handlers behind would make `workspaces` the transport for
another module's behavior and force a deep cross-module import.

## What

- Create `access/rest/controllers/workspace-access.controller.ts` declaring
  `@Controller('api/v1/workspace')` — **the same prefix `WorkspaceController` keeps**. NestJS supports
  this because no two handlers claim the same method+path
  ([sad §6.2](../sad.md#62-one-prefix-two-controllers-cr-ac-11-cr-rg-02)).
- Move the eleven handlers across with **identical** method, path, guard set,
  `@RequiredWorkspacePermission` metadata, DTO class and response shape. Every decorator moves with its
  handler carrying identical arguments.
- Move the role and member DTOs out of `workspaces/rest/dtos/workspace-mutation.dto.ts` into
  `access/rest/dtos/`, leaving the workspace half behind.
- Split `workspace.controller.spec.ts` and `workspace-http-contract.integration.spec.ts`: the
  workspace-access halves follow the handlers, the three retained handlers' cases stay in `workspaces`.
- Confirm `AccessRestModule` registers `WorkspaceAccessGuard` (added in T7) so Nest can construct it for
  these routes.
- Re-path `tests/access/authorization-coverage.spec.mjs`'s `INFRASTRUCTURE_EXEMPT` and
  `SELF_PROJECTION_READS` keys in this same commit — both still point at `workspaces/.../workspace.controller.ts`
  because `readContext` and `setActiveWarehouse` stay there.

## Definition of Done

- [ ] The route-table gate diff is **empty**, and `api/v1/workspace` is served by exactly two
      controllers with no path shadowed and none unreachable.
- [ ] Both split specs preserve their case union: **every per-handler delegation, outcome and payload
      assertion is unchanged**; only suite grouping and file location differ
      ([test-plan.md](../test-plan.md#mixed--a-named-subset-is-structural)).
- [ ] `tests/access/authorization-coverage.spec.mjs` passes with every rule intact and **no handler moved
      between covered and exempt** — the named structural risk in
      [sad §8](../sad.md#8-cross-cutting-concerns).
- [ ] `pnpm --filter @warehouser/server lint && test && build` green, plus the integration tier serially.
- [ ] `node --test 'tests/**/*.spec.mjs'` green.

## Notes

Shares the `authorization-coverage.spec.mjs` lane with T7 and T13. After this task the HTTP surface is
final: 21 handlers across four controllers in three modules — 3 stayed put, 4 changed module with their
controller, 14 changed module **and** controller class
([sad §7.2](../sad.md#72-http-interface)). No `@Controller` prefix changed anywhere; realigning URLs with
modules is a separate, genuinely breaking change request
([spec §3](../spec.md#3-non-goals)).
