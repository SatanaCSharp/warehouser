---
id: T5
title: 'Add @ObservedPermission, resolve it in WarehouseAccessGuard, and carry observedPermissionIds on AccessCurrentUser'
layer: 'infra'
deps: [T3]
acs: ['AC-09', 'AC-09a']
files_hint:
  - 'apps/server/src/shared/decorators/observed-permission.decorator.ts'
  - 'apps/server/src/shared/guards/warehouse-access.guard.ts'
  - 'apps/server/src/shared/access/access-current-user.ts'
  - 'apps/server/src/access/'
owner: 'Tech Lead'
estimate: 'M'
status: 'todo'
---

# T5 — Add @ObservedPermission, resolve it in WarehouseAccessGuard, and carry observedPermissionIds on AccessCurrentUser

## Why

AC-09a is **not** "require both Permissions" — a member without `CUSTOMERS:WATCH` still reads the draft, the demand and the drift, with only identity withheld. [ADR 0001](../adr/0001-observed-permission-redaction.md) resolves this by resolving a Permission without ever requiring it, so the guard's denial semantics are untouched and the projection decides. Derives from [sad.md §4](../sad.md) and [ADR 0001](../adr/0001-observed-permission-redaction.md).

## What

Add `shared/decorators/observed-permission.decorator.ts`, which carries no denial power by construction. Extend `WarehouseAccessGuard` to resolve the declared observed Permissions **in the same membership read** it already performs, and `AccessCurrentUserRepository` to report them. Add `readonly observedPermissionIds: readonly PermissionId[]` to `AccessCurrentUser`, empty when a handler declares none.

## Definition of Done

- [ ] A guard unit test proves an observed Permission that is not granted never denies.
- [ ] A guard unit test proves a required Permission that is not granted still denies.
- [ ] The observed set on the principal is exactly the granted subset of what the handler declared.
- [ ] A handler declaring only observed Permissions and no required one is still a denial.
- [ ] Archived handling and the ambiguous-`warehouseId` refusal are asserted unchanged.
- [ ] `AccessCurrentUser` is still frozen and still never returned to the browser.
- [ ] lint + vet clean.

## Notes

**Hard rule** ([spec.md §6](../spec.md) Authority staleness): the decision re-reads Roles, Permissions and memberships from the store inside the request being authorized — no cached authority. This adds shared authorization infrastructure, which [sad.md §2](../sad.md) records as a proposed deviation; T25 promotes it into `docs/system` in the same change rather than the next.
