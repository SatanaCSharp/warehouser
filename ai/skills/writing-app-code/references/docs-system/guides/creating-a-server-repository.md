# Creating a Server Repository

Use this guide whenever production code needs a new TypeORM repository under `apps/server`.

## Design a specialized repository

Create every repository in:

```text
apps/server/src/shared/domain/repositories/
```

Name and shape the repository around the cohesive persistence operation it provides, not around one
table or TypeORM entity. A repository may read or write several entities when doing so lets the
database retrieve or persist the required state efficiently in one query, one database operation,
or one public repository method.

```ts
import { DataSource } from 'typeorm';

import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';

export class RegistrationRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createRegistration(
    input: CreateRegistrationPersistenceInput,
  ): Promise<void> {
    const manager = getEntityManager(this.dataSource);

    await manager.insert(AccountEntity, input.account);
    await manager.insert(UserEntity, input.user);
    await manager.insert(SessionEntity, input.session);
  }
}
```

Use the TypeORM repository API for straightforward work and QueryBuilder for joins, projections,
conditional writes, or multi-entity operations that it expresses more clearly. Prefer one
purpose-built query over retrieving records separately and joining or filtering them in
application memory. Prefer one cohesive write method over exposing a sequence of table-shaped
methods that every caller must coordinate.

Do not extend or introduce `BaseRepository`. Do not create generic CRUD abstractions, repository
interfaces, feature-owned persistence adapters, or pass-through wrappers. Inject the specialized
concrete repository into its callers.

## Keep repositories isolated and operation-oriented

Code under `apps/server/src/shared/domain/repositories/` must not import from or otherwise know
about a dedicated feature module. A repository accepts and returns shared TypeORM persistence
entities and persistence-oriented values only. It must not accept or return a feature's domain
entities, value objects, DTOs, commands, or query results.

Place conversions between shared persistence entities and feature-owned domain objects in:

```text
apps/server/src/<feature-name>/domain/mappers/
```

For example, `toSession` and `toSessionEntity` belong in
`apps/server/src/auth/domain/mappers/`, not in a repository or `shared/`. Call these mappers from
the feature layer above the repository—normally a use case or a feature domain service—before
calling the repository or after receiving its result.

A repository method performs one cohesive persistence operation, which can span multiple entities.
Repository classes must not contain private methods. If persistence logic is reusable, make it a
meaningful public operation. Move feature/domain mapping and business decisions to the owning
feature; do not hide them behind repository helpers.

Put business orchestration in an injectable service under:

```text
apps/server/src/<feature-name>/domain/services/
```

The feature service owns business rules and uses feature mappers at the persistence boundary. It
may call one specialized repository method that efficiently retrieves or persists all state needed
for the operation. Do not split an efficient multi-entity repository operation into several
repositories merely because several tables are involved.

## Transactions and errors

Before adding transaction behavior, inspect `apps/server/src/shared/database/` and
`apps/server/src/shared/decorators/`. Mark the injectable service method that owns the complete
atomic operation with `@Transactional()` from
`apps/server/src/shared/decorators/transactional.decorator.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Transactional } from 'shared/decorators/transactional.decorator';

@Injectable()
export class RegistrationService {
  constructor(private readonly registrations: RegistrationRepository) {}

  @Transactional()
  async register(input: RegistrationInput): Promise<void> {
    await this.registrations.createRegistration(toPersistenceInput(input));
  }
}
```

The decorator uses the shared transaction context, defaults to propagation with `READ COMMITTED`
isolation, and lets all participating repository operations use the same transaction manager.
Repositories must obtain their manager through that shared context. Do not call
`DataSource.transaction(...)`, create a `QueryRunner`, or implement an independent transaction
boundary inside a repository.

Do not catch, log, translate, or wrap persistence failures in a repository. Let them reach the
server's universal error boundary described in [Server error handling](server-error-handling.md).

## Verify

Run the server checks after creating or changing a repository:

```sh
pnpm --filter @warehouser/server lint
pnpm --filter @warehouser/server test
pnpm --filter @warehouser/server build
```
