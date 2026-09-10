/* eslint-disable no-relative-import-paths/no-relative-import-paths --
 * Reached through `resolve.alias`, which resolves the aliased path itself.
 */
/**
 * Nest's TypeORM configuration for the PGlite tier.
 *
 * `vitest.pglite.config.ts` maps this over `shared/database/typeorm.options`,
 * so `AppModule`'s `TypeOrmModule.forRootAsync` builds its DataSource on the
 * shared in-process driver instead of dialling a PostgreSQL server.
 *
 * Without this the HTTP contract specs seed their fixtures into PGlite while
 * the application under test reads from a real database, and every
 * authenticated request comes back 401 because the session row is somewhere
 * the application cannot see.
 *
 * `AppModule` still calls this with the injected `ConfigService`; the argument
 * is simply ignored, because the driver carries its own configuration rather
 * than reading `DATABASE_*`.
 */
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { pgliteDriver } from './pglite-driver.js';

export const createTypeOrmOptions = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  driver: pgliteDriver,
  autoLoadEntities: true,
  synchronize: false,
});
