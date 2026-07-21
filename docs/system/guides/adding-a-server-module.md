# Adding a Server Module

Use this guide when adding an entity-related feature to `apps/server`. Read
[Server architecture](../server-architecture.md) and
[Adding and using contracts](adding-and-using-contracts.md) first.

## 1. Choose the owner

Name the module for the business entity or cohesive business capability that owns the behavior,
for example `inventory`, `warehouse`, or `shipment`. Extend an existing owner instead of creating a
second module for the same entity. Do not begin in `shared/`; promote an abstraction only after its
cross-module responsibility is clear.

## 2. Create only the required structure

```text
src/inventory/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   └── repositories/
├── services/
├── usecases/
│   ├── commands/
│   ├── queries/
│   ├── events/             # only when consuming events
│   └── usecase.module.ts
├── rest/                   # only when exposing REST endpoints
│   ├── controllers/
│   ├── dtos/
│   └── rest.module.ts
├── handlers/               # only when consuming BullMQ jobs/events
│   ├── jobs.controller.ts
│   ├── event.controller.ts
│   └── handler.module.ts
└── index.ts
```

Omit empty directories, controllers, and NestJS modules.

## 3. Define domain and persistence boundaries

Add entities and value objects without NestJS or persistence decorators. Define repository ports
in `domain/repositories/` and inject those ports into services or use cases. Keep the TypeORM
implementation behind the port so persistence details do not leak into callers.

Place TypeORM persistence entities and repository adapters in a feature-owned infrastructure
directory. Add schema changes as timestamped migration classes under
`apps/server/migrations/`; generate, review, apply, and revert them with the server's
`migration:*` scripts. Runtime synchronization must remain disabled.

Do not return persistence documents from a repository. Map them to domain entities or explicit
application result types inside the persistence adapter.

## 4. Implement the application use cases

Put writes in `usecases/commands/` and reads in `usecases/queries/`. Put behavior triggered by
consumed events in `usecases/events/`.

A use case may coordinate domain services and repository ports. Reuse a service when it owns a
business rule; do not repeat that rule in a controller, handler, or use case. A service must not
call a command, query, or event use case.

Register the use cases and their dependencies in `usecases/usecase.module.ts`. Export only the
providers that a transport adapter or another deliberately coupled module needs.

## 5. Add a REST adapter when required

Define every request and response schema in `packages/contracts/src/<module-name>/`. Expose it via
the contract package's module subpath, then create a thin DTO adapter:

```ts
import { CreateItemRequestSchema } from '@warehouser/contracts/inventory';
import { createZodDto } from 'nestjs-zod';

export class CreateItemDto extends createZodDto(CreateItemRequestSchema) {}
```

The REST controller validates/maps input, invokes a command or query, and maps the result. It must
not call a repository, persistence model, queue, or business service directly.

Create `rest/rest.module.ts`, import the feature's `UsecaseModule`, and export the REST module from
the feature barrel only when the feature has REST endpoints.

## 6. Add BullMQ adapters when required

BullMQ and Redis are planned dependencies. Do not add placeholder handlers until the infrastructure
exists and the feature needs asynchronous behavior.

For a job:

1. Define the write behavior as a command.
2. Define and validate the job payload at the queue boundary.
3. Consume it in `handlers/jobs.controller.ts`.
4. Delegate immediately to the command.

For an event:

1. Define its Zod schema in `src/shared/events/<event-name>/`.
2. Infer and export its TypeScript type from the schema.
3. Implement the reaction in `usecases/events/`.
4. Validate and consume it in `handlers/event.controller.ts`.
5. Delegate immediately to the event use case.

Create and export `handlers/handler.module.ts` only when at least one BullMQ consumer exists.
Scheduled work must be represented as BullMQ scheduled/repeatable jobs, not a separate NestJS cron.

## 7. Wire the correct runtime

- Import the feature REST module into `RestAppModule` only.
- Import the feature handler module into `WorkerAppModule` only.
- Import the feature use-case module wherever its application API is required.
- Do not import REST controllers into the worker process or BullMQ consumers into the REST process.

While the server still has the single `AppModule`, preserve these boundaries in feature modules so
the later entry-point split is mechanical.

## 8. Reuse shared code deliberately

Check `packages/utils/src` before adding a helper. Move a generally useful framework-neutral helper
there and expose it through an existing or new package subpath. Keep server-only shared interfaces
in `src/shared/types/`; use `packages/shared-types` when another application or package owns a real
consumer.

Use `src/shared/domain/` only for genuine cross-module pure fabrications. Do not place feature-owned
entities or repositories there pre-emptively.

## 9. Add tests

Colocate tests with the implementation. Reuse or add shared support under:

```text
src/test/factories/
src/test/fixtures/
src/test/expects/
src/test/mocks/
```

Cover domain invariants, command/query behavior, repository-port interactions, boundary validation,
and transport delegation. For asynchronous consumers, also cover invalid payloads, duplicate
delivery/idempotency, retryable failures, and permanent failures.

## 10. Verify

From the repository root:

```sh
pnpm --filter @warehouser/server lint
pnpm --filter @warehouser/server test
pnpm --filter @warehouser/server build
```

When contracts or shared utilities change, build and test their packages as well.

## Common failures

- Putting business logic in a REST controller or BullMQ handler.
- Calling repositories directly from transport adapters.
- Letting services call commands or queries.
- Exposing TypeORM entities outside persistence adapters.
- Defining REST request or response fields again in a server-local DTO.
- Creating empty handler or REST modules for symmetry.
- Registering both an in-process cron and a BullMQ schedule.
- Moving feature-owned code to `shared/` before another module needs it.
- Duplicating a utility that already exists in `@warehouser/utils`.
