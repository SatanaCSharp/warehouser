import { defineConfig } from 'vitest/config';

import viteConfig from './vite.config';

/**
 * The architectural tier: assertions about the shape of the module graph rather
 * than about what any module computes at runtime. These specs cruise every
 * production file with dependency-cruiser, so they cost seconds where a unit
 * spec costs milliseconds — they run under their own command
 * (`pnpm test:architectural`) and are excluded from the unit tier by path,
 * exactly as `apps/server`'s architectural tier is.
 *
 * The `test` block is replaced rather than merged into. `mergeConfig`
 * concatenates arrays, so merging would append this tier's `include` to the
 * unit tier's `exclude` — which already excludes `*.architectural.spec.ts` —
 * and the run would collect no files at all. Everything outside `test` (the
 * plugins and the alias table) is inherited unchanged.
 */
export default defineConfig({
  ...viteConfig,
  test: {
    name: 'architectural',
    // Nothing here renders: jsdom and the unit tier's i18n/testing-library
    // setup file would be pure cost.
    environment: 'node',
    include: ['src/**/*.architectural.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Each file cruises the whole tree; parallelism buys little and multiplies
    // the resolver's memory footprint on the pre-commit hook.
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
