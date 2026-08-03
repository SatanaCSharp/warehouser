---
status: Draft
owner: 'Tech Lead'
reviewers: ['Security Lead', 'Frontend Lead', 'Backend Lead']
updated_at: '2026-08-03'
feature_size: 'M'
target_surfaces: ['web-frontend', 'backend-service']
---

# Software Architecture Description — access

## 1. Context and quality goals

Authentication currently resolves a session to a `userId`, but neither the data model nor the
request pipeline can answer which Warehouse that User belongs to or which business operations the
User may perform. This feature adds that authorization boundary and extends registration so a new
identity is immediately attached to one Warehouse and its protected Warehouse Manager Role.

The architecture must satisfy these quality goals, in priority order:

1. A Permission never authorizes access to a resource owned by another Warehouse.
2. Every Warehouse has exactly one protected Warehouse Manager, and every Warehouse Member has
   exactly one Role in exactly one Warehouse.
3. Registration, assigned-Role deletion, and manager transfer preserve their invariants in one
   database transaction.
4. Permission removal and Role reassignment affect the next authorization decision; session
   renewal or cache expiry is not required.
5. Every user-accessible business capability outside authentication declares a Permission rule
   and enforces Warehouse ownership, while the web presents only currently available actions.
6. Authorization adds no more than 50 ms at p95 and Role reads and mutations meet the latency and
   throughput targets in the specification.

The specification is Approved. Because this feature adds user-visible access administration and
changes registration, an approved Pencil [`design-handoff.md`](./design-handoff.md) remains a gate
before implementation tasks may be finalized.

## 2. Constraints inherited from `docs/system`

- The repository remains a browser SPA plus NestJS modular monolith, with shared REST schemas in
  `packages/contracts` ([architecture map](../../system/architecture-map.md)).
- Server code follows the entity-related module, inward-dependency, command/query, domain-service,
  and thin-controller boundaries in [server architecture](../../system/server-architecture.md).
  Authorization guards are shared transport infrastructure under `shared/guards`; business
  ownership rules remain in the owning domain/application boundary.
- PostgreSQL and TypeORM own persistence. TypeORM entities and specialized concrete repositories
  remain under `shared/domain`, and all schema changes use reversible migrations with runtime
  synchronization disabled
  ([PostgreSQL/TypeORM ADR](../../system/adr/21-07-2026-postgresql-with-typeorm.md)).
- Zod schemas in `packages/contracts/access` own web/server request and response shapes; server-only
  metadata and browser-only form state stay local
  ([Zod ADR](../../system/adr/12-07-2026-schema-validation-with-zod.md)).
- RTK Query owns access-resource requests and cached server state. Redux Toolkit owns only
  cross-route client state, and TanStack Router guards read the live store through selectors
  ([frontend architecture](../../system/frontend-architecture.md) and
  [RTK Query ADR](../../system/adr/02-08-2026-rtk-query-for-web-api-calls.md)).
- Expected denials and invariant failures use stable typed errors and the global exception filter;
  controllers do not translate failures locally
  ([server error-handling ADR](../../system/adr/24-07-2026-server-error-handling.md)).
- User-visible copy uses the centralized `access` and shared feedback namespaces, and HeroUI plus
  repository tokens remain the visual foundation
  ([frontend architecture](../../system/frontend-architecture.md) and
  [localization ADR](../../system/adr/27-07-2026-bundled-centralized-web-translations.md)).
- Structured Pino logs are the diagnostic and performance-measurement mechanism. This feature adds
  no telemetry SDK, tracing, metrics exporter, or feature-specific telemetry abstraction
  ([logging ADR](../../system/adr/27-07-2026-structured-logging-with-pino.md) and
  [logging-without-telemetry ADR](../../system/adr/03-08-2026-structured-logging-instead-of-telemetry.md)).

## 3. Scope and target surfaces

### In scope

