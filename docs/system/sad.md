# System Architecture Description

## Context

Warehouser is a pnpm/Turborepo monorepo containing a browser application, a backend service, and
packages shared across their boundary. Feature delivery is described in `docs/features`, while
durable system structure and contributor procedures live in `docs/system`.

## Solution strategy

- Keep deployable applications independently structured under `apps/`.
- Share validated web/server request and response shapes through `packages/contracts`.
- Keep application implementation details inside their owning app rather than moving them into a
  package pre-emptively.
- Organize the server as a modular monolith with entity-related feature modules, inward-pointing
  dependencies, and specialized repositories shaped around cohesive persistence operations.
- Use PostgreSQL through TypeORM as the server persistence baseline. Manage schema changes with
  reviewed TypeORM migrations; runtime schema synchronization remains disabled.
  See the accepted [PostgreSQL/TypeORM ADR](adr/21-07-2026-postgresql-with-typeorm.md).
- Run REST handling and BullMQ job/event handling as separate server processes that reuse the same
  application and domain layers.
- Organize the web application by route-owned feature modules and explicit platform infrastructure.
- Use Redux Toolkit for cross-module client state and TanStack Router for navigation and access
  control.
- Use repository-owned UI design artifacts and require explicit approval before implementing a
  user-visible design change.

## Cross-cutting concepts

### Validation and contracts

Zod is the validation technology across the monorepo. Boundary schemas are owned by
`packages/contracts`; schemas for browser-only or server-only data remain local. See the accepted
[Zod ADR](adr/12-07-2026-schema-validation-with-zod.md).

### Frontend state and routing

Redux Toolkit is the single owner of cross-module browser state. TanStack Router receives the live
RTK store through router context. Plain guard functions use selectors against that store and throw
router redirects; a parallel React auth context is not used.

RTK Query owns web API request lifecycle and cached server state. React workflows use generated
hooks, while route guards and other non-React workflows dispatch the same endpoints. A shared base
query preserves cookie credentials, contract validation, and normalized errors. See the accepted
[RTK Query ADR](adr/02-08-2026-rtk-query-for-web-api-calls.md).

Detailed frontend boundaries are defined in [Frontend architecture](frontend-architecture.md).

### Web localization

i18next is the web application's localization runtime. Translation resources are served centrally
from `apps/web/public/locales/<language>/<namespace>.json` through the HTTP backend. Module-specific
copy uses a module-named namespace; reusable feedback uses shared namespaces. See the accepted
[web translation ADR](adr/27-07-2026-bundled-centralized-web-translations.md) and the
[localization guide](guides/adding-and-maintaining-web-localization.md).

### Server modules and asynchronous work

Server features are owned by entity-related modules. REST controllers and BullMQ handlers are thin
transport adapters over commands, queries, and event use cases. BullMQ is the target mechanism for
asynchronous operations and scheduled jobs once Redis-backed queue infrastructure is introduced.
Detailed boundaries are defined in [Server architecture](server-architecture.md).

### Server logging

The server uses centrally configured structured Pino logging through `nestjs-pino`. Providers
inject `PinoLogger` and set their class context; uncaught errors are logged once at the global
exception boundary. Structured logs are the server diagnostic mechanism; telemetry SDKs, tracing,
metrics exporters, collectors, and feature-specific telemetry abstractions are not used. See the
accepted [Pino logging ADR](adr/27-07-2026-structured-logging-with-pino.md) and
[logging instead of telemetry ADR](adr/03-08-2026-structured-logging-instead-of-telemetry.md).

### UI delivery

HeroUI and the tokens configured by `apps/web/src/styles/hero.ts` provide the current UI foundation.
UI-changing features follow the specification → Pencil design → explicit approval → tasks →
implementation → visual review workflow in the root README. Backend-only work skips UI design.

## Known risks and pending decisions

- Authentication is currently a mock in-memory flow. Token transport, refresh, expiry, and session
  restoration require an explicit security design before production use.
- Every language/namespace pair configured in `apps/web/src/i18n.ts` requires a matching JSON file
  under `apps/web/public/locales`; missing files fail as runtime HTTP loads.
- BullMQ and Redis are target technologies and are not installed yet; their introduction requires
  explicit infrastructure work.
- PostgreSQL availability, credentials, backups, and production migration execution require
  deployment-specific configuration.
