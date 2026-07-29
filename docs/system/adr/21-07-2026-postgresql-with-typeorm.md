# PostgreSQL Persistence with TypeORM

Status: Accepted

Date: 2026-07-21

## Context

The server needs a relational persistence baseline with explicit schema evolution and isolation
between domain code and database infrastructure. The previous repository dependencies referenced
Mongoose, but no MongoDB connection, model, or repository had been implemented.

## Decision

Use PostgreSQL as the server datastore and TypeORM as the NestJS persistence integration. Keep
TypeORM entities under `apps/server/src/shared/domain/entities/` and concrete repositories under
`apps/server/src/shared/domain/repositories/`. Repositories are specialized around cohesive
persistence operations rather than one TypeORM entity. A repository may retrieve or persist
several entities in one optimized query, database operation, or public method. Prefer that
operation over table-shaped CRUD calls that force callers to reconstruct the same operation.
Repositories do not extend `BaseRepository` and no generic base-repository approach is used.

Inject concrete repositories directly; do not introduce repository ports or feature-owned
persistence adapters. Shared repositories remain independent of dedicated feature modules and
operate only on shared persistence entities and persistence-oriented values. Mapping between
persistence entities and feature domain objects belongs in the owning feature's `domain/mappers/`
directory and is invoked above the repository boundary. Manage schema changes with reviewed
TypeORM migration classes and keep `synchronize` disabled in every environment.

Connection configuration uses `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`,
`DATABASE_PASSWORD`, and `DATABASE_NAME`.

## Alternatives

- MongoDB with Mongoose: rejected because no implemented model depended on it and the target domain
  architecture requires deliberate relational constraints and migrations.
- Direct PostgreSQL driver access: rejected as the default because it would duplicate mapping and
  NestJS lifecycle integration, though specialized queries may still be encapsulated by an adapter.

## Consequences

- PostgreSQL and TypeORM become required server runtime dependencies.
- Deployments must provision PostgreSQL and run migrations before starting code that depends on
  the new schema.
- TypeORM access is standardized through specialized, operation-oriented concrete repositories.
- Multi-entity queries and writes can remain efficient without application-layer round trips.
- Repository APIs require deliberate use-case-oriented design instead of inherited generic CRUD.
- Migration reversibility and production rollout safety become review requirements.
