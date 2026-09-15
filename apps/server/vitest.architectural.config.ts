import { defineConfig, mergeConfig } from 'vitest/config';

import shared from './vitest.shared';

/**
 * The architectural tier: assertions about the shape of the source tree rather
 * than about what it computes at runtime. These specs parse every production
 * file with ts-morph, so they cost seconds where a unit spec costs
 * milliseconds — they run under their own command (`pnpm test:architectural`)
 * and are excluded from the unit tier by path, exactly as the PGlite specs
 * are.
 */
export default mergeConfig(
  shared,
  defineConfig({
    test: {
      name: 'architectural',
      include: ['src/**/*.architectural.spec.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      // Each file parses the whole tree; parallelism buys nothing and
      // multiplies the ts-morph memory footprint on the pre-commit hook.
      fileParallelism: false,
      testTimeout: 60_000,
    },
  }),
);
