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
│   │   ├── entities/                # genuinely cross-module domain abstractions
│   │   └── repositories/            # genuinely cross-module repository ports
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
    │   └── repositories/             # ports, not database implementations
    ├── services/
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

Domain entities and value objects contain framework-independent rules and invariants. Domain code
must not import NestJS, HTTP adapters, BullMQ, TypeORM, or concrete persistence models.

Repository interfaces are domain/application ports. Put a port in a feature's
`domain/repositories/` when that feature owns it. Promote it to `shared/domain/repositories/` only
when its abstraction is intentionally shared by multiple modules. Concrete TypeORM adapters belong
in an infrastructure implementation, never beside the port.

### Services

Services contain reusable business operations and may use domain objects and repository
interfaces. Services must not invoke commands, queries, event use cases, controllers, or handlers.
A use case may access a repository directly for simple coordination, especially a query, but it
must use an existing service when that service owns the relevant business rule.

### Use cases

Use cases are the application boundary and have three categories:

- `commands/` perform writes, including validating an intention and enqueueing asynchronous work;
- `queries/` return data without changing business state;
- `events/` coordinate application behavior caused by a consumed event.

Use cases may coordinate services, domain objects, repository interfaces, shared abstractions, and
other infrastructure ports. They must not depend on REST DTO classes, controllers, BullMQ handler
classes, TypeORM entities, or TypeORM repositories.

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
                                        +--> repository interfaces
                                        +--> shared abstractions

persistence adapters ----------------------> repository interfaces
```

Dependencies point inward. In particular:

- controllers and handlers call use cases, not repositories or business services;
- services never call use cases;
- domain code never depends on application, transport, queue, or persistence code;
- persistence implementations depend on repository interfaces, never the reverse;
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
logging, database connections, or queue connections. Plain entities, repository interfaces,
schemas, and TypeScript types are shared through imports and do not need Nest registration. Global
providers must not become a service locator or a way to hide feature dependencies.

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
domain, service, and use-case code must depend on repository interfaces and must not expose TypeORM
entities, query builders, or database transactions across the persistence boundary.

Keep mapping between persistence records and domain entities inside persistence adapters. Any
feature that depends on database-specific behavior must document that dependency so it can be
revisited during migration.

## Shared utilities and types

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

Test domain rules without NestJS. Test use cases against repository interfaces using controlled
fakes. Test REST validation and mapping at the controller/application boundary. Test BullMQ
handlers for payload validation, delegation, idempotency behavior, retry classification, and
failure behavior once BullMQ is installed.

Before completing server work, run:

```sh
pnpm --filter @warehouser/server lint
pnpm --filter @warehouser/server test
pnpm --filter @warehouser/server build
```
