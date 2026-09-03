# Server Architecture

This document defines the target structure and dependency rules for `apps/server`. The server is a
NestJS modular monolith: it is deployed from one codebase, while entity-related modules retain
explicit domain and application boundaries. PostgreSQL and TypeORM are the persistence baseline.
BullMQ and Redis remain planned and must not be treated as already installed.

## Runtime applications

The server has two runtime entry points:

```text
main.rest.ts   -> RestAppModule   -> HTTP controllers
main.worker.ts -> WorkerAppModule -> BullMQ job and event consumers
```

The REST and worker applications run as separate processes. They may import the same feature use
cases, services, domain objects, and repository implementations, but each root module imports only
the transport adapters it needs. Until the split is implemented, `main.ts` and `AppModule` remain
the current REST bootstrap; new feature design must preserve the two-runtime target.

Use BullMQ for asynchronous operations and scheduled work after BullMQ and Redis are introduced.
Register recurring work as BullMQ schedulers/repeatable jobs and process it in the worker runtime.
Do not introduce an independent in-process cron mechanism.

## Source structure

Create only directories and modules that contain behavior. Do not add empty optional layers.

```text
apps/server/src/
├── main.rest.ts
├── main.worker.ts
├── rest-app.module.ts
├── worker-app.module.ts
├── shared/
│   ├── shared.module.ts             # global infrastructure providers only
│   ├── domain/
│   │   ├── entities/                # shared TypeORM persistence entities
│   │   └── repositories/            # specialized concrete repositories
│   ├── guards/                       # all NestJS authentication/authorization guards
│   ├── logger/                       # shared structured logging module
│   ├── events/
│   │   └── <event-name>/
│   │       ├── <event-name>.schema.ts
│   │       └── index.ts
│   └── types/                        # server-wide interfaces and types
├── test/
│   ├── factories/
│   ├── fixtures/
│   ├── expects/
│   └── mocks/
└── <module-name>/
    ├── domain/
    │   ├── entities/
    │   ├── value-objects/
    │   ├── errors/
    │   ├── mappers/
    │   └── services/
    ├── usecases/
    │   ├── commands/
    │   ├── queries/
    │   ├── events/
    │   └── usecase.module.ts
    ├── rest/
    │   ├── controllers/
    │   ├── dtos/
    │   └── rest.module.ts
    ├── handlers/
    │   ├── jobs.controller.ts
    │   ├── event.controller.ts
    │   └── handler.module.ts
    └── index.ts
```

A module is named for the business entity or cohesive business capability it owns. Keep code in
the owning module until it is genuinely reused. `shared/` is for pure fabrications and stable
cross-module abstractions, not miscellaneous code or business behavior with an unclear owner.

## Layer responsibilities

### Domain

Domain entities and value objects contain framework-independent rules and invariants. Domain
entities and value objects must not import NestJS, HTTP adapters, BullMQ, TypeORM, or concrete
persistence models.

TypeORM persistence entities and concrete repositories are shared persistence infrastructure.
Place entities in `shared/domain/entities/` and repositories in `shared/domain/repositories/`.
Every repository is specialized around a cohesive persistence operation and follows
[Creating a server repository](guides/creating-a-server-repository.md). It may operate on several
entities when one query, database operation, or public method is more efficient. Do not use
`BaseRepository`, generic CRUD bases, repository ports, or feature-owned persistence adapters.
Repository classes do not contain private methods. Shared repositories must not import from or
otherwise know about dedicated feature modules. They accept and return shared persistence entities
and persistence-oriented values only.

Mappings between shared persistence entities and feature-owned domain objects belong in
`<feature-name>/domain/mappers/`. A feature use case or domain service invokes mappings such as
`toSession` and `toSessionEntity` above the repository boundary; repositories never perform
feature/domain mapping.

### Services

A service is an extraction, never a default layer. A use case owns its own business rules and
reaches concrete repositories directly; extract a service only when one of these is true:

