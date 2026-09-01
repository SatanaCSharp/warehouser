/* eslint-disable no-relative-import-paths/no-relative-import-paths --
 * Jest loads globalSetup and globalTeardown outside its module registry, so
 * the `moduleDirectories` baseUrl that makes `test/...` imports resolve
 * elsewhere in the suite does not apply here. These must stay relative or the
 * harness fails to load.
 */
/**
 * Applies the migrations once per Jest run and dumps the result.
 *
 * Every test file then restores its own database from that dump — see
 * `pglite-data-source.ts`. Restoring costs a fraction of migrating, so paying
 * for the migrations once and copying the outcome is what makes a
 * database-per-test-file affordable.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DataSource } from 'typeorm';
import { getPGliteInstance, PGliteDriver } from 'typeorm-pglite';

import { PGLITE_TEMPLATE_ENV } from './runtime';

export const PGLITE_DIRECTORY_KEY = Symbol.for('warehouser.pglite.directory');

export default async (): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), 'warehouser-pglite-'));

  const template = new DataSource({
    type: 'postgres',
    driver: new PGliteDriver().driver,
    migrations: [join(process.cwd(), 'migrations/*.ts')],
    synchronize: false,
  });

  await template.initialize();
  await template.runMigrations();

  const dump = await (await getPGliteInstance()).dumpDataDir('none');
  const dumpPath = join(directory, 'template.tar');

  writeFileSync(dumpPath, Buffer.from(await dump.arrayBuffer()));
  await template.destroy();

  process.env[PGLITE_TEMPLATE_ENV] = dumpPath;

  // `global-teardown` runs in this process but is loaded as its own module, so
  // the directory to clean up travels through `globalThis`.
  (globalThis as Record<symbol, unknown>)[PGLITE_DIRECTORY_KEY] = directory;
};
