---
id: T8
title: 'Move the fourteen access-shaped error factories into access and delete the workspaces error directory'
layer: 'domain'
deps: ['T7']
acs: ['CR-AC-06', 'CR-AC-07', 'CR-AC-08']
files_hint:
  - 'apps/server/src/access/domain/errors/workspace-access.errors.ts'
  - 'apps/server/src/access/domain/errors/workspace-access.errors.spec.ts'
  - 'apps/server/src/workspaces/domain/errors/'
source_refs: ['CH-S2']
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T8 — Move the fourteen access-shaped error factories into `access` and delete the `workspaces` error directory

## Why

`workspace.errors.ts` serves three subjects from one file, and the load-bearing assertion
`tests/access/authorization-coverage.spec.mjs:161` says `access` imports **nothing** from `workspaces`.
That assertion is what forces the split ([CH-S2](../change.md#3-override-map)): the fourteen
access-shaped factories must arrive in `access` in the same commit as the first consumer that needs them
from there, or the suite fails immediately.

## What

- Create `apps/server/src/access/domain/errors/workspace-access.errors.ts` with the fourteen factories
  [sad §5.4](../sad.md#54-error-module-split-closes-changemd-6-step-2) enumerates —
  `workspaceProtectedRoleError`, `workspaceSystemManagedPermissionError`,
  `workspaceRoleNameConflictError`, `workspaceReplacementRoleRequiredError`,
  `workspaceOwnerTransferRequiredError`, `workspaceSelfActionDeniedError`,
  `workspaceManagerTransferRequiredError`, `workspaceMembershipExistsError`,
  `workspaceRoleAssignmentRequiredError`, `workspaceMemberExistsError`,
  `workspaceWarehouseMembershipRequiredError`, `workspaceConcurrentChangeError`,
  `workspaceRoleDeletionUnavailableError`, `workspaceOwnerTransferUnavailableError` — under **unchanged
  error codes and unchanged symbol names**.
- Split `workspace.errors.spec.ts` its third and final way: its cases now live beside their subjects in
  `warehouses` (T6), `shared/errors/` (T5) and `access` (here). The union of cases must equal the
  original set.
- **Delete `apps/server/src/workspaces/domain/errors/` outright.** The split leaves it empty, and it is
  not kept as a re-export shim — a shim is exactly the deep import the rule exists to prevent
  ([CR-AC-07](../spec.md#cr-ac-07-cr-us-01-ch-s3-ch-s4-ch-s6--structure)).

## Definition of Done

- [ ] `workspace-access.errors.ts` holds the fourteen factories, each emitting its original code string,
      so `shared/errors/global-http-exception.filter.ts`'s mapping tables stay untouched.
- [ ] `apps/server/src/workspaces/domain/errors/` does not exist, and no file anywhere re-exports from a
      path under it.
- [ ] No **production** file in `access` imports `workspaces` — `authorization-coverage.spec.mjs:161`
      passes at its production-only scope, unchanged.
- [ ] The three-way split of `workspace.errors.spec.ts` loses no case: the union after equals the set
      before.
- [ ] `pnpm --filter @warehouser/server lint && test && build` green.

## Notes

**Compile-coupled lane with T9 and T10.** All three carry `workspace-access.errors.ts` in `files_hint`
because this task cannot be committed green alone: the factories' consumers are the seven commands T9
moves and the service T10 moves, and every intermediate arrangement violates a rule — a consumer left in
`workspaces` deep-imports `access/domain/errors` (CR-AC-08), and a consumer moved ahead of the factories
makes `access` import `workspaces`. `implement` serializes the three and may close them with one shared
gate and one commit carrying all three `SDD-Task` trailers. Do **not** resolve the coupling by parking
the factories in `shared/errors/` — only members reachable from two or more destinations belong there
(T5), and widening that set would hollow out the rule.
