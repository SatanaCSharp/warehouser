# Server conformance dimensions + dispatch

What the [`reviewer`](../../../agents/reviewer.md) probes over an `apps/server` diff. Every dimension
is answered from a manifest document, never from taste — a finding that cannot name the rule is
dropped. For a small diff one reviewer pass covers all groups; for a large diff fan out one reviewer
per group and merge.

## Group A — module ownership and boundaries

- **Owner.** Is the module named for the domain entity that owns its behavior, and does one entity own
  one top-level module? Modules do not nest.
- **Extend vs create.** Did the change create a module where the guide says to extend an existing one,
  or vice versa?
- **Only structure that has behavior.** No empty `domain/`, `usecases/`, `rest/`, or handler
  directories added speculatively.
- **URL prefix vs owning module.** A disagreement between the two is permitted by the ADR — flag it
  only when the _ownership_ is wrong, not the prefix.
- **Exports.** Does cross-module access go through the module barrel, or reach into internals? Do the
  boundary specs still hold?
- **What stays in `shared/`.** Guards, TypeORM entities, and repositories belong to `shared/`, not to
  a feature module.

## Group B — layers and dependency direction

- Each layer keeps its documented responsibility: domain (rules and types), service, use case
  (orchestration of one operation), REST (transport only), handler (asynchronous entry).
- **Dependencies point inward.** REST and handlers depend on use cases; use cases depend on domain;
  nothing inner imports outward. A framework concern must not leak into domain.
- No business rule decided in a controller, and no transport type reaching the domain.

## Group C — persistence

- A new concrete repository lives in `shared/domain/repositories/` and is shaped around a cohesive
  persistence operation, not around one table's CRUD.
- Production code reaches TypeORM only through such a repository.
- Schema changes are reversible migrations; runtime schema synchronization stays disabled.
- Where the feature's `data-model.md` and staged migrations exist, the committed migration matches
  them.

## Group D — errors, validation, and contracts

- **Conditions are named predicates**; errors are typed and raised through assertion factories.
- **No routine `try/catch`** — failures propagate to the global NestJS exception filter, which maps
  them once at the HTTP boundary. A new `catch` must be one the guide permits.
- REST error responses are safe: no internal detail, no leaked identifier, the documented shape.
- Every REST request and response shape has a contract; a shape crossing web↔server lives in
  `packages/contracts` and is adapted with `createZodDto` in `rest/dtos/`.
- **Zod is the only validation technology** — no `class-validator`/`class-transformer`, no second
  library, no decorator-based DTO validation.

## Group E — logging, async work, and testing

- One centrally configured `nestjs-pino` logger; no ad-hoc logger instance, no `console`.
- Structured logs instead of telemetry — no tracing, metrics exporter, or collector dependency
  (`AGENTS.md` forbids agents adding telemetry outright).
- No secret, token, or credential in a log line.
- Emitted and handled events follow the documented event mechanism and the worker-runtime boundary.
- Tests sit where the architecture document puts them, and integration specs exercise the real
  boundary rather than asserting the mock.

## Dispatch shape

Clean context per [`../../_shared/critic.md`](../../_shared/critic.md): the reviewer has read-only
tools and re-reads the manifest documents itself — no paraphrase. The dispatch prompt carries the
resolved work-item identifier, the diff scope, the full manifest path list, `artifact_language`, and
the instruction to open with `System documents read:`. Findings only, one per line:

```text
- **[blocking|advisory] <headline>** — <file>:<line>; rule: <docs/system/... path> §<heading>;
  problem: <what the code does>; suggested: <the conforming shape>.
```

On an async host, append the report-delivery instruction
([`../../_shared/agent-roster.md`](../../_shared/agent-roster.md)) — an idle signal without the report
is not a verdict. A clean pass returns `ARCHITECTURE_CONFORMANT: <one-line scope>`.
