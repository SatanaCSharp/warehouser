---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Backend Lead', 'Frontend Lead']
updated_at: '2026-08-11'
feature_size: 'L'
ticket: ''
---

# 0001 — Two-level request authorization with an explicitly named Warehouse

## Context

Today one guard implements the whole authorization boundary.
`apps/server/src/shared/guards/warehouse-access.guard.ts` reads the Permission declared by
`@RequiredPermission`, calls `AccessCurrentUserRepository.resolveAnyRequiredPermission(userId, ...)`,
and attaches an `AccessCurrentUser`. That works only because the approved Access model gives a User
exactly one Warehouse membership: the repository resolves it with `findOneBy({ userId })`, and no
request anywhere names a Warehouse.

This feature breaks both premises at once. A member may now hold a membership in several Warehouses of
their Workspace (`spec.md` AC-03, AC-05), and a second authority level appears above the Warehouse with
its own Roles, its own Permission catalogue and its own membership (`spec.md` AC-30, AC-31). The
specification is explicit about what must not happen: a request that does not unambiguously name exactly
one Warehouse is refused rather than resolved to the actor's selection or any other default (AC-03a),
authority is always that of the membership held in the Warehouse being acted on (AC-05), and a Workspace
Permission never authorizes an operation inside a Warehouse while a Warehouse Permission never authorizes
a Workspace capability (AC-31).

The decision is how the request pipeline expresses those two levels. It reaches every user-accessible
handler in `access`, `users` and the new `workspaces` module, every Warehouse-scoped path in
`packages/contracts`, and every call the web makes; it is the mechanism the `spec.md` §6.1 abuse cases
"Level confusion", "Warehouse confusion" and "Stale selection" are defended by; and reversing it after
stock, Locations and movement history attach to the Warehouse boundary would mean re-cutting the
authorization contract of the whole application. It therefore passes the feature ADR blast-radius gate.

## Decision drivers

- AC-03a must be structurally impossible to violate, not a check each command could forget.
- AC-31 level confusion must fail as early and as loudly as possible — ideally before the code runs.
- The Warehouse authorization stage must stay within 50 ms at p95 and must not grow with the number of
  Warehouses a member belongs to (`spec.md` §6).
- Archiving withdraws Warehouse Capabilities while leaving reads (AC-12a) and the Workspace Capabilities
  over that Warehouse record (AC-11) available, so archived state cannot be a blanket guard denial.
- The selected Warehouse is presentation state and must never be an authorization input
  (`spec.md` §6.1 "Warehouse confusion", "Stale selection").
- Guards are shared transport infrastructure under `shared/guards/` and must not decide target-resource
  ownership ([server architecture](../../../system/server-architecture.md)).
- The existing `access` guard, `@RequiredPermission` decorator and `AccessCurrentUser` principal are
  approved, working infrastructure with tests; a change here should extend that shape rather than
  replace it.

## Considered options

1. **Two sibling guards, two metadata keys, two vocabularies, Warehouse in the route path.**
   `WorkspaceAccessGuard` + `@RequiredWorkspacePermission` + `WorkspaceCurrentUser` for the Workspace
   level; the reworked `WarehouseAccessGuard` + existing `@RequiredPermission` + `AccessCurrentUser` for
   the Warehouse level, resolving the membership for the (User, Warehouse) pair taken from the route's
   `warehouseId` parameter. `PermissionId` and `WorkspacePermissionId` stay separate types.
2. **One generalized scoped guard parameterized by declared scope.** A single
   `ScopedAccessGuard` reads metadata of the form `{ scope: 'workspace' | 'warehouse', permissions }`,
   branches to the matching resolver, and attaches a discriminated-union principal.
3. **One guard resolving both levels on every protected request.** Every request gets both a Workspace
   projection and, when a Warehouse is identifiable, a Warehouse projection; handlers assert which one
   they needed.
4. **Keep the Warehouse implicit and resolve it from the actor's selection**, with a header or body
   field as an optional override.

## Decision outcome

Chosen: **option 1 — two sibling guards, separate metadata keys, separate Permission vocabularies, and
the Warehouse named in the route path.**

Option 4 is rejected outright: it makes the selection an authorization input and directly contradicts
AC-03a and the "Warehouse confusion" and "Stale selection" abuse cases. It is listed only because it is
the smallest diff and therefore the most tempting.