| Surface           | Change                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend-service` | Add the `access` module, Warehouse/Role/Permission persistence, request-time permission resolution, Warehouse ownership enforcement, access administration commands and queries, and atomic manager transfer and Role replacement. Extend registration to provision Warehouse access in the same transaction. |
| `web-frontend`    | Extend sign-up with Warehouse name and add an access-administration route for Role, Permission, member-assignment, Role replacement, and manager-transfer workflows. Hide unavailable actions from current access data while retaining server enforcement.                                                    |
| Shared boundary   | Add access contracts and stable error codes for registration, access reads, Role mutations, assignments, deletion/replacement, and manager transfer.                                                                                                                                                          |
| Persistence       | Add Warehouses, Permissions, Roles, Role-Permissions, and the User-to-Warehouse/Role relationship with database constraints and reversible TypeORM migrations. Exact tables, indexes, and constraint rollout belong to the data-model stage.                                                                  |

### Out of scope

Creating members, Location authorization, multi-Warehouse membership, concurrent Roles, editing the
Permission vocabulary at runtime, queues/workers, and asynchronous propagation are excluded. The
existing session mechanism remains authentication-only. Infrastructure endpoints do not receive
business Permission identifiers.

## 4. Solution strategy

Create an `access` server module as the owner of Warehouse membership, Roles, the system Permission
catalogue, and access lifecycle rules. Store effective authority relationally and resolve it from
PostgreSQL for every protected request. Do not place Permission sets in the session, cookie, or a
process cache: a session proves identity only, so a database change is visible to the next
authorization decision.

The HTTP boundary composes `SessionAuthGuard` with a shared `WarehouseAccessGuard`. An endpoint
declares its required stable Permission identifier through shared route metadata. The access guard
loads the authenticated User's current Warehouse, Role, and Permission membership in one
specialized read and attaches an immutable `AccessPrincipal` containing `userId`, `warehouseId`,
`roleId`, and the evaluated Permission to the request. Missing membership, a missing Permission,
or a protected-role rule produces a typed denial. The guard never accepts a client-provided
Warehouse as the actor's scope.

Permission is necessary but not sufficient. Controllers pass the `AccessPrincipal` into commands
and queries, and each owning use case proves that every target Role, member, or future business
resource belongs to `principal.warehouseId`. Access REST routes operate on the current Warehouse
and therefore do not expose a selectable Warehouse ID. Future modules must accept actor scope at
their application boundary and constrain target retrieval or mutation by both resource identity
and Warehouse identity. This deliberately keeps resource ownership knowledge out of a generic
transport guard.

Permission identifiers are application vocabulary, declared as stable shared string constants and
seeded/updated by reviewed database migrations. Each catalogue update classifies new Permissions
as assignable or reserved and explicitly updates every protected manager Role. Custom Role writes
accept only identifiers currently present and assignable in that catalogue. The protected manager
Role is a persisted Role distinguished by a system-managed kind, not by its display name.

Registration becomes one transaction spanning the existing Account/User/Session write and access
provisioning. The register command constructs the identity, then asks the exported access
provisioning service to construct the Warehouse, protected Role, catalogue associations, and User
membership. A transaction boundary around the complete command lets both specialized repositories
join the existing transaction context; the current narrower transaction on
`AuthRegistrationService.registerIdentity` must move outward. The access module does not import
auth internals and receives only the new User ID and validated Warehouse name.

Role deletion with replacement and manager transfer each use one specialized repository operation
inside one application transaction. Database foreign keys, uniqueness constraints, and locking of
the affected Warehouse/membership rows backstop concurrency; commands re-check the domain
preconditions after acquiring the required lock. Exact lock shape and constraint definitions are
deferred to `data-model.md`.

## 5. Building blocks and ownership

### Backend and shared boundary

| Building block                            | Ownership and responsibility                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access/domain`                           | Warehouse, Role, Permission-membership, name value objects, predicates, typed errors, and rules protecting the manager Role and reserved Permissions. No NestJS, HTTP, or TypeORM imports.                          |
| `access/domain/services`                  | Reusable lifecycle rules for custom Role membership, assigned-Role replacement, manager transfer, and registration provisioning.                                                                                    |
| `access/domain/mappers`                   | Translate feature-owned domain objects to and from shared persistence entities above repository boundaries; repositories never perform this mapping.                                                                |
| `access/usecases/commands`                | Create/update/rename/delete a custom Role, assign a member Role, transfer management, and provision initial Warehouse access. Commands receive `AccessPrincipal` where an authenticated actor is required.          |
| `access/usecases/queries`                 | Return current-Warehouse Roles and catalogue under `ROLES:WATCH`, members and assignments under `USERS:WATCH`, and the caller's minimal capability projection used by the web.                                      |
| `access/rest`                             | Thin current-Warehouse endpoints and Zod DTO adapters. Controllers invoke commands/queries only and obtain the evaluated principal from shared request infrastructure.                                              |
| `shared/guards/warehouse-access.guard.ts` | Composes after session authentication, reads required-Permission metadata, resolves fresh effective access, denies missing authority, and attaches `AccessPrincipal`. It does not decide target-resource ownership. |
| `shared/domain/entities`                  | TypeORM entities for Warehouse, Permission, Role, Role-Permission membership, and User membership fields/association.                                                                                               |
| `shared/domain/repositories`              | Specialized access-principal, access-read, Role-lifecycle, manager-transfer, and registration-provisioning operations. Repositories operate on persistence values and do not import `access`.                       |
| `packages/contracts/access`               | Strict request/response schemas for access administration and the caller capability projection. Registration's shared credentials schema is extended with `warehouseName` at its existing auth boundary.            |
| `packages/shared-types`                   | Stable Permission identifiers and public access error codes when both applications consume them. Labels remain presentation/catalogue data, not identifiers.                                                        |

