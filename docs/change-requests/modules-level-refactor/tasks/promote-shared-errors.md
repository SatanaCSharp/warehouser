---
id: T5
title: 'Promote the three cross-destination error members to shared/errors/'
layer: 'domain'
deps: ['T1', 'T4']
acs: ['CR-AC-06', 'CR-AC-08', 'CR-RG-01', 'CR-RG-06']
files_hint:
  - 'apps/server/src/shared/errors/cross-module.errors.ts'
  - 'apps/server/src/shared/errors/unavailable-outcome.ts'
  - 'apps/server/src/workspaces/domain/errors/'
source_refs: ['CH-S2', 'CH-S4']
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T5 — Promote the three cross-destination error members to `shared/errors/`

## Why

`workspaces/domain/errors/` serves all three destination modules from one file. The split rule in
[CR-AC-06](../spec.md#cr-ac-06-cr-us-02-ch-s2-ch-s3-ch-s6--structure) sends a member reachable from two
or more destinations to `shared/errors/` rather than duplicating it or leaving it behind, and the second
clause sends a member whose named entity and only consumer resolve to different modules there too. Doing
this **first** is what lets every later server move stay green: without it, the first moved command
either deep-imports another module's error file or drags factories its siblings still need.

## What

Per the table in [sad §5.4](../sad.md#54-error-module-split-closes-changemd-6-step-2):

- Create `apps/server/src/shared/errors/cross-module.errors.ts` holding
  `workspaceTargetUnavailableError` (thrown from all three destinations, 13 call sites) and
  `workspaceWarehouseArchivedError` (names a **Warehouse** invariant but its only caller,
  `set-active-warehouse.command.ts`, stays in `workspaces` — the second clause's case).
- Move `withUnavailableOutcome` from `workspaces/domain/errors/unavailable-outcome.ts` to
  `apps/server/src/shared/errors/unavailable-outcome.ts`; it is imported by `create`/`archive`/
  `restore-warehouse` (→ `warehouses`) and by `transfer-workspace-owner`/`delete-workspace-role`
  (→ `access`).
- Rewrite every importer's specifier. Split the cases for these three members out of
  `workspaces/domain/errors/workspace.errors.spec.ts` into specs colocated with their new homes.
- Leave the other 14 factories where they are; T8 moves them with their consumers.

## Definition of Done

- [ ] Every existing call site of the three members resolves from `shared/errors/`, with **no error code
      and no exported symbol name changed** — `shared/errors/global-http-exception.filter.ts`'s mapping
      tables stay untouched.
- [ ] `pnpm --filter @warehouser/server lint && test && build` green.
- [ ] The moved spec cases assert the same codes and shapes as before; the only diffs are file locations
      and import specifiers, as [test-plan.md](../test-plan.md#behavioral--no-assertion-may-change)
      permits for this suite group.
- [ ] `git diff` over `shared/guards/`, `shared/access/`, `shared/decorators/` and
      `shared/domain/{security,entities,repositories}/` shows specifier-only changes (CR-RG-06).
- [ ] `node --test 'tests/**/*.spec.mjs'` green — no route changed, so T2's route-table diff stays empty.

## Notes

`shared/errors/` is the right home and not a dumping ground: these are exactly the members no single
feature module owns. Placing them anywhere else forces a deep cross-module import, which
[CR-AC-08](../spec.md#cr-ac-08-cr-us-01-ch-s1-ch-s2-ch-s5-ch-s6--boundary) and
[change.md §6](../change.md#6-rollout)'s abort threshold both forbid. The symbol names keep their
`workspace*` prefix on purpose — renaming 19 exported symbols across ~40 call sites would add a
rename-typo failure class to a diff whose whole claim is that nothing changed.
