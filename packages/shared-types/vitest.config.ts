import { withCrapTypescriptVitest } from '@barney-media/crap-typescript-vitest';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * These are plain TypeScript libraries with no decorators, so Vite's default
 * esbuild transform compiles them correctly and faster than SWC would. Only
 * `apps/server` needs `unplugin-swc`, and only because esbuild cannot emit the
 * `design:paramtypes` metadata Nest's DI reads.
 *
 * `vite-tsconfig-paths` replaces Jest's `moduleDirectories: ['<rootDir>', …]`:
 * `tsconfig.json` sets `baseUrl: "src"`, and the plugin prepends it to every
 * bare import, so specifiers like `enums/permission-id` keep resolving into
 * the source tree exactly as `tsc` (and `tsc-alias`) resolve them.
 */
const config = defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // Since Vitest 4 the default `exclude` covers only `node_modules` and
    // `.git`, so a built `dist/**/*.spec.js` would otherwise be collected.
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      // Required, and the whole reason the CRAP gate below means anything.
      // Vitest 5's `coverageConfigDefaults` has no `include` (the old `all`
      // option is gone), and with it unset the v8 provider reports only files
      // some test imported. A source file no test touches is then absent from
      // `coverage-final.json` entirely, the analyzer has no coverage to
      // attribute, and it reports the function as `skipped` rather than
      // failed — so the least-tested code in the package is exactly what the
      // gate would stay silent about.
      //
      // This closes one of the analyser's three skip reasons, `file_unmatched`,
      // and only that one. It cannot help with `fnmap_conflict` or
      // `statement_unattributed`, which are the analyser failing to match a
      // function inside a file that *is* in the report; `apps/web` carries a
      // reporter that fails the run when one of those hides a complex function.
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts'],
      reportsDirectory: './coverage',
    },
  },
});

/**
 * CRAP (`CC^2 * (1 - coverage)^3 + CC`) is opt-in, and `pnpm crap` is what
 * opts in: it is off for a plain `pnpm test`, which keeps the ordinary run
 * free of coverage instrumentation and free of a second way to fail.
 *
 * The adapter analyses the coverage the same run just produced
 * (`coverageMode: "existing-only"`), so the gate costs no second test run —
 * unlike the `crap-typescript` CLI, which shells out its own `vitest run`.
 */
export default process.env.CRAP === '1'
  ? withCrapTypescriptVitest(config, {
      // 5.0, matching both apps. Stricter than the tool's own hard-gate ceiling
      // of 8.0 and its default of 6.0: at 100% coverage CRAP *is* cyclomatic
      // complexity, so this is a per-function CC cap of 5 — and of 4 for
      // anything short of full coverage.
      threshold: 5,
      format: 'text',
      // No CI consumes a JUnit artifact yet, so writing one per run is litter.
      junit: false,
    })
  : config;
