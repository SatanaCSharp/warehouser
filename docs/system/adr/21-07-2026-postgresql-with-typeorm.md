# PostgreSQL Persistence with TypeORM

Status: Accepted

Date: 2026-07-21

## Context

The server needs a relational persistence baseline with explicit schema evolution and isolation
between domain code and database infrastructure. The previous repository dependencies referenced
Mongoose, but no MongoDB connection, model, or repository had been implemented.

## Decision

Use PostgreSQL as the server datastore and TypeORM as the NestJS persistence integration. Keep
TypeORM entities and repositories inside feature infrastructure adapters behind repository ports.
Manage schema changes with reviewed TypeORM migration classes and keep `synchronize` disabled in
every environment.

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
- Domain and application layers remain independent of TypeORM.
- Migration reversibility and production rollout safety become review requirements.
