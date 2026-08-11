# Server Documentation Index

Table of contents for every `docs/system` document that governs work in `apps/server`. Read this
index first, then read only the entries that cover the change you are making. Paths are relative to
`docs/system/`.

## Architecture

- [Server architecture](server-architecture.md) — target structure and dependency rules for the
  NestJS modular monolith: the REST and worker runtimes, the `src/` layout, domain/service/use-case/
  REST/handler responsibilities, inward dependency direction, module exports, events, persistence,
  shared utilities, and testing. Read before any `apps/server` change, and always before adding a
  module, layer, provider, or cross-module dependency.
- [System architecture description](sad.md) — repository-wide context, solution strategy, and
  cross-cutting concepts (contracts, server modules and asynchronous work, logging). Read when a
  change touches more than `apps/server` or when you need the rationale behind a server rule.
- [Architecture map](architecture-map.md) — the containers that exist (`apps/server`, `apps/web`,
  `packages/*`), what each owns, and how they depend on one another. Read when you need to locate
  code or decide which container owns a responsibility.

## Guides

- [Adding a server module](guides/adding-a-server-module.md) — end-to-end procedure for a new
  entity-related feature module: choose the owner, create only the structure that has behavior, wire
  use cases, REST, and handlers, and export the module barrel. Use when adding a feature module or
  deciding whether to extend an existing one.
- [Creating a server repository](guides/creating-a-server-repository.md) — how to design a
  specialized concrete repository in `shared/domain/repositories/` shaped around a cohesive
  persistence operation rather than one table. Use whenever production code needs new TypeORM
  persistence access.
- [Server error handling](guides/server-error-handling.md) — predicates as named conditions, typed
  errors and assertion factories, propagation without routine `try/catch`, the global NestJS
  exception filter, logging, and safe REST error responses. Use whenever code can fail, reject a
  business rule, or must return an error to a client.

## Shared with the web

- [Adding and using contracts](guides/adding-and-using-contracts.md) — when a Zod schema belongs in
  `packages/contracts` versus staying local, and how to add one and adapt it with `createZodDto` in
  `rest/dtos/`. Use for every REST request and response shape.

## Decisions

- [PostgreSQL persistence with TypeORM](adr/21-07-2026-postgresql-with-typeorm.md) — why PostgreSQL
  and TypeORM are the persistence baseline and why runtime schema synchronization stays disabled.
  Read before any schema or migration work.
- [Server error handling with typed errors and a global NestJS filter](adr/24-07-2026-server-error-handling.md)
  — why conditions are named predicates and uncaught failures are mapped once at the HTTP boundary.
  Read before adding a `try/catch` block or a custom error class.
- [Structured server logging with Pino](adr/27-07-2026-structured-logging-with-pino.md) — why one
  centrally configured `nestjs-pino` logger is the single logging mechanism. Read before adding any
  logging call or logger instance.
- [Structured logging instead of telemetry](adr/03-08-2026-structured-logging-instead-of-telemetry.md)
  — why structured logs replace telemetry SDKs, tracing, metrics exporters, and collectors. Read
  before adding any diagnostics dependency.
- [Schema validation with Zod](adr/12-07-2026-schema-validation-with-zod.md) — why Zod replaced
  `class-validator`/`class-transformer` and is the single validation technology. Read before
  introducing another validation library or decorator-based DTO validation.
