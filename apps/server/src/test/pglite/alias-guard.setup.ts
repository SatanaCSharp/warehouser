/* eslint-disable no-relative-import-paths/no-relative-import-paths --
 * `./pglite-driver` must be reached without going through the alias table this
 * file exists to check, or the guard would be validating its own indirection.
 */
/**
 * Proves, before any spec in the integration tier runs, that
 * `vitest.pglite.config.ts`'s `resolve.alias` entries are actually in effect.
 *
 * The swap is the one silent failure mode in this tier. Specs import the
 * production `shared/database/data-source` and `shared/database/typeorm.options`
 * by their ordinary paths and rely on the alias table to hand them PGlite-backed
 * modules instead. If an alias stops matching — a `find` regex left anchored on
 * a specifier that has since gained its `.js` extension is exactly how — nothing
 * throws. The production modules load, `AppModule` dials `DATABASE_HOST`, and
 * the suite runs against whatever real database the developer happens to have,
 * reporting green.
 *
 * So the alias is asserted rather than assumed: both aliased modules must
 * resolve to something carrying the shared in-process PGlite driver. Neither
 * check opens a connection — `new DataSource(...)` only stores its options, and
 * `createTypeOrmOptions` only builds an object — so a failure here is caught
 * before the first byte reaches a socket.
 *
 * Registered as `setupFiles`, which Vitest runs once per test file inside the
 * worker that will run it, so it checks the same module registry the specs get.
 */
import type { ConfigService } from '@nestjs/config';
import dataSource from 'shared/database/data-source';
import { createTypeOrmOptions } from 'shared/database/typeorm.options';

import { pgliteDriver } from './pglite-driver';

const REMEDY =
  'check the `resolve.alias` entries in vitest.pglite.config.ts — their `find` patterns must match the specifier production code actually writes, extension included. Refusing to run: without the swap this tier talks to a real database.';

if (dataSource.options.driver !== pgliteDriver) {
  throw new Error(
    `PGlite alias not in effect: 'shared/database/data-source' resolved to the production DataSource, not src/test/pglite/pglite-data-source.ts. ${REMEDY}`,
  );
}

// The production factory reads its settings off a `ConfigService`; the PGlite
// one ignores its argument entirely. A stub that answers with the caller's own
// default satisfies both, so this call cannot itself decide the outcome.
const config = {
  get: (_key: string, fallback?: unknown) => fallback,
} as unknown as ConfigService;

if (createTypeOrmOptions(config).driver !== pgliteDriver) {
  throw new Error(
    `PGlite alias not in effect: 'shared/database/typeorm.options' resolved to the production factory, so AppModule would connect to DATABASE_HOST. ${REMEDY}`,
  );
}
