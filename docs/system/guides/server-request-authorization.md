# Server Request Authorization

Use this guide whenever an `apps/server` handler must be authorized, and always before adding a
guard, a Permission declaration, or a projection whose contents depend on what the actor may read.

Authorization is declarative and lives entirely in transport metadata and shared guards. A use case
never resolves authority for itself: it receives an already-resolved principal and reads it.

## The stage

Every protected handler composes guards in order, from `shared/guards/`:

```ts
@Get('roles')
@RequiredPermission(PermissionId.ROLES_WATCH)
@ArchivedTolerantRead()
@UseGuards(SessionAuthGuard, WarehouseAccessGuard)
listRoles(
  @Req() request: WarehouseAccessRequest,
  @Query() pagination: UuidPaginationDto,
): Promise<RolePage> {
  return this.listAccessRolesQuery.execute(request.access!, pagination);
}
```

- `SessionAuthGuard` resolves the session cookie into `request.user` and refuses an unauthenticated
  request.
- One level guard then resolves the actor's authority and attaches a principal:

  | Level     | Guard                  | Declaration                    | Vocabulary              | Principal                                 |
  | --------- | ---------------------- | ------------------------------ | ----------------------- | ----------------------------------------- |
  | Warehouse | `WarehouseAccessGuard` | `@RequiredPermission`          | `PermissionId`          | `request.access: AccessCurrentUser`       |
  | Workspace | `WorkspaceAccessGuard` | `@RequiredWorkspacePermission` | `WorkspacePermissionId` | `request.workspace: WorkspaceCurrentUser` |

The two levels never meet. Each guard reads only its own metadata key, so a Workspace Permission
declared on a Warehouse-guarded handler resolves nothing and the request is denied. The decision is
recorded in
[workspaces ADR 0001 — Two-level request authorization](../../features/workspaces/adr/0001-two-level-request-authorization.md).

**The level follows the subject of the operation, not the shape of the URL.** Every route on
`WarehouseController` carries a `warehouseId` path segment and every one of them is authorized at
the Workspace level, because its subject is the Warehouse _record_ rather than a resource the
Warehouse owns — renaming, archiving, and both routes of the Warehouse's own delivery address:

```ts
@Get(':warehouseId/delivery-address')
@RequiredWorkspacePermission(WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE)
@UseGuards(SessionAuthGuard, WorkspaceAccessGuard)
```

Choosing the level by the path segment would also change behavior, not just vocabulary:
`WarehouseAccessGuard` consults archived state and `WorkspaceAccessGuard` does not, and these
operations must remain available over an archived Warehouse.

`WarehouseAccessGuard` takes the target Warehouse from the route's `warehouseId` parameter. A
request that names none, or whose body names a different one, is refused before anything is read
from the store. Authority is always the membership held in the Warehouse being acted on; a
Permission held through another Warehouse denies here. Every denial — missing target, missing
membership, insufficient Permission, level confusion — is reported as the one non-enumerating error
from `shared/access/access-denial.errors.ts`, so a refusal never discloses which of them occurred.

An archived Warehouse denies every Warehouse-guarded handler by default. A read handler that must
keep working over an archived Warehouse declares `@ArchivedTolerantRead()`; the principal then
carries `archived: true`.

## Declare the Permission a handler requires

Declare exactly one required Permission per handler with `@RequiredPermission`. The decorator's
signature is variadic and the guard evaluates only the first identifier, so a second one is silently
ignored — never use it to mean "all of these". If a handler seems to need two required Permissions,
it is either two handlers or a case for an observed Permission below.

## Declare the Permissions a projection observes

Some reads must succeed for an actor who may not see every field in the response. Requiring the
second Permission would deny the whole read; withholding the field is what is wanted. Declare that
second Permission with `@ObservedPermission` from
`shared/decorators/observed-permission.decorator.ts` — here, a draft read whose response carries
customer identity that a second Permission governs:

