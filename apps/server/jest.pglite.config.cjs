const baseConfig = require('./jest.config.cjs');

/**
 * The integration tier: the whole suite, each test file running against its
 * own in-process PGlite database.
 *
 * `moduleNameMapper` swaps the production DataSource for a PGlite-backed one,
 * so no production file knows this tier exists.
 *
 * Note PGlite runs Postgres in single-user mode — one backend, one query at a
 * time. A spec that needs two backends racing each other cannot be expressed
 * here: it would either self-deadlock or let both writers win. The repository
 * deliberately holds no such specs.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  ...baseConfig,
  globalSetup: '<rootDir>/src/test/pglite/global-setup.ts',
  globalTeardown: '<rootDir>/src/test/pglite/global-teardown.ts',
  // Only the integration specs: the unit tier already runs everything else,
  // and a command named for one tier should not quietly run the other.
  testMatch: ['<rootDir>/src/**/*.integration.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // Each test file leaves a PGlite WebAssembly heap behind that nothing
  // releases: `typeorm-pglite` holds its instance in a module-level singleton
  // and Jest resets the module registry without closing it. With one worker
  // per core the accumulated heaps occasionally kill a worker mid-run
  // (SIGTRAP), which surfaces as a failed suite reporting no failed tests.
  // Halving the workers removes it at no cost in wall time — these specs are
  // bound by PGlite's single-threaded WebAssembly, not by core count.
  maxWorkers: '50%',
  moduleNameMapper: {
    '^shared/database/data-source$':
      '<rootDir>/src/test/pglite/pglite-data-source.ts',
    '^shared/database/typeorm\\.options$':
      '<rootDir>/src/test/pglite/pglite-typeorm.options.ts',
  },
};
