---
id: T30
title: 'Extend the authorization-coverage architecture check to two levels'
layer: 'tests'
deps: ['T24', 'T25', 'T26', 'T27', 'T28']
acs: ['AC-30', 'AC-31']
files_hint: ['apps/server/src/test/authorization-coverage.spec.ts']
owner: 'Backend Lead + Security Lead'
estimate: 'M'
status: 'todo'
---

# T30 — Extend the authorization-coverage architecture check to two levels

## Why

[spec §6](../spec.md#6-non-functional-requirements) requires 100% of user-accessible Workspace
capabilities to have an explicit Permission rule and ownership check, measured by automated
architecture checks. [sad §8](../sad.md#8-cross-cutting-concerns) makes this a **release gate**: a
handler that forgets its `warehouseId`, declares the wrong level's Permission, or declares archived
tolerance while mutating is exactly the failure mode this catches before a human would.

## What

Add `apps/server/src/test/authorization-coverage.spec.ts` scanning every registered handler and
failing unless each user-accessible handler outside authentication is **exactly one** of:

1. Workspace-Permission-declaring (`@RequiredWorkspacePermission` + `WorkspaceAccessGuard`);
2. Warehouse-Permission-declaring (`@RequiredPermission` + `WarehouseAccessGuard`) **and** carrying a
   `warehouseId` route parameter;
3. a **self-projection read** — membership-scoped, declaring no Permission — limited to the list in
   [T28](./archived-tolerance-adr.md)'s §8 amendment;
4. explicitly listed infrastructure-exempt with a written reason.

Warehouse-scoped handlers must additionally be classified `read` (archived-tolerant) or `mutating`,
and an archived-tolerant **mutation** fails unless it is on ADR 0003's membership-edge list.

Add the structural assertions in the same scan: `workspaces/domain` has no NestJS, HTTP or TypeORM
import; `access` imports nothing from `workspaces`; controllers invoke commands and queries only.

## Definition of Done

- [ ] The check passes over the current handler set and its exemption list is non-empty and
      justified.
- [ ] Negative tests (fixtures, not production handlers) prove the check **fails** for: an
      unclassified handler; a Warehouse-scoped handler with no `warehouseId`; a handler declaring a
      Workspace Permission with the Warehouse guard and vice versa; a mutating handler declaring
      archived tolerance off the ADR 0003 list.
- [ ] A negative test proves the check fails when `workspaces/domain` gains a framework import and
      when `access` imports `workspaces`.
- [ ] The check runs as part of the server test gate, not as an opt-in script.
- [ ] lint + vet clean.

## Notes

[sad §8](../sad.md#8-cross-cutting-concerns) is explicit that metadata coverage alone is **not**
sufficient evidence — the per-AC unit and integration tests in T14–T27 still prove each concrete
ownership rule. This check proves nothing was forgotten, not that anything is correct.
