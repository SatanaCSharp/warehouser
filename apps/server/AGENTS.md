# Server development instructions

Before modifying `apps/server`, read and follow:

- `package.json`
- `../../docs/system/server-architecture.md`
- `../../docs/system/guides/adding-a-server-module.md`
- `../../docs/system/guides/creating-a-server-repository.md`
- `../../docs/system/guides/adding-and-using-contracts.md`
- `../../docs/system/guides/server-error-handling.md`

Follow the modular-monolith boundaries in those documents.

- Organize entity-related features under `src/<module-name>/`.
- REST controllers and BullMQ handlers invoke use cases. They must not contain business logic or
  access persistence directly.
- Commands perform writes and queries perform reads.
- Services and repository implementations must not depend on use cases or transport layers.
- Put reusable server-local pure fabrications under `src/shared/`.
- Use `@warehouser/contracts` for every REST request and response schema.
- Reuse `@warehouser/utils`; move a generally reusable utility there instead of duplicating it.
- Use PostgreSQL through TypeORM. Put concrete repositories in
  `src/shared/domain/repositories/`; every new repository must extend `BaseRepository<TEntity>` as
  described in `creating-a-server-repository.md`.
- Use reviewed TypeORM migrations for schema changes; never enable runtime synchronization.
- Use BullMQ for asynchronous operations and scheduled jobs when its infrastructure is introduced.
  Do not add a second job or cron mechanism.
- Define server-internal event payloads as Zod schemas under
  `src/shared/events/<event-name>/` and infer their TypeScript types from those schemas.
- Keep reusable test support under `src/test/`.
- Follow `server-error-handling.md` for predicate placement, named error factories, typed errors,
  propagation, NestJS exception filtering, logging, and safe REST error responses. Do not add
  routine `try/catch` blocks to controllers or endpoint handlers.
- Use the shared `AppLoggerModule` and `PinoLogger` for operational diagnostics. Do not add
  telemetry SDKs, tracing, metrics exporters, collectors, or feature-specific telemetry
  abstractions; use ordinary structured log events with useful context instead.

Do not write tests for migrations. Verify migrations by applying and reverting them against the
real development database.

<!-- init-agent:start -->

The repository-owned `../../ai/` directory is the source of truth for coding-agent workflows. Load
the relevant installed skills from `.codex/skills/` on demand. Canonical commands remain
available under `../../ai/commands/`, and specialized roles are adapted from `../../ai/agents/`.

Use Pencil only for user-facing UI work, as described in `../../README.md` and
`../../ai/skills/design-ui/SKILL.md`.

Local credentials policy: `.env.example` files are the only environment-value files agents may
read. Do not read, print, search, summarize, diff, or otherwise inspect `.env`, `.env.*` (except
`.env.example`), or any file known or suspected to contain credentials, tokens, keys, passwords,
or secrets. If a required ignored local environment file is missing, it may be copied from the
applicable `.env.example` without displaying either file; never overwrite an existing local
environment file. Setup commands and generated guidance must use only the placeholder/development
values documented in `.env.example`, never values from sensitive local files.

Coding agents must not add telemetry.
<!-- init-agent:end -->
