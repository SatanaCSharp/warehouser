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

The set never leaves the server. `AccessCurrentUser` is never returned to the browser, and the one
projection that does describe the actor's authority is built from the membership read rather than
from the principal, so an observed Permission cannot reach a client whatever a handler declares.
`read-current-access.query.spec.ts:80` asserts exactly that
(`expect(projection).not.toHaveProperty('observedPermissionIds')`). The client gates its own
rendering from the Permission table it already reads.

The decision is recorded in
[delivery-addresses ADR 0001 — Observed Permissions](../../features/delivery-addresses/adr/0001-observed-permission-redaction.md).

**A use case may also read the resolved set to narrow what an already-admitted request may do —
never to widen anything.** The projection case above is one instance of that rule, not the whole of
it: a command may read the same set to refuse an operation whose _payload_ requires a capability the
actor does not hold, exactly as a query reads it to withhold a field. Both are narrowing reads of the
same principal field; neither can turn a denied request into an admitted one. `purchase-drafts`'
ending command is the worked case: the route declares `PURCHASE_DRAFTS:RECEIVE` as required and
`REJECTIONS:CREATE` as observed, and the command asserts the grant **only when its own input carries
at least one Rejection**, refusing with a named domain error before any write —
`assertRejectionCapability` in
`apps/server/src/purchase-drafts/domain/services/arrival-inspection.service.ts:253` reads
`actor.observedPermissionIds` and returns immediately on a Rejection-free submission, so the
capability-free member's plain ending keeps working and the rule is never reached by it at all. This
is the shape every later payload-conditional capability should copy: one more observed Permission,
one more predicate over the same field, no new mechanism. The decision and the alternatives it
weighed — widening `@RequiredPermission` to a conjunction, and splitting the route by payload shape
— are recorded in
[arrival-inspection ADR 0001 — Payload-conditional Permission](../../features/arrival-inspection/adr/0001-payload-conditional-permission.md).

A reader who meets `@ObservedPermission` on a write should therefore expect either kind of narrowing
reader — a projection or a payload-conditional refusal — never a widening one. Nothing here changes
what the decorator declares or how the guard resolves it: it is still one widened `IN` list in the
same bounded grant read, with no new mechanism and no additional round trip.

## Why an observed Permission cannot deny

**This is a claim about admission at the guard, not about what a use case may do with the set once
it is handed one.** The property that makes admission safe is structural, not a matter of
discipline. `canActivate` reads the observed metadata into a local, passes the identifiers to the
repository so the grants come back in one read, and **never consults the resolved set again**.
Admission is decided entirely by `request.user`, the presence of a required Permission, an
unambiguously named Warehouse, the `granted` flag for that required Permission, and the archived
check. Three consequences follow from the code rather than from a convention:

- An ungranted observed Permission cannot deny: no branch tests the set.
- A granted observed Permission cannot admit: the same Permission observed on a handler is not the
  Permission the guard resolves as required, so it can never substitute for a missing grant.
- A handler declaring only observed Permissions and no `@RequiredPermission` is denied exactly as an
  undecorated handler is, and resolves nothing from the store.

Because admission never reads the resolved set, the worst outcome a mistake in a _narrowing_ reader
can produce is bounded the same way regardless of which kind of narrowing it performs: a projection
that wrongly withholds data from someone entitled to it, or a command that wrongly refuses a write
someone was entitled to make. Both are visible and reportable; neither can produce a disclosure or
admit a request the required Permission alone did not. `warehouse-access.guard.spec.ts` enumerates
each admission property as its own case.

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
- Never promote an observed Permission to a required one to "tighten" a read or a write. That denies
  the request the actor legitimately holds; if the operation genuinely requires both together and
  unconditionally, it is a different handler.
- Never derive a required Permission from the observed set, or vice versa. Two metadata keys exist
  so that one can never be mistaken for the other.
- The resolved-grant set may be read inside a use case to **narrow** what an already-admitted
  request may do — to withhold a field from a projection, or to refuse an operation whose payload
  requires a capability the actor does not hold — and never to **widen** anything: no branch may
  treat a granted observed Permission as substituting for a missing required one. A handler must
  never gate _admission_ on an observed Permission; `WarehouseAccessGuard.canActivate` never
  consults the observed set, and no use case may recreate that decision by treating the set as
  though it could.
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
