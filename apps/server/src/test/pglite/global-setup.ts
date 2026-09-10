/* eslint-disable no-relative-import-paths/no-relative-import-paths --
 * Vitest resolves `globalSetup` before the test projects exist, so the
 * `vite-tsconfig-paths` baseUrl that makes `test/...` imports resolve
 * elsewhere in the suite is not guaranteed here. These must stay relative or
 * the harness fails to load.
 */
/**
 * Applies the migrations once per run and dumps the result, then removes the
 * dump when the run ends.
 *
 * Every test file restores its own database from that dump — see
 * `pglite-data-source.ts`. Restoring costs a fraction of migrating, so paying
 * for the migrations once and copying the outcome is what makes a
 * database-per-test-file affordable.
 *
 * `setup` and `teardown` live in one file because Vitest loads a single
 * `globalSetup` module and calls both of its exports, which also lets the
 * temporary directory travel between them as an ordinary closure variable
 * instead of through `globalThis`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DataSource } from 'typeorm';
import { getPGliteInstance, PGliteDriver } from 'typeorm-pglite';
import type { TestProject } from 'vitest/node';

import { PGLITE_TEMPLATE_KEY } from './runtime.js';

let directory: string | undefined;

export const setup = async (project: TestProject): Promise<void> => {
  directory = mkdtempSync(join(tmpdir(), 'warehouser-pglite-'));

  const template = new DataSource({
    type: 'postgres',
    driver: new PGliteDriver().driver,
    // Anchored to this file rather than to `process.cwd()`, so the tier does
    // not quietly migrate nothing when it is run from the repository root.
    //
    // Still the `.ts` sources, not `dist/`: requiring a build before
    // `test:integration` would be worse. TypeORM loads a glob's matches
    // itself, and because `apps/server` is an ES module it does so with a
    // dynamic `import()` — so these files are read by Node's type stripping,
    // not by the SWC transform the specs get. That holds while a migration is
    // plain classes and `import ... from 'typeorm'`, which is all TypeORM
    // generates; a migration that reached for an `enum`, a `namespace` or a
    // constructor parameter property would fail to load here. The failure is
    // loud — an unmigrated template means every spec in the tier fails on a
    // missing relation.
    migrations: [join(import.meta.dirname, '../../../migrations/*.ts')],
    synchronize: false,
  });

  await template.initialize();
  await template.runMigrations();

  const dump = await (await getPGliteInstance()).dumpDataDir('none');
  const dumpPath = join(directory, 'template.tar');

  writeFileSync(dumpPath, Buffer.from(await dump.arrayBuffer()));
  await template.destroy();

  // Test files run in their own processes; `provide` is the channel Vitest
  // gives a global setup for handing them serializable data, and it does not
  // depend on the pool inheriting a mutated `process.env`.
  project.provide(PGLITE_TEMPLATE_KEY, dumpPath);
};

/** Removes the template dump `setup` built. */
export const teardown = (): void => {
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
};
