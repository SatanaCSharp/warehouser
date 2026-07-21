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
  dependencies, and repository interfaces isolating persistence technology.
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

Detailed frontend boundaries are defined in [Frontend architecture](frontend-architecture.md).

### Server modules and asynchronous work

Server features are owned by entity-related modules. REST controllers and BullMQ handlers are thin
transport adapters over commands, queries, and event use cases. BullMQ is the target mechanism for
asynchronous operations and scheduled jobs once Redis-backed queue infrastructure is introduced.
Detailed boundaries are defined in [Server architecture](server-architecture.md).

### UI delivery

HeroUI and the tokens configured by `apps/web/src/styles/hero.ts` provide the current UI foundation.
UI-changing features follow the specification → Pencil design → explicit approval → tasks →
implementation → visual review workflow in the root README. Backend-only work skips UI design.

## Known risks and pending decisions

- Authentication is currently a mock in-memory flow. Token transport, refresh, expiry, and session
  restoration require an explicit security design before production use.
- Localization is not currently installed; new code must not assume an i18n runtime exists.
- The web application has no domain API client yet; choose its error and request policy when the
  first real server-integrated feature is designed.
- BullMQ and Redis are target technologies and are not installed yet; their introduction requires
  explicit infrastructure work.
- PostgreSQL availability, credentials, backups, and production migration execution require
  deployment-specific configuration.