- **more than one use case needs the same operation** — the rule would otherwise be duplicated, or
  another module must invoke it through the owning module's exported provider;
- **the use case has grown too large to read** — a single `execute` that no longer fits in one
  screen may delegate a cohesive part of itself to a named service.

Never introduce a service that exactly one use case calls with the arguments it was handed. That
service adds an indirection without a rule of its own and turns the use case into a pass-through;
see "Use cases" below for the rule this violates.

A shared operation that reaches a repository belongs in an injectable service, so the repository is
injected once rather than threaded through every caller as an argument. Keep a shared helper as a
plain exported function only when it needs no collaborator at all — a pure predicate, an assertion
over a value, or a mapping.

Services live under the owning feature's `<feature-name>/domain/services/`. They may use domain
objects, feature mappers, and concrete repositories, and must not invoke commands, queries, event
use cases, controllers, or handlers. A service may delegate an optimized multi-entity read or write
to one specialized repository method instead of coordinating table-shaped repositories. A service
that joins a caller's transaction carries no transaction boundary of its own; the complete
operation owns exactly one.

#### Worked example: a shared-check service

`purchase-drafts` has eight commands that assemble a Purchase Draft — create the draft, add, revise
and remove a line, add, revise and remove a link, revise the draft. Three checks recur across them:
an Item must belong to the acting Warehouse, a linked Customer Order must too, and a Packaging Type
must be one the catalogue offers. Each check reads a repository, and each is needed by more than one
command. That is the first extraction trigger, so it becomes a service:

```ts
// purchase-drafts/domain/services/purchase-draft-assembly.service.ts

// Stateless: no repository, nothing injected. It stays a module-level function so the four commands
// that only map a write outcome are not coupled to repositories they never touch.
export const assertApplied = (outcome: AssemblyWriteOutcome): void => {
  assert(outcome !== 'draft-frozen', purchaseDraftFrozenError());
  assert(outcome !== 'target-missing', purchaseDraftTargetUnavailableError());
};

@Injectable()
export class PurchaseDraftAssemblyService {
  constructor(
    private readonly itemCatalogueRepository: ItemCatalogueRepository,
    private readonly customerOrderLifecycleRepository: CustomerOrderLifecycleRepository,
    private readonly packagingTypeCatalogueRepository: PackagingTypeCatalogueRepository,
  ) {}

  async assertItemAvailable(
    currentUser: AccessCurrentUser,
    itemId: string,
  ): Promise<void> {
    const item = await this.itemCatalogueRepository.findById(itemId);
    assert(
      item !== null && item.warehouseId === currentUser.warehouseId,
      purchaseDraftTargetUnavailableError(),
    );
  }

  // …assertCustomerOrderAvailable, assertPackagingTypesKnown
}
```

The command keeps everything that is its own — the input type, the write, the transaction boundary
— and calls the service only for what it shares:

```ts
// purchase-drafts/usecases/commands/add-purchase-draft-line.command.ts
@Injectable()
export class AddPurchaseDraftLineCommand {
  constructor(
    private readonly assemblyRepository: PurchaseDraftAssemblyRepository,
    private readonly assemblyService: PurchaseDraftAssemblyService,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    purchaseDraftId: string,
    input: AddLineInput,
  ): Promise<void> {
    await this.assemblyService.assertItemAvailable(currentUser, input.itemId);
    await this.assemblyService.assertPackagingTypesKnown([
      input.packagingTypeId,
    ]);

    const outcome = await this.assemblyRepository.addLine({/* … */});

    assertApplied(outcome);
  }
}
```

Register the service as a provider of the feature's `UsecaseModule` and leave it out of `exports`,
so a transport adapter still reaches the feature only through its use cases. Export it only when
another module must call it — `customer-orders` exports `DemandAllocationService` for exactly that
reason, and nothing else.

Four properties make this an extraction rather than a pass-through, and each is worth checking
before adding a service:

