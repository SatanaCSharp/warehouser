# Server document selector — what you are about to write → what you must read

For production source under `apps/server/src`. Paths are relative to `docs/system/` (equivalently
`./docs-system/` inside this skill).

This table is a **starting selector, not the source of truth**. `docs/system/server-index.md` is
authoritative (`AGENTS.md`); read it in full every run and re-derive anything this table does not
cover from the index's own «when it applies» descriptions. When the two disagree, the index wins —
and report the disagreement so this file is corrected on the next
[`/sync-architecture-references`](../../../commands/sync-architecture-references.md) run.

Test files are out of scope for this skill; `server-architecture.md` §testing owns them.

## The floor — always read, every run

| Document                              | Why it is always in the manifest                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `server-index.md`                     | The authoritative list of what governs `apps/server`, and the source of this table.       |
| `server-architecture.md`              | The owning architecture document: runtimes, layers, dependency direction.                 |
| `architecture-map.md`                 | Container ownership — whether `apps/server` owns the responsibility at all.               |
| The Accepted ADRs the change triggers | An Accepted decision outranks a guide, and both outrank sibling code. Which ones — below. |

Add `sad.md` whenever the change leaves `apps/server` or you need the rationale behind a server rule.

### Which ADRs the change triggers

Every entry in `server-index.md` §Decisions ends with a **«Read before …»** sentence naming what
triggers it — _"Read before any schema or migration work"_, _"Read before adding a `try/catch` block
or a custom error class"_, _"Read before adding any logging call or logger instance"_. **That
sentence is the selector.** An Accepted ADR whose trigger your change matches is mandatory and is
read in full; one whose trigger it does not match is not. The selector table below already names the
common ones per path.

Three qualifications, and they are what keep this from becoming a licence to skip:

- **When the trigger sentence is arguable, read the ADR.** Reading one you did not strictly need
  costs a few thousand tokens; missing one costs a rewrite. Ambiguity resolves toward reading.
- **Creating a file, moving one, or importing across a module boundary always triggers
  `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`**, whatever else the change does.
  Placement is decided before the file exists and is the expensive half of the mistake.
- **A Superseded ADR is never in the floor.** `adr/14-08-2026-domain-owned-flat-modules.md` is
  Superseded; the index routes to it for reasoning only, and the rule is its successor's.

## Selector — what the change touches → add to the manifest

| You are writing or changing                                                                             | Read as well                                                                                                                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A new top-level module, a module barrel `index.ts`, a moved use case or controller                      | `guides/adding-a-server-module.md`; `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`                                         |
| A new cross-module dependency, or a decision about which module owns behavior                           | `adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` (`adr/14-08-2026-domain-owned-flat-modules.md` for the reasoning); `sad.md` |
| Anything under `usecases/` — a command, a query, the shape around `execute`                             | `guides/server-use-case-boundaries.md` (nothing may surround `execute`); `server-architecture.md` §layers                            |
| A `with*` helper, an interceptor, a timing or measurement call, a logger parameter on a use case        | `guides/server-use-case-boundaries.md` **before writing it**                                                                         |
| `domain/` — services, predicates, mappers, domain errors                                                | `server-architecture.md` §layer responsibilities and dependency direction                                                            |
| `rest/` — a controller, a route, a handler                                                              | `server-architecture.md` §REST; `guides/server-request-authorization.md`                                                             |
| `rest/dtos/`, `createZodDto`, any request or response shape, `packages/contracts/`                      | `guides/adding-and-using-contracts.md`; `adr/12-07-2026-schema-validation-with-zod.md`                                               |
| Any validation, a decorator-based DTO, another validation library                                       | `adr/12-07-2026-schema-validation-with-zod.md`                                                                                       |
| A guard, a Permission declaration, `@ObservedPermission`, `access/`, `shared/guards/`, `shared/access/` | `guides/server-request-authorization.md`                                                                                             |
| A response whose contents depend on a Permission, or a write whose payload decides the capability       | `guides/server-request-authorization.md` §`@ObservedPermission` (narrow only; never admit or deny)                                   |
| **Any** `try`/`catch`, a thrown or custom error, a predicate, `shared/errors/`, the filter              | `guides/server-error-handling.md`; `adr/24-07-2026-server-error-handling.md` **before writing it**                                   |
| `shared/domain/repositories/`, any new TypeORM persistence access                                       | `guides/creating-a-server-repository.md`; `adr/21-07-2026-postgresql-with-typeorm.md`                                                |
| A TypeORM entity, a migration, any schema change                                                        | `adr/21-07-2026-postgresql-with-typeorm.md`; `server-architecture.md` §persistence                                                   |
| Any logging call or logger instance, `shared/logger/`                                                   | `adr/27-07-2026-structured-logging-with-pino.md`                                                                                     |
| Anything diagnostic — tracing, metrics, an exporter, a collector, a telemetry dependency                | `adr/03-08-2026-structured-logging-instead-of-telemetry.md` (and `AGENTS.md`: agents add no telemetry)                               |
| `shared/queue/`, a worker-runtime entry point, an emitted or handled event                              | `server-architecture.md` §runtimes and events; `sad.md` §asynchronous work                                                           |
| `shared/` anything else — config, decorators, pagination, predicates                                    | `server-architecture.md` §shared utilities; `adr/14-08-2026-domain-owned-flat-modules.md`                                            |
| A lint suppression, a rule change, an unfamiliar lint failure                                           | `guides/linting-with-oxlint.md`; `adr/11-09-2026-oxlint-replaces-eslint.md`                                                          |
| Locating any of the above in existing code                                                              | `guides/exploring-the-codebase-with-codegraph-and-repomix.md`                                                                        |

## Crossover

A change that also touches `apps/web/src` selects from [`./web-manifest.md`](./web-manifest.md) as
well — both indexes, not the nearer one. For a shared `packages/contracts` file, this table governs
the server-side declaration and its `createZodDto` adaptation in `rest/dtos/`; the web consumption is
the web table's.

## Before committing

`.husky/pre-commit` runs `pnpm --filter @warehouser/server test:architectural` whenever any
`apps/server/src/**/*.ts` file is staged. It asserts where mappers live and how they are written, so
run it yourself rather than discovering it at commit time (`AGENTS.md` §Committing).
