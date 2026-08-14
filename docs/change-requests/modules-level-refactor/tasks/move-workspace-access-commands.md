---
id: T9
title: 'Move the seven workspace role, member and owner-transfer commands into access'
layer: 'app'
deps: ['T8']
acs: ['CR-AC-06', 'CR-AC-08', 'CR-RG-01', 'CR-RG-02']
files_hint:
  - 'apps/server/src/access/usecases/commands/'
  - 'apps/server/src/access/domain/errors/workspace-access.errors.ts'
  - 'apps/server/src/workspaces/usecases/commands/'
source_refs: ['CH-S2']
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T9 — Move the seven workspace role, member and owner-transfer commands into `access`

## Why

`src/access/` is warehouse-scoped exclusively while the workspace scope of the same capability is
implemented separately inside `src/workspaces/` ([CH-S2](../change.md#3-override-map)). Access is one
capability — roles, permissions, membership — exercised at two scopes, and
[CR-AC-06](../spec.md#cr-ac-06-cr-us-02-ch-s2-ch-s3-ch-s6--structure) makes `access` the single owner of
both, so a fix to role editing does not need applying twice.

## What

Move into `apps/server/src/access/usecases/commands/`, with their twelve specs:

- `create-workspace-role.command.ts`, `update-workspace-role.command.ts`,
  `delete-workspace-role.command.ts`, `assign-workspace-role.command.ts`
- `add-workspace-member.command.ts`, `remove-workspace-member.command.ts`
- `transfer-workspace-owner.command.ts`

Rewrite their error imports to T8's `access/domain/errors/workspace-access.errors.ts`, their
`withUnavailableOutcome` and `workspaceTargetUnavailableError` imports to `shared/errors/` (T5), and
register every command as a provider on `AccessUsecaseModule`. The scope stays in the symbol name
(`AssignWorkspaceRoleCommand` beside the warehouse-scoped equivalents), never in a second module.

## Definition of Done

- [ ] All seven commands and their twelve specs run from `access/usecases/commands/`, and
      `pnpm --filter @warehouser/server test` passes with **no assertion changed** but file locations and
      import specifiers.
- [ ] `AccessUsecaseModule` still imports **no feature module** — it remains the leaf of the graph
      ([CR-AC-09](../spec.md#cr-ac-09-cr-us-01-ch-s5--boundary)).
- [ ] No production file in `access` imports `workspaces`.
- [ ] Every Pino call moves with its use case keeping identical messages, fields and class context — no
      telemetry is added (repository policy).
- [ ] `pnpm --filter @warehouser/server lint && test && build` green, plus the integration tier serially
      against the disposable database.
- [ ] The route-table diff stays empty — handlers have not moved yet; T11 does that.

## Notes

**Compile-coupled lane with T8 and T10** through `workspace-access.errors.ts` — see
[T8's notes](./split-workspace-errors.md) for why the coupling is structural rather than incidental.
Every domain invariant these commands enforce must hold unchanged: one Workspace Owner per Workspace, one
Workspace Role per Workspace Member ([CR-RG-02](../spec.md#cr-rg-02--authorization-is-unchanged)). The
predicates that enforce them move in T10 — content unchanged, file only.