- **every method has more than one caller.** A method called by one command belongs in that command.
- **the commands still own their operations.** The service holds no `addLine`, no write, and no
  input type; it answers questions, and the command decides what to do with the answers.
- **the service opens no transaction.** `@Transactional()` stays on the command; the service runs
  inside that boundary, which is what makes the locking reads it performs the command's own locks.
- **stateless helpers stay module-level.** `assertApplied` and `pickStated` inject nothing, so
  putting them on the class would force commands that need only them to take the whole service.

Unit-test the commands over the _real_ service with repository doubles beneath it, not over a double
of the service: the cases are about the rule being enforced, not about the call being made. See
`purchase-drafts/usecases/commands/purchase-draft-assembly.spec.ts`.

### Use cases

Use cases are the application boundary and have three categories:

- `commands/` perform writes, including validating an intention and enqueueing asynchronous work;
- `queries/` return data without changing business state;
- `events/` coordinate application behavior caused by a consumed event.

A use case owns the rules of the operation it names, holds its own `@Transactional()` boundary, and
declares the input and result types of that operation in its own file. It may coordinate services,
domain objects, concrete repositories, shared abstractions, and other infrastructure ports. It must
not depend on REST DTO classes, controllers, BullMQ handler classes, TypeORM entities,
QueryBuilder, or other TypeORM APIs.

**A use case must not be a pass-through.** A command whose `execute` only forwards its arguments to
one collaborator's method holds no rule, so it is a layer without a responsibility: the rules belong
in the command itself, next to the boundary that decides them. Two shapes are the tell — a command
whose body is a single `return this.<something>.<method>(...)` with the arguments unchanged, and a
service method that exactly one command calls. Correct both by moving the rules into the command and
deleting the collaborator, keeping only what "Services" above justifies extracting.

### REST

REST controllers translate HTTP input into use-case input and translate results into HTTP output.
They invoke commands or queries only. They contain no business rules and never access services,
repositories, database models, queues, or another module's controller directly.

Every REST request and response shape is defined as a Zod schema in `packages/contracts` and
imported through a package subpath. Files in `rest/dtos/` are thin NestJS adapters created with
`createZodDto`; they must not redefine the network shape. Follow
[Adding and using contracts](guides/adding-and-using-contracts.md).

Server predicates, typed errors, assertion factories, propagation, and global NestJS exception
mapping follow [Server error handling](guides/server-error-handling.md).

Authentication and transport-level authorization use NestJS guards from `shared/guards/`. Guards
must not be placed inside feature modules. A handler declares the Permission it requires, and any
Permission its projection observes, as metadata the guard reads; follow
[Server request authorization](guides/server-request-authorization.md).

### BullMQ handlers

`handlers/jobs.controller.ts` consumes BullMQ jobs and invokes commands. A job payload describes a
write intention; the handler does not implement that write itself.

`handlers/event.controller.ts` consumes BullMQ-delivered events and invokes event use cases. Both
handler types validate untrusted queue payloads before invoking a use case and contain only queue
acknowledgement, retry, logging, and input-mapping concerns.

## Dependency direction

```text
REST controllers ----\
                      +--> commands / queries / event use cases
BullMQ handlers ------/                 |
                                        +--> domain services
                                        +--> concrete repositories
                                        +--> shared abstractions

concrete repositories ---------------------> TypeORM / PostgreSQL
```

Dependencies point inward. In particular:

- controllers and handlers call use cases, not repositories or business services;
- services never call use cases;
- domain code never depends on application, transport, queue, or persistence code;
- persistence access stays inside specialized concrete repositories;
- shared repositories never depend on dedicated feature modules;
- feature mappers translate between domain and persistence models above the repository boundary;
- modules communicate through exported use-case modules, explicit services, or events, not through
  another module's controller or persistence implementation.

Avoid circular module imports. Do not use `forwardRef()` to conceal an ownership problem; extract a
shared abstraction or use an event when the dependency is genuinely cross-module.

