import { defineConfig, mergeConfig } from 'vitest/config';

import shared from './vitest.shared';

/**
 * The unit tier, and what a bare `vitest` runs.
 *
 * Integration specs are excluded by path rather than by an environment flag,
 * so they cannot be run against a developer's own database by accident — only
 * `vitest.pglite.config.ts`, which provisions a database per test file, opts
 * them back in.
 *
 * `exclude` is stated in full: since Vitest 4 the default excludes only
 * `node_modules` and `.git`, so `dist/**` must be named or a built `.spec.js`
 * would be collected.
 */
export default mergeConfig(
  shared,
  defineConfig({
    test: {
      name: 'unit',
      include: ['{src,migrations}/**/*.spec.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.integration.spec.ts',
        // The architectural tier parses the whole source tree with ts-morph;
        // `vitest.architectural.config.ts` runs it under its own command
        // rather than making every unit run pay for it.
        '**/*.architectural.spec.ts',
      ],
    },
  }),
);
