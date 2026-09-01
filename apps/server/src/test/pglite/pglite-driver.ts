/* eslint-disable no-relative-import-paths/no-relative-import-paths --
 * The modules in this directory are reached through `moduleNameMapper`, which
 * resolves the mapped path itself; keeping their own imports relative avoids
 * depending on that resolution twice.
 */
/**
 * The one PGlite database a test file uses, wrapped as a TypeORM driver.
 *
 * `PGliteDriver`'s constructor does not build a database — it registers its
 * options on a module-level singleton inside `typeorm-pglite`, and the first
 * consumer to connect creates the instance from whatever options were
 * registered last. Constructing a second driver with different options would
 * therefore silently decide which database everyone gets.
 *
 * So it is constructed exactly once, here, and shared. Both consumers that
 * need it — the spec-facing DataSource in `pglite-data-source.ts` and the Nest
 * application's own DataSource in `pglite-typeorm.options.ts` — import this
 * module, which is what makes the application and the test it is running
 * inside talk to the same rows.
 *
 * Jest gives every test file its own module registry, so "once" means once per
 * test file: each file gets a private database restored from the template
 * `global-setup` migrated.
 */
import { readFileSync } from 'node:fs';

import { types } from '@electric-sql/pglite';
import { PGliteDriver } from 'typeorm-pglite';

import { PGLITE_TEMPLATE_ENV } from './runtime';

const templatePath = process.env[PGLITE_TEMPLATE_ENV];

if (!templatePath) {
  throw new Error(
    `${PGLITE_TEMPLATE_ENV} is not set — run this tier through jest.pglite.config.cjs`,
  );
}

/**
 * `bigint` is what `count(*)` returns, and the two drivers disagree about it:
 * `node-postgres` hands back a string, because a PostgreSQL `bigint` does not
 * fit a JS number, while PGlite parses it into one. Specs written against the
 * production driver assert `{ count: '1' }` and would see `{ count: 1 }` here.
 *
 * Keeping the raw string makes the in-process driver answer exactly as the
 * server does, so a spec cannot pass in one tier and fail in the other over a
 * difference that has nothing to do with what it is testing.
 */
export const pgliteDriver = new PGliteDriver({
  loadDataDir: new Blob([readFileSync(templatePath)]),
  parsers: { [types.INT8]: (value: string) => value },
}).driver;
