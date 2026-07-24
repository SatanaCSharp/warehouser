# Server development instructions

Before modifying `apps/server`, read:

- `../../README.md`
- `package.json`
- `../../docs/system/server-architecture.md`
- `../../docs/system/guides/adding-a-server-module.md`
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
- Use PostgreSQL through TypeORM and keep it behind repository interfaces so persistence details do
  not affect domain, use-case, REST, or job-handler code.
- Use reviewed TypeORM migrations for schema changes; never enable runtime synchronization.
- Use BullMQ for asynchronous operations and scheduled jobs when its infrastructure is introduced.
  Do not add a second job or cron mechanism.
- Define server-internal event payloads as Zod schemas under
  `src/shared/events/<event-name>/` and infer their TypeScript types from those schemas.
- Keep reusable test support under `src/test/`.
- Follow `server-error-handling.md` for predicate placement, named error factories, typed errors,
  propagation, NestJS exception filtering, logging, and safe REST error responses. Do not add
  routine `try/catch` blocks to controllers or endpoint handlers.
