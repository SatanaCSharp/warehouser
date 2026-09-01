/* eslint-disable no-relative-import-paths/no-relative-import-paths --
 * `jest.pglite.config.cjs` maps this module over `shared/database/data-source`
 * through `moduleNameMapper`, which resolves the mapped path itself. Keeping
 * this file's own imports relative avoids depending on that resolution twice.
 */
/**
 * The database every spec in the PGlite tier talks to.
 *
 * `jest.pglite.config.cjs` maps this module over
 * `shared/database/data-source`, so specs keep importing the production
 * singleton by its usual path and transparently get an in-process PGlite
 * instead of a PostgreSQL connection. Production code is untouched: it never
 * learns that a test database exists.
 *
 * Jest gives every test file a fresh module registry, so each file evaluates
 * this module once and gets a database of its own, restored from the template
 * `global-setup` migrated. That is what removes the whole class of
 * cross-file interference the PostgreSQL tier has to manage by hand with
 * `TRUNCATE ... CASCADE` and `restore-catalogues.setup.ts`.
 *
 * The driver is in-process on purpose. Reaching PGlite over a socket instead
 * routes every statement through `pglite-socket`'s query queue, which has open
 * defects around transactions and error recovery (electric-sql/pglite #958,
 * #985, #1046) that surface here as rolled-back rows reappearing, empty result
 * sets from aggregates, and hung suites.
 */
import 'reflect-metadata';

import { join } from 'node:path';

import { DataSource } from 'typeorm';

import { pgliteDriver } from './pglite-driver';

const sourceDirectory = join(process.cwd(), 'src');

export default new DataSource({
  type: 'postgres',
  driver: pgliteDriver,
  entities: [join(sourceDirectory, '**/*.entity.ts')],
  synchronize: false,
});
