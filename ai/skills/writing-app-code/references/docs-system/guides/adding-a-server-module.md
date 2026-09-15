# Adding a Server Module

Use this guide when adding an entity-related feature to `apps/server`. Read
[Server architecture](../server-architecture.md) and
[Adding and using contracts](adding-and-using-contracts.md) first. When the module needs
persistence, also follow [Creating a server repository](creating-a-server-repository.md).

## 1. Choose the owner

Name the module for the business entity or cohesive business capability that owns the behavior,
for example `inventory`, `warehouse`, or `shipment`. Ownership follows the entity whose invariants
the code enforces — not the entity that contains it, and not the URL prefix it is served under.
`@Controller` prefixes are declared independently of source location, so a module's URL and its
owning module are allowed to disagree. Extend an existing owner instead of creating a second module
for the same entity. Do not begin in `shared/`; promote an abstraction only after its cross-module
responsibility is clear.

Modules are flat. The module list is exactly the directories directly under `src/`; only those have
a name, a barrel and a public surface. A module contains layer directories (`domain/`, `usecases/`,
`rest/`, `handlers/`), never another module. A module that seems to need a submodule is a module
that should become its own top-level sibling.

A capability exercised at several scopes lives in one module and carries the use cases, controllers
and endpoints for every scope. Workspace-scoped and warehouse-scoped access management are one
`access` module, not two; the scope appears in file and symbol names
(`AssignWorkspaceRoleCommand`), never in a second module.

Management is owned by a feature module; **enforcement is not**. NestJS authentication and
authorization guards stay in `apps/server/src/shared/guards/`, TypeORM persistence entities in
`apps/server/src/shared/domain/entities/`, and repositories in
`apps/server/src/shared/domain/repositories/`. Registering a guard in a module is not owning it, and
no module should gain a dependency on another module merely to obtain a guard.

The decision behind these rules, and its consequences, are recorded in
[Domain-owned flat modules](../adr/14-08-2026-domain-owned-flat-modules.md). Read it before adding a
module, deciding which module a use case or controller belongs to, or adding a cross-module
dependency.

## 2. Create only the required structure

```text
src/inventory/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── errors/
│   ├── mappers/
│   └── services/
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

Add domain entities and value objects without NestJS or persistence decorators. Put TypeORM
entities under `apps/server/src/shared/domain/entities/`. Create concrete repositories under
`apps/server/src/shared/domain/repositories/` and specialize each repository around a cohesive
persistence operation as described in
[Creating a server repository](creating-a-server-repository.md). A repository may operate on
several entities when one query, database operation, or method is more efficient. Inject concrete
repositories into services or use cases; do not add repository ports, a `BaseRepository`, or
feature-owned persistence adapters.

Repositories in `shared/domain/repositories/` must not import from or otherwise know about a
dedicated feature module. They accept and return shared persistence entities and
persistence-oriented values only. Put mappings between shared TypeORM entities and feature domain
objects in `apps/server/src/<feature-name>/domain/mappers/`. Call mappers such as `toSession` and
`toSessionEntity` from a use case or feature domain service above the repository, never from the
repository itself.

Add schema changes as timestamped migration classes under `apps/server/migrations/`; generate,
review, apply, revert, and apply them again with the server's `migration:*` scripts. Runtime
synchronization must remain disabled. Do not write tests for migrations.

## 4. Implement the application use cases

Put writes in `usecases/commands/` and reads in `usecases/queries/`. Put behavior triggered by
consumed events in `usecases/events/`.

A use case owns the rules of its own operation, injects the concrete repositories it writes through,
and holds its own `@Transactional()` boundary. Do not put those rules in a service the use case
merely forwards to: a command whose `execute` only passes its arguments on to one collaborator holds
no rule and is a layer without a responsibility (server-architecture.md, "Use cases").

Extract into `<feature-name>/domain/services/` only when more than one use case needs the same
operation, when another module must invoke it through this module's exported provider, or when a
single use case has grown too large to read. A shared operation that reaches a repository is a
service, so the repository is injected once instead of being threaded through every caller; a shared
helper that needs no collaborator at all stays a plain exported function. Register the service as a
provider of `usecase.module.ts` and leave it out of `exports` unless another module calls it.
server-architecture.md, "Worked example: a shared-check service", shows the whole shape.

Reuse a service when it owns a business rule; do not repeat that rule in a controller, handler, or
use case. A service must not call a command, query, or event use case, and carries no
`@Transactional()` of its own when it runs inside a use case's boundary.

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

Use Lodash for collection, object, and other data-structure operations when it provides the
operation. Import the needed Lodash function directly and prefer it to a hand-written imperative
loop or a new custom helper.

Use `src/shared/domain/` only for genuine cross-module pure fabrications. Do not place feature-owned
entities or repositories there pre-emptively.

A module's error factories, domain predicates and DTOs are **module-private**. Another module
reaches them only through an exported use-case module — never by importing
`<module>/domain/errors/`, `<module>/domain/*.predicates.ts` or `<module>/rest/dtos/` directly. When
a second module needs the behavior behind one of them, export a use case that performs it, or move
the shared concept to `src/shared/`; do not widen an import into another module's internals.

## 9. Add tests

Colocate tests with the implementation. Reuse or add shared support under:

```text
src/test/factories/
src/test/fixtures/
src/test/expects/
src/test/mocks/
```

Cover domain invariants, command/query behavior, repository interactions, boundary validation,
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

- Putting an entity's use cases in the module of the entity that contains it — warehouse lifecycle
  under `workspaces/` because a Workspace contains Warehouses.
- Splitting one capability across two modules by the scope that invokes it.
- Importing another module's error factory, domain predicate, or DTO instead of an exported use-case
  module.
- Putting business logic in a REST controller or BullMQ handler.
- Calling repositories directly from transport adapters.
- Letting services call commands or queries.
- Writing a pass-through use case — a command whose `execute` only forwards its arguments to one
  service method, or a service method exactly one command calls.
- Exposing TypeORM entities outside persistence adapters.
- Defining REST request or response fields again in a server-local DTO.
- Creating empty handler or REST modules for symmetry.
- Registering both an in-process cron and a BullMQ schedule.
- Moving feature-owned code to `shared/` before another module needs it.
- Importing a feature module or feature-owned domain type from a shared repository.
- Mapping between persistence and feature domain objects inside a repository.
- Placing a feature domain service outside `<feature-name>/domain/services/`.
- Duplicating a utility that already exists in `@warehouser/utils`.
- Extending `BaseRepository` or splitting a cohesive multi-entity persistence operation into
  table-shaped repositories.
