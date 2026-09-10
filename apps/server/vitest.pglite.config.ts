import { fileURLToPath } from 'node:url';

import { defineConfig, mergeConfig } from 'vitest/config';

import shared from './vitest.shared';

const pglite = (module: string): string =>
  fileURLToPath(new URL(`./src/test/pglite/${module}`, import.meta.url));

/**
 * The integration tier: the whole suite, each test file running against its
 * own in-process PGlite database.
 *
 * `resolve.alias` is the replacement for Jest's `moduleNameMapper`: it swaps
 * the production DataSource and the production Nest TypeORM options for
 * PGlite-backed ones, so no production file knows this tier exists. Vite's
 * alias resolver runs ahead of every plugin `resolveId` hook, so these two
 * entries win over `vite-tsconfig-paths`' baseUrl resolution.
 *
 * Note PGlite runs Postgres in single-user mode — one backend, one query at a
 * time. A spec that needs two backends racing each other cannot be expressed
 * here: it would either self-deadlock or let both writers win. The repository
 * deliberately holds no such specs.
 */
export default mergeConfig(
  shared,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^shared\/database\/data-source$/,
          replacement: pglite('pglite-data-source.ts'),
        },
        {
          find: /^shared\/database\/typeorm\.options$/,
          replacement: pglite('pglite-typeorm.options.ts'),
        },
      ],
    },
    test: {
      name: 'integration',
      // Only the integration specs: the unit tier already runs everything
      // else, and a command named for one tier should not quietly run the
      // other.
      include: ['src/**/*.integration.spec.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      // One file exporting both `setup` and `teardown`; it hands the migrated
      // template dump to the workers through `provide`/`inject`.
      globalSetup: ['./src/test/pglite/global-setup.ts'],
      // A fresh module registry per test file is what gives each file its own
      // database — `pglite-data-source.ts` and `pglite-driver.ts` are both
      // module-level singletons. Turning isolation off collapses the whole
      // tier onto one database and the specs still pass, wrongly.
      isolate: true,
      // Each test file leaves a PGlite WebAssembly heap behind that nothing
      // releases: `typeorm-pglite` holds its instance in a module-level
      // singleton and the module registry is reset without closing it. The
      // forks pool reuses a child process across files, so the heaps still
      // accumulate per worker exactly as they did under Jest, and with one
      // worker per core they occasionally kill a worker mid-run (SIGTRAP),
      // which surfaces as a failed suite reporting no failed tests. Halving
      // the workers removes it at no cost in wall time — these specs are bound
      // by PGlite's single-threaded WebAssembly, not by core count.
      maxWorkers: '50%',
      // Booting `AppModule` in `beforeAll` has exceeded a 5s hook timeout on a
      // loaded machine before.
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  }),
);