## NestJS modules and exports

Each feature owns a `UsecaseModule` and may own a `RestModule` and `HandlerModule`. Its public
barrel exports only modules that exist and are required by a runtime:

```ts
export { InventoryUsecaseModule } from './usecases/usecase.module.js';
export { InventoryRestModule } from './rest/rest.module.js';
export { InventoryHandlerModule } from './handlers/handler.module.js';
```

If the feature has no BullMQ consumers, do not create or export a handler module. Apply the same
rule to REST functionality.

`SharedModule` may use NestJS `@Global()` for shared infrastructure providers such as configuration,
logging, database connections, or queue connections. Plain entities, repositories, schemas, and
TypeScript types are shared through imports and do not need Nest registration. Global
providers must not become a service locator or a way to hide feature dependencies.

Structured application logging follows the accepted
[Pino logging ADR](adr/27-07-2026-structured-logging-with-pino.md). Configure it in
`shared/logger/app-logger.module.ts`; application providers inject `PinoLogger` and set their class
name as context. The server uses these structured logs instead of telemetry; do not add telemetry
SDKs, tracing, metrics exporters, collectors, or feature-specific telemetry abstractions. See the
accepted [logging instead of telemetry ADR](adr/03-08-2026-structured-logging-instead-of-telemetry.md).

## Events

Each server-internal event has one Zod schema as its source of truth under
`src/shared/events/<event-name>/`; infer its TypeScript type from that schema:

```ts
export const ItemCreatedEventSchema = z.object({
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  itemId: z.string().uuid(),
});

export type ItemCreatedEvent = z.infer<typeof ItemCreatedEventSchema>;
```

Producers and consumers import the same schema and validate at queue boundaries. Include stable
event identity and occurrence time so consumers can implement idempotency and diagnostics. When an
event crosses the server application boundary or is consumed by another package/application,
promote its schema to `packages/contracts` rather than keeping it server-local.

## Persistence