Option 3 is rejected because it doubles the guard cost of every request to serve the minority that need
both levels, and because "the handler asserts which projection it needed" is exactly the per-handler
discipline that AC-31 should not depend on.

Option 2 is genuinely close to option 1 and would remove some duplication between the two resolvers.
It is rejected on the strength of the failure mode it permits: with one metadata shape, a Workspace
Permission and a Warehouse Permission are the same TypeScript type flowing into the same decorator, so
declaring the wrong level's Permission on a handler compiles cleanly and fails only if someone wrote the
matching test. With two decorators typed to two distinct vocabularies, that mistake cannot compile.
Given that level confusion is a named abuse case with a security review attached, a type error is worth
more than the shared resolver code — and the resolvers are small, since each is one indexed membership
lookup plus one bounded Permission-membership read.

The chosen option also fixes the transport shape of the two levels, following the invariant that decides
each one:

- A User belongs to exactly one Workspace and never selects it, so **Workspace-scoped routes carry no
  Workspace identifier**; the guard derives it from the session.
- A member may belong to several Warehouses, so **every Warehouse-scoped route names its Warehouse in
  the path**. A request that omits it cannot match a Warehouse-scoped route, so AC-03a is enforced by
  routing before any handler or command is reached. This re-shapes the existing `/api/v1/access/*`
  endpoints, which currently imply the actor's single Warehouse.
- Routes whose subject is the Warehouse _record_ or a _membership edge_ into it (create, rename, archive,
  restore, assign membership, revoke membership, read a Warehouse's assignable Roles) are Workspace-scoped
  even though a Warehouse identifier appears in their path, because the subject decides the level
  (`spec.md` §1, first boundary).

Finally, the reworked Warehouse guard carries archived state and **denies an archived Warehouse by
default**; a Warehouse-scoped _read_ handler declares its tolerance explicitly. Default-deny is the safe
direction for AC-12, an explicit declaration keeps AC-12a working, and the classification is checkable by
the authorization-coverage architecture test rather than living implicitly in each command.

## Consequences

### Positive

- AC-03a cannot be violated by a forgotten check; routing enforces it.
- Level confusion (AC-31) becomes a compile error rather than a runtime authorization hole.
- Authority is always resolved for the exact (User, Warehouse) pair, so AC-04 and AC-05 fall out of the
  guard rather than out of per-command discipline.
- Each level performs one indexed point lookup plus one bounded Permission read, and only for the level
  a handler declares, so the Warehouse stage stays independent of a member's membership count.
- The existing guard, decorator, principal and repository shapes are extended rather than replaced, so
  the approved `access` tests keep their meaning.
- Archived enforcement is declarative and coverage-testable.

### Negative

- Two resolvers duplicate a similar read shape; a future third level would duplicate a third time.
- Every existing Warehouse-scoped path changes, so contracts, the web module and its tests all move in
  one release.
- The web must pass the selected Warehouse explicitly on every Warehouse-scoped call and key its caches
  by Warehouse; a missing parameter surfaces as a routing failure rather than a friendly error.
- Each Warehouse-scoped handler now carries one more declaration (read versus mutating) that a reviewer
  must get right, backed by the coverage check.

### Neutral

- `WorkspaceCurrentUser` mirrors `AccessCurrentUser`, including being frozen, server-local, and never a
  client claim.
- The narrow cross-level reads that two Workspace Permissions carry (`WAREHOUSE_MEMBERSHIPS:ASSIGN` over
  a Warehouse's assignable Roles, `WORKSPACE_MEMBERS:WATCH` over Users and their Warehouses) stay
  Workspace-scoped routes with SQL-narrowed projections; they do not become an exception to either guard.
- The Active Warehouse selection route is session-authenticated with no Permission and proves membership
  inside its command; it is the single explicitly classified member of that class in the coverage check.

## Links

- [`spec.md`](../spec.md) AC-03a, AC-04, AC-05, AC-11, AC-12, AC-12a, AC-30, AC-31, §6.1
- [`sad.md`](../sad.md) §4, §5, §6.2, §6.3, §8
- [Server architecture](../../../system/server-architecture.md) — guard placement and dependency direction
- [Server error handling](../../../system/guides/server-error-handling.md) — typed denials at the boundary
- [ADR 0002](./0002-parallel-workspace-authority-tables.md) — the relations these guards read
