---
id: T26
title: 'Re-shape the access REST surface to the named Warehouse'
layer: 'ports'
deps: ['T12', 'T13']
acs: ['AC-12', 'AC-12a', 'AC-36', 'AC-36a']
files_hint:
  [
    'apps/server/src/access/rest/',
    'apps/server/src/access/usecases/',
    'packages/contracts/src/access/',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T26 — Re-shape the access REST surface to the named Warehouse

## Why

Every `/api/v1/access/*` endpoint currently implies the actor's single Warehouse. Under AC-03a none
of them can survive, so all of them move under `/api/v1/warehouses/{warehouseId}/access/*` — a
deliberate breaking change with no consumer outside this repository
([sad §7](../sad.md#7-data-and-interface-impact), `api-sync-report.md` **F-2**).

## What

Re-path every `access` handler and re-scope `packages/contracts/src/access/` to match
[openapi.yaml](../contracts/openapi.yaml): `current`, `roles`, `roles/{roleId}`, `permissions`,
`members`, `members/{userId}/role`, `manager-transfer`. Each handler declares its
`@RequiredPermission(...)` **and** is classified read (archived-tolerant) or mutating for the
reworked guard.

`readWarehouseAccess` (`GET .../access/current`) is the membership-only **self-projection read**: it
declares no Warehouse Permission, because requiring one to read one's own capabilities would be
circular (`api-sync-report.md` **OQ-2**, classification added in
[T28](./archived-tolerance-adr.md)).

`transferWarehouseManager` is declared the **archived-tolerant mutation** that
[ADR 0003](../adr/0003-archived-tolerant-membership-edge-mutations.md) admits, on the grounds that
its subject is a membership edge — resolving `api-sync-report.md` **OQ-1** and keeping AC-11 true
without moving the handler under the Workspace guard, which US-13/AC-36 forbid by making the
Warehouse Manager the actor.

## Definition of Done

- [ ] REST contract tests cover every re-pathed operation: schema validation, success shape, and the
      stable error code and status of each documented failure branch.
- [ ] A test per **mutating** handler proves it is denied on an archived Warehouse, with the
      archived explanation, while the member's membership, Role and other memberships are unaffected
      (AC-12).
- [ ] A test per **read** handler proves it still serves an archived Warehouse and marks it archived
      (AC-12a).
- [ ] Tests prove the successful Manager transfer on both a live and an **archived** Warehouse leaves
      the recipient's membership carrying the Manager Role, the outgoing Manager's carrying the
      selected custom Role, exactly one Manager, and every other-Warehouse membership of either
      untouched (AC-36).
- [ ] Tests prove each AC-36a refusal — recipient not a member of that Warehouse, recipient is the
      outgoing Manager, no custom Role of that Warehouse selected — preserves exactly one Manager,
      and that a concurrent transfer maps to the stable concurrency error.
- [ ] A test proves a request to any of these paths without a `warehouseId` cannot reach a handler.
- [ ] The existing `access` suites are migrated and green.
- [ ] lint + vet clean.

## Notes

The contract re-scope is folded in here rather than emitted standalone: changing
`packages/contracts/src/access/` breaks its implementers at compile time, so it cannot be committed
green on its own. Do **not** widen archived tolerance beyond `manager-transfer` — every other
mutating handler must deny, and [T30](./two-level-authorization-coverage-check.md) fails the build
otherwise.
