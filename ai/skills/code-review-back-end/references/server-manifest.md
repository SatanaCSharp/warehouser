# Server document manifest — changed-path selector

A starting selector, **not** the source of truth. `docs/system/server-index.md` is authoritative
(`AGENTS.md`); read it in full every run and re-derive anything this table does not cover from the
index's own «when it applies» descriptions. When the two disagree, the index wins — and report the
disagreement so this file can be corrected.

Paths below are relative to `docs/system/`.

## Always read (the floor, every run)

| Document                                         | Why it is always in the manifest                                 |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `server-architecture.md`                         | The owning architecture document for `apps/server`.              |
| `architecture-map.md`                            | Container ownership — which app owns the responsibility at all.  |
| Every **Accepted** ADR in the index's §Decisions | Accepted decisions outrank guides and code (shared protocol §3). |

Read `sad.md` as well whenever the change crosses out of `apps/server` or you need the rationale
behind a server rule.

## Selector — changed path → additional documents

| Changed path (under `apps/server/`)                                                                               | Add to the manifest                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A new top-level module, a moved use case or controller, a new cross-module dependency, a module barrel `index.ts` | `guides/adding-a-server-module.md`; ADR `14-08-2026-domain-owned-flat-modules.md`                          |
| `usecases/`, `domain/`, `rest/`, a handler                                                                        | `server-architecture.md` §layer responsibilities and dependency direction                                  |
| `shared/domain/repositories/`, any new TypeORM persistence access                                                 | `guides/creating-a-server-repository.md`; ADR `21-07-2026-postgresql-with-typeorm.md`                      |
| A TypeORM entity, a migration, any schema change                                                                  | ADR `21-07-2026-postgresql-with-typeorm.md`; `server-architecture.md` §persistence                         |
| A `try/catch`, a thrown or custom error, a predicate, the exception filter, `shared/errors/`                      | `guides/server-error-handling.md`; ADR `24-07-2026-server-error-handling.md`                               |
| Any logging call, a logger instance, `shared/logger/`                                                             | ADRs `27-07-2026-structured-logging-with-pino.md`, `03-08-2026-structured-logging-instead-of-telemetry.md` |
| A diagnostics, tracing, metrics, or collector dependency                                                          | ADR `03-08-2026-structured-logging-instead-of-telemetry.md` (and `AGENTS.md`: no telemetry)                |
| A REST request/response shape, `rest/dtos/`, `createZodDto`, `packages/contracts/`                                | `guides/adding-and-using-contracts.md`; ADR `12-07-2026-schema-validation-with-zod.md`                     |
| Any validation, a decorator-based DTO, another validation library                                                 | ADR `12-07-2026-schema-validation-with-zod.md`                                                             |
| `shared/guards/`, `shared/access/`, `shared/decorators/`                                                          | ADR `14-08-2026-domain-owned-flat-modules.md` (guards stay in `shared/`); `server-architecture.md` §shared |
| `shared/queue/`, a worker-runtime entry point, an emitted or handled event                                        | `server-architecture.md` §runtimes and events; `sad.md` §asynchronous work                                 |
| `*.spec.ts`, `*.integration.spec.ts`, `module-boundaries.spec.ts`, `src/test/`                                    | `server-architecture.md` §testing                                                                          |

## Crossover

A diff that also touches `apps/web/` is reviewed there by
[`../../code-review-front-end`](../../code-review-front-end/SKILL.md). For a shared
`packages/contracts` file, this skill judges the server-side declaration and its `createZodDto`
adaptation in `rest/dtos/`; the web consumption is the front-end skill's.