`AccessPrincipal` is server-local and is not a client claim. The web receives only a safe projection
needed to render available routes/actions; every mutation is independently authorized again.

### Web

| Building block                            | Ownership and responsibility                                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/auth/sign-up`                    | Add the validated Warehouse-name control to the existing registration workflow and submit the extended shared contract.                                                                                                         |
| `modules/access/api`                      | Inject current-access, Role, Permission, member-assignment, deletion/replacement, and manager-transfer endpoints into the shared RTK Query API; declare invalidation tags so mutations refresh capabilities and affected lists. |
| `modules/access/route.tsx` and `page.tsx` | Own the access-administration route and coordinate loading, partial read authority, workflows, confirmation, errors, and navigation.                                                                                            |
| `modules/access/components`               | Render the approved Role list/editor, Permission selection, membership assignment, replacement confirmation, and manager-transfer interaction using HeroUI and accessible semantics.                                            |
| `guards/access.guard.ts`                  | Dispatch/read the current-access RTK Query endpoint through the router store and redirect when the route-level capability is absent. It improves navigation only and is not a security boundary.                                |
| `public/locales/<language>/access.json`   | Own access-specific labels and explanations with mirrored locale key shapes. Shared validation/error/success copy stays in its existing namespace.                                                                              |

The UI must support partial read authority: `ROLES:WATCH` reveals Roles and the Permission catalogue;
`USERS:WATCH` reveals members and assignments. It must not fetch or retain a dataset the caller may
not read. Mutation controls derive availability from the current capability projection and are
removed immediately when invalidation refreshes that projection.

## 6. Runtime view

### 6.1 Registration with initial Warehouse access

1. The sign-up form validates credentials and Warehouse name using the shared contract.
2. The auth controller invokes the register command.
3. The command creates Account, User, Session, Warehouse, protected manager Role, its initial
   Permission membership, and the new User's Warehouse/Role membership as domain values.
4. One outer transaction persists the identity records and access records. Catalogue identifiers
   must already exist from the release migration.
5. Only after commit does the controller issue the session cookie and return the current User and
   immediate access projection. Any persistence failure rolls back the entire outcome.

The unavoidable HTTP boundary remains the same as auth: loss of a success response after commit
cannot roll back PostgreSQL and must not cause automatic registration replay.

### 6.2 Protected access operation

1. `SessionAuthGuard` resolves the cookie to `userId`.
2. `WarehouseAccessGuard` reads the endpoint's declared Permission and loads current membership and
   Role-Permission membership from PostgreSQL.
3. On success it attaches `AccessPrincipal`; otherwise the request ends with a typed denial.
4. The controller passes the principal and validated input to the command/query.
5. The use case retrieves or mutates targets constrained by `principal.warehouseId`; an ID from a
   different Warehouse is indistinguishable from an unavailable target at the domain boundary.
6. The global filter returns the safe contract and structured logs record duration, outcome code,
   operation, and non-sensitive identifiers. No Role names, member data, credentials, or tokens are
   required in logs.

### 6.3 Delete an assigned custom Role

1. A caller authorized by `ROLES:DELETE` submits the current-Warehouse Role ID and, when assigned,
   a replacement custom Role ID.
2. The command starts a transaction and locks/loads the source Role, replacement, and affected
   memberships within the actor's Warehouse.
3. It rejects protected Roles, cross-Warehouse IDs, a missing/invalid replacement, and replacement
   with the source Role.
4. One repository operation updates every affected membership and deletes the source Role.
5. Commit invalidates Role, member, and current-access caches; any failure rolls back assignments
   and Role deletion together. An unassigned custom Role follows the same path without replacement.

### 6.4 Transfer Warehouse Manager

1. Only the current protected-role holder with `WAREHOUSE_MANAGER_ROLE:REASSIGN` can submit a
   different same-Warehouse recipient and a custom replacement Role for themself.
2. The command locks the Warehouse's manager membership plus recipient and replacement records,
   then re-checks all preconditions.
3. In one write, the recipient receives the protected manager Role and the former manager receives
   the selected custom Role. The uniqueness constraint and transaction preserve exactly one
   manager under concurrent attempts.
4. Commit invalidates members, Roles, and both affected capability projections. Either affected
   User's next protected request resolves their new authority from PostgreSQL.

### 6.5 Review access in the web application

1. After authentication, the access page loads the caller capability projection.
2. It requests Role/catalogue data only with `ROLES:WATCH` and member/assignment data only with
   `USERS:WATCH`; each server request enforces its own Permission.
3. The page renders only operations present in the projection and uses the approved confirmation
   flows for destructive Role replacement and manager transfer.
4. After a mutation, RTK Query invalidates all affected data. A denial caused by concurrent
   revocation removes stale controls when current access is refetched and presents the normalized
   safe explanation.

## 7. Data and interface impact

### Data

- New durable concepts are Warehouse, Permission, Role, Role-Permission membership, and exactly
  one Warehouse/Role membership for each User.
- Database constraints must enforce same-Warehouse Role assignment, exact Role-name uniqueness per
  Warehouse using submitted Unicode bytes/collation semantics, one protected manager Role and
  manager assignment per Warehouse, and referential integrity for catalogue membership.
- Name validation trims surrounding whitespace, counts user-perceived characters, rejects Unicode
  control/format characters, and otherwise stores submitted Unicode without normalization. A
  shared server utility/value object must define the segmentation behavior used by Warehouse and
  Role names; the web may provide early feedback but the server is authoritative.
- Catalogue migrations are forward data changes with explicit reversible behavior. Adding a
  Permission updates every protected manager Role and leaves custom Roles unchanged unless the
  migration says otherwise.
- `data-model.md` must resolve whether User carries non-null `warehouse_id`/`role_id` fields or a
  one-to-one membership table, the concurrency constraints/locks, index design, collation behavior,
  and the safe rollout from the current auth schema. The approved precondition is that no existing
  production Users require backfill; deployment must verify it before migration.

### HTTP and shared contracts

The API stage owns exact paths and status codes. The contract must cover:

- extended sign-up input containing `warehouseName` and a response containing the safe immediate
  access projection;
- current caller capabilities;
- Role and assignable-Permission reads under `ROLES:WATCH`;
- member and assignment reads under `USERS:WATCH`;
- custom Role create, rename/Permission update, delete with optional replacement, and member Role
  assignment;
- protected manager transfer; and
- stable validation, authorization, cross-Warehouse/not-found, protected-role, concurrency, and
  atomic-operation failure codes through the existing error envelope.

List responses must be bounded and deterministically ordered; pagination/search thresholds are an
API-stage decision because the specification sets latency but not expected Warehouse size. No
endpoint accepts a Permission definition or label mutation.

No queue, event contract, CLI, SDK, or worker interface is introduced.

## 8. Cross-cutting concerns

### Security and privacy

- Authentication remains separate from authorization. A valid session with no valid Warehouse
  membership is denied business access.
- The server derives actor Warehouse scope from current persistence and constrains every target by
  it. Cross-Warehouse misses return safe, non-enumerating failures.
- Reserved Permission membership and protected Role lifecycle are validated in domain code and
  backed by database constraints where expressible.
- Capability projections are advisory UI data and never accepted back as proof of authority.
- The security review must cover guard bypass, missing endpoint metadata, direct use-case calls,
  ID enumeration, concurrent manager transfers, assigned-Role deletion, and catalogue migration.

### Authorization coverage

All user-accessible REST controllers outside authentication must be classified explicitly as
infrastructure-exempt or protected. A focused architecture test scans controller metadata and
fails when an authenticated business handler lacks both a declared Permission and a documented
Warehouse-scoping strategy. Unit and integration tests still prove the concrete ownership rule;
metadata coverage alone is insufficient.

### Consistency and concurrency

Atomic workflows use the existing transaction context and `@Transactional` boundary at the
complete use case. Database constraints are the final arbiter under concurrency; expected
constraint conflicts map to stable application errors. Do not catch/log/rethrow at lower layers.

### Performance and diagnostics

The access-principal repository uses one indexed query and returns only the actor scope and the
required Permission result. Structured timing logs measure authorization, Role reads, mutations,
and reconciliation without adding telemetry. Load smoke tests exercise at least 50 protected
operations/second per instance for ten minutes. A production reconciliation command or deployment
check reports invariant violations through structured operational logs without attempting silent
repair.

### Web state, freshness, and accessibility

RTK Query tags connect current access, Roles, members, and assignments so mutations refresh every
affected view. The server remains authoritative during races. Loading, empty, partial-authority,
denied, validation, success, and rollback-safe error states require explicit Pencil designs.
Dialogs restore focus, expose accessible names/descriptions, support keyboard operation, and do
not communicate protected state by color alone.

## 9. ADR index

None. The module placement, PostgreSQL/TypeORM persistence, Zod contracts, RTK Query data flow,
shared guard location, error handling, logging, and UI workflow are inherited system decisions.
The remaining feature choices do not pass the feature ADR blast-radius threshold and are recorded
inline above.

## 10. Verification strategy

| Level                  | Required evidence                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain unit            | Name segmentation/validation; exact and case-sensitive Role-name behavior; assignable versus reserved Permissions; protected Role immutability; replacement and transfer preconditions.                        |
| Guard unit             | Authentication composition, declared-Permission lookup, missing membership, stale session authority, denied Permission, and safe principal attachment.                                                         |
| Repository integration | Same-Warehouse constraints, uniqueness, catalogue seeding/update, fresh authority reads, bounded queries, and transaction participation against PostgreSQL.                                                    |
| Command integration    | Atomic registration, assigned/unassigned Role deletion, manager transfer, ordinary assignment restrictions, rollback on injected failure, and concurrent attempts.                                             |
| REST contract          | Every endpoint validates shared schemas, maps stable errors, prevents ID enumeration, and denies missing Permission and cross-Warehouse targets.                                                               |
| Architecture           | Every user-accessible business handler outside auth is protected or explicitly infrastructure-exempt; controllers call use cases only; access/domain has no framework imports.                                 |
| Web                    | Partial read authority, hidden unavailable actions, direct-request denial handling, cache invalidation after authority changes, translated feedback, focus/keyboard behavior, and responsive approved layouts. |
| Performance/operations | Authorization p95, read/mutation p95, 50 ops/s smoke load, structured timing fields, catalogue migration verification, and invariant reconciliation.                                                           |

Trace these checks to every `AC-*` in `spec.md` during `plan-tests`. Run the normal server,
contracts, web, lint, typecheck, and build gates after focused suites. The security review and
approved Pencil handoff are release gates.

## 11. Risks and open questions

| Risk or question                                                                                               | Treatment / owner                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A future module checks Permission but not target ownership.                                                    | Require actor scope at use-case boundaries, constrained repository operations, architecture coverage, and cross-Warehouse integration tests. Tech Lead owns the convention.      |
| Database constraints cannot express every same-Warehouse or sole-manager invariant directly.                   | Resolve composite keys, deferred constraints, and row-lock strategy in `data-model.md`; prove concurrent outcomes with PostgreSQL integration tests. Backend Lead.               |
| User-perceived-character counting or database collation drifts between browser, server, and uniqueness checks. | Select one server segmentation algorithm and explicit database comparison semantics in `data-model.md`; share boundary fixtures with the web. Backend Lead + Frontend Lead.      |
| Catalogue migration fails partway or a deployment omits it.                                                    | Transactional migration, startup/health precondition for required identifiers, reversible plan, and post-migration reconciliation. Backend Lead + Operations owner.              |
| Current access data becomes stale in an open browser.                                                          | Never trust it server-side; invalidate after local mutations, refetch after denial/focus according to the API design, and rely on next-request server evaluation. Frontend Lead. |
| Access-administration information volume is unknown.                                                           | API design must choose bounded pagination/search before contracts are approved; validate against the 250 ms read target. Product + Backend Lead.                                 |
| The current repository still uses a single REST bootstrap despite the documented two-runtime target.           | Add only REST modules for this feature and avoid worker dependencies; preserve compatibility with the later root-module split. Tech Lead.                                        |
| UI flows and the extension of sign-up are not yet visually approved.                                           | Run `/design-ui access`; do not finalize UI implementation tasks until explicit approval is recorded. Product + Frontend Lead.                                                   |
