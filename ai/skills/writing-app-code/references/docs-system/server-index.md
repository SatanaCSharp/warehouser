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
- [Server request authorization](guides/server-request-authorization.md) — the declarative
  authorization stage: `SessionAuthGuard` followed by the Warehouse or Workspace level guard, the
  Permission each handler declares, the principal each guard attaches, archived-Warehouse tolerance,
  and `@ObservedPermission` — a Permission resolved for a use case that by construction can neither
  deny nor admit a request at the guard, and that the use case may read only to **narrow** an
  already-admitted request, whether by withholding a projection's field or by refusing a write whose
  payload requires a capability the actor does not hold. Use whenever a handler must be authorized,
  whenever a response's contents depend on a Permission the read does not require, whenever a
  write's required capability depends on what its payload carries, and before adding a guard or a
  Permission declaration.
- [Server error handling](guides/server-error-handling.md) — predicates as named conditions, typed
  errors and assertion factories, propagation without routine `try/catch`, the global NestJS
  exception filter, logging, and safe REST error responses. Use whenever code can fail, reject a
  business rule, or must return an error to a client.
- [Server use case boundaries](guides/server-use-case-boundaries.md) — what may surround a command
  or query: nothing. No wrapper around `execute`, no timing or other measurement in production code,
  and no error mapped to another type before the global filter. Use whenever writing or changing a
  use case, and always before adding a `with*` helper, an interceptor, a logger parameter, or a
  `try/catch` that re-raises.

## Shared with the web

- [Adding and using contracts](guides/adding-and-using-contracts.md) — when a Zod schema belongs in
  `packages/contracts` versus staying local, and how to add one and adapt it with `createZodDto` in
  `rest/dtos/`. Use for every REST request and response shape.
- [Linting with oxlint](guides/linting-with-oxlint.md) — the repository's only linter and how to
  work with it: the four ways to run it and why `pnpm lint` and `pnpm lint:all` are different runs,
  why `--type-aware` is never optional, where the shared configuration lives and the three silent
  traps in changing it, how to suppress a rule (and why oxlint's rule prefixes are not ESLint's —
  `react/rules-of-hooks`, not `react-hooks/…`), and what the linter deliberately does not own. Read
  before changing a lint rule, adding a disable comment, or acting on a lint failure you do not
  recognize.
- [Exploring the codebase with CodeGraph and Repomix](guides/exploring-the-codebase-with-codegraph-and-repomix.md)
  — how to locate code before reading it: `pnpm graph:init`/`graph:sync` to keep the symbol index
  fresh, the query → `node` → read-the-fragment → snapshot order that keeps exploration to a line
  range instead of a directory, the CodeGraph commands (`query`, `node`, `callers`, `impact`,
  `affected`), Repomix snapshots and their per-run flags, why telemetry is forced off, and what must
  never enter a snapshot (`.env*`, `.pen`, `--no-security-check`, `--no-gitignore`). Read before
  exploring unfamiliar code, and before opening a third file hunting the same symbol.

## Decisions

- [Scope-of-exercise tiebreak for sole-consumer slices](adr/18-08-2026-scope-of-exercise-placement-tiebreak.md)
  — **Accepted; this is the decision that governs placement.** Keeps the owning-entity rule below as
  the default and adds one tiebreak: where a slice's sole consumer exercises its capabilities at
  another scope, placement follows the scope of exercise. Read before creating a module, placing a
  file in one, or importing across module boundaries. Cite this ADR rather than its predecessor.
- [Domain-owned flat modules](adr/14-08-2026-domain-owned-flat-modules.md) — **Superseded** by the
  decision above, and preserved as the record of why a module is named for the domain entity that
  owns its behavior, why one entity owns one top-level module and modules do not nest, why a
  module's URL prefix and its owning module may disagree, and why guards, TypeORM entities and
  repositories stay in `shared/`. Everything it decides still holds except the owning-entity
  tiebreak the successor narrows; read it for the reasoning, and the successor for the rule.
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
- [Replace ESLint with oxlint](adr/11-09-2026-oxlint-replaces-eslint.md) — **Accepted; this is the
  decision that governs linting.** oxlint is the only linter, Prettier the only formatter; three
  shared layers in `@warehouser/oxlint-config` replace the three ESLint config packages, composed in
  JavaScript because oxlint's `extends` drops each rule's options. Records what was lost with it —
  `react/no-deprecated`, `import/order`, `no-restricted-syntax` (now a spec), `max-nested-callbacks`
  (off pending an oxlint defect) — and why two ESLint plugins still run through an alpha bridge that
  forces an exact version pin. Read before proposing a rule change or a linter dependency bump.
