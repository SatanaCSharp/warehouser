# Architecture Map

## Repository containers

| Container               | Responsibility                                            | Primary dependencies                          |
| ----------------------- | --------------------------------------------------------- | --------------------------------------------- |
| `apps/web`              | Browser SPA and user interaction                          | React, TanStack Router, Redux Toolkit, HeroUI |
| `apps/server`           | Backend application and HTTP API                          | NestJS, TypeORM, PostgreSQL                   |
| `packages/contracts`    | Zod schemas for web/server boundaries                     | Zod                                           |
| `packages/shared-types` | Shared TypeScript types that are not validation contracts | TypeScript                                    |
| `packages/utils`        | Reusable framework-neutral utilities                      | TypeScript                                    |

The web development server proxies `/api` requests to the server on port 3001. Shared request and
response shapes flow through `packages/contracts`; application-local validation stays with its
owning application.

## Web application

`apps/web/src/main.tsx` mounts the provider chain. `router.ts` assembles manually declared routes
from route-owned modules. Redux Toolkit is the cross-module client-state owner and the RTK store is
passed into TanStack Router context so route guards can read current state through selectors.
RTK Query owns API request lifecycle and server-response caching. Feature modules inject endpoints
into one shared API slice, whose base query applies credentials, contract validation, and normalized
failures. React components use generated hooks and route guards dispatch the same endpoints through
the store.
i18next is initialized in `apps/web/src/i18n.ts` before React renders. The HTTP backend loads
mirrored locale/namespace files from `apps/web/public/locales/<language>/<namespace>.json`.

See [Frontend architecture](frontend-architecture.md) for boundaries and
[Adding a web module](guides/adding-a-web-module.md) and
[Adding and maintaining web localization](guides/adding-and-maintaining-web-localization.md) for
extension procedures.

## Server application

`apps/server` is evolving into a NestJS modular monolith organized by entity-related feature
modules. REST and BullMQ worker processes share application and domain code while keeping their
transport adapters separate. PostgreSQL is connected through TypeORM; specialized concrete
repositories encapsulate cohesive, potentially multi-entity operations, and runtime schema
synchronization is disabled.

See [Server architecture](server-architecture.md) for target boundaries and
[Adding a server module](guides/adding-a-server-module.md) for the extension procedure.

## Architectural decisions

- [Schema validation with Zod](adr/12-07-2026-schema-validation-with-zod.md)
- [PostgreSQL persistence with TypeORM](adr/21-07-2026-postgresql-with-typeorm.md)
- [Structured server logging with Pino](adr/27-07-2026-structured-logging-with-pino.md)
- [Public centralized web translations](adr/27-07-2026-bundled-centralized-web-translations.md)
- [RTK Query for web API calls](adr/02-08-2026-rtk-query-for-web-api-calls.md)