PostgreSQL and TypeORM are current infrastructure. `AppModule` configures the connection from
`DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, and `DATABASE_NAME`.
Runtime synchronization is disabled: all schema changes use reviewed TypeORM migrations. New
repositories must follow
[Creating a server repository](guides/creating-a-server-repository.md): place the concrete class in
`shared/domain/repositories/` and shape it around a cohesive persistence operation rather than a
single entity. Prefer one optimized query, database operation, or public method when the operation
spans several entities. Do not extend `BaseRepository`. Callers inject the concrete repository.
The repository operates only on shared persistence types and remains independent of feature
modules. Put domain/persistence conversion in the owning feature's `domain/mappers/` directory and
invoke it from a use case or feature domain service. Query builders must not leak beyond
repositories.

## Shared utilities and types

- Use Lodash in both server and web application code for collection, object, and other
  data-structure transformations when it supplies the operation. Prefer a directly imported
  Lodash function over a hand-written imperative loop or custom data-structure helper.
- Reuse `@warehouser/utils` before adding a utility to the server.
- Move a framework-neutral utility to `packages/utils/src` when it is or should be useful outside
  the server; expose it through that package's established subpath pattern.
- Put server-wide interfaces in `src/shared/types/` only when they are server-internal.
- Put TypeScript types shared across applications in `packages/shared-types`.
- Do not move feature business concepts to a shared location solely to shorten imports.

## Testing

Colocate unit and integration test files with the production code they cover. Reserve `src/test/`
for reusable test support:

- `factories/` builds valid entities and value objects with overridable fields;
- `fixtures/` contains stable profiling and scenario data;
- `expects/` contains custom Jest matchers and assertion helpers;
- `mocks/` contains HTTP request and infrastructure test doubles.

Test domain rules without NestJS. Test use cases with controlled repository doubles. Test REST
validation and mapping at the controller/application boundary. Test BullMQ
handlers for payload validation, delegation, idempotency behavior, retry classification, and
failure behavior once BullMQ is installed.

Before completing server work, run:

```sh
pnpm --filter @warehouser/server lint
pnpm --filter @warehouser/server test
pnpm --filter @warehouser/server build
```

### Running the integration tier

Integration specs are named `*.integration.spec.ts`. The suffix is what separates the two
commands: `jest.config.cjs` excludes it by path, so the unit tier above never touches a database,
and `jest.pglite.config.cjs` opts it back in. Naming a spec that way is the whole opt-in — there
is no environment flag to remember, and an integration spec cannot be run against a developer's
own database by accident. To run them:

```sh
pnpm --filter @warehouser/server test:integration
```

No Docker, no database to create, nothing to point at. `src/test/pglite/global-setup.ts` applies
the migrations once, dumps the result, and every test file restores its own database from that
dump — the PGlite equivalent of `CREATE DATABASE ... TEMPLATE`. Restoring costs roughly 170 ms,
which is what makes a database _per test file_ affordable.

That per-file isolation is why nothing has to coordinate cleanup across suites: a suite cannot
corrupt a database no other suite shares.

Specs are not aware of any of it. `jest.pglite.config.cjs` uses `moduleNameMapper` to swap two
production modules for PGlite-backed equivalents:

| Production module                 | Replaced by                             |
| --------------------------------- | --------------------------------------- |
| `shared/database/data-source`     | `test/pglite/pglite-data-source.ts`     |
| `shared/database/typeorm.options` | `test/pglite/pglite-typeorm.options.ts` |

Both build on the single driver in `test/pglite/pglite-driver.ts`. Mapping _both_ matters: the
second is what `AppModule` uses, so without it an HTTP contract spec would seed its fixtures into
PGlite while the application under test read from a real PostgreSQL server, and every
authenticated request would come back 401.

The driver is deliberately in-process rather than reached over `pglite-socket`. Routing statements
through the socket's query queue hits open upstream defects around transactions and error
recovery (electric-sql/pglite #958, #985, #1046), which show up as rolled-back rows reappearing,
aggregates returning no rows at all, and suites hanging — non-deterministically.

Two consequences of the in-process driver are worth knowing:

- The tier runs under `NODE_OPTIONS=--experimental-vm-modules` (already in the `test:integration`
  script). PGlite loads its WebAssembly through a dynamic `import()`, which Jest's VM context
  refuses without that flag.
- `pglite-driver.ts` re-registers a `bigint` parser so `count(*)` yields a string, as
  `node-postgres` does. Without it a spec asserting `{ count: '1' }` sees `{ count: 1 }` and fails
  for a reason unrelated to what it tests.

### What this tier cannot test

PGlite is PostgreSQL compiled to WebAssembly, running in the single-user mode Postgres normally
reserves for recovery. It is real Postgres — isolation levels, `TRUNCATE ... CASCADE` across
several tables, deferred foreign keys and injected-failure rollbacks all behave correctly — but it
has exactly **one backend**, so only one query executes at a time no matter how many connections
are open. Note it is currently PostgreSQL 18, one major version ahead of the `postgres:17-alpine`
production uses.

**Concurrency is therefore out of scope for the automated suite, by decision.** A spec that needs
two backends racing each other cannot be expressed here:

- Opening a second `QueryRunner` and polling `pg_stat_activity` until the first backend is blocked
  on a lock self-deadlocks — the second runner _is_ the first backend.
- A race asserting "two simultaneous writes, exactly one winner" silently passes for the wrong
  reason: PGlite serializes the two calls, so both succeed and the proof evaporates.

The repository previously carried such specs against a real PostgreSQL server. They were removed
along with the load smokes, which asserted p95 latency and throughput that only mean something
against the server the application actually runs on. Do not add specs of either kind back without
reintroducing a real-PostgreSQL tier to run them in — in this suite they would pass without
proving anything, which is worse than not having them.