```ts
@Get(':id')
@RequiredPermission(PermissionId.PURCHASE_DRAFTS_WATCH)
@ObservedPermission(PermissionId.CUSTOMERS_WATCH)
@UseGuards(SessionAuthGuard, WarehouseAccessGuard)
readDraft(@Req() request: WarehouseAccessRequest): Promise<PurchaseDraft> {
  return this.readPurchaseDraftQuery.execute(request.access!);
}
```

The guard resolves the declared observed Permissions in the same bounded grant read it already
issues for the required one — the identifiers only widen that read's `IN` list, so the query count
is unchanged and independent of how many are declared. It attaches the **granted subset** to the
principal as `AccessCurrentUser.observedPermissionIds`, frozen with the rest of it. A handler that
declares none carries an empty set.

The set is a projection input and nothing else. It is server-side only: `AccessCurrentUser` is never
returned to the browser, and the one projection that does describe the actor's authority is built
from the membership read rather than from the principal, so an observed Permission cannot reach a
client whatever a handler declares. `read-current-access.query.spec.ts:80` asserts exactly that
(`expect(projection).not.toHaveProperty('observedPermissionIds')`). The client gates its own
rendering from the Permission table it already reads.

The decision is recorded in
[delivery-addresses ADR 0001 — Observed Permissions](../../features/delivery-addresses/adr/0001-observed-permission-redaction.md).

## Why an observed Permission cannot deny

The property that makes this safe is structural, not a matter of discipline. `canActivate` reads the
observed metadata into a local, passes the identifiers to the repository so the grants come back in
one read, and **never consults the resolved set again**. Admission is decided entirely by
`request.user`, the presence of a required Permission, an unambiguously named Warehouse, the
`granted` flag for that required Permission, and the archived check. Three consequences follow from
the code rather than from a convention:

- An ungranted observed Permission cannot deny: no branch tests the set.
- A granted observed Permission cannot admit: the same Permission observed on a handler is not the
  Permission the guard resolves as required, so it can never substitute for a missing grant.
- A handler declaring only observed Permissions and no `@RequiredPermission` is denied exactly as an
  undecorated handler is, and resolves nothing from the store.

The worst outcome a mistake here can produce is a surface that withholds data from someone entitled
to it — visible and reportable. It cannot produce a disclosure. `warehouse-access.guard.spec.ts`
enumerates each of these properties as its own case.

## Consume the observed set in the projection

The query decides what the response carries. Read the field on the principal it was handed:

```ts
const mayReadIdentity = access.observedPermissionIds.includes(
  PermissionId.CUSTOMERS_WATCH,
);
```

Build the redacted form by **not selecting** the withheld columns, rather than by fetching them and
deleting them afterwards. Withhold every count, badge or total from which the withheld data could be
inferred; a count answers "does this exist" as effectively as the record does.

Redaction correctness is a property of each query, so each needs a test on both sides of the
observed Permission. A projection that forgets to consult the field discloses, and only a test
catches it.

## Rules

- Guards live in `shared/guards/` and never inside a feature module. They resolve authority and
  archived state; they do not decide target-resource ownership, which is a use case's rule.
- A use case receives the principal as its first argument and never injects
  `AccessCurrentUserRepository` to ask an authorization question of its own. That would add a store
  round trip inside the read and would put an authorization decision where no architecture check can
  find it.
- Never promote an observed Permission to a required one to "tighten" a read. That denies the read
  the actor legitimately holds; if the read genuinely requires both, it is a different handler.
- Never derive a required Permission from the observed set, or vice versa. Two metadata keys exist
  so that one can never be mistaken for the other.
- Every authorization decision re-reads Roles, Permissions and memberships from the store on the
  request being authorized. Never cache authority across requests, and never read it from
  client-supplied state.

## Verify

```sh
pnpm --filter @warehouser/server lint
pnpm --filter @warehouser/server test
pnpm --filter @warehouser/server build
```

For a new protected handler, assert at least: the denial when the required Permission is absent, the
denial over an archived Warehouse unless the handler declares read tolerance, and — for a handler
declaring an observed Permission — the response on both sides of that Permission.
