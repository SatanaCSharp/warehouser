import { createUiConfig } from '@warehouser/oxlint-config';

/**
 * `apps/web` lints with the shared React UI layer — the successor to `packages/eslint-config-ui`
 * plus this application's own `eslint.config.mjs`, both of which now live in
 * `packages/oxlint-config/src/ui.ts` together with the repository baseline they build on.
 *
 * This file exists because oxlint reads its configuration from the current working directory, and
 * turbo runs this package's `lint` script with the cwd here. Everything it adds is specific to this
 * application; the plugins, the React and jsx-a11y severities and the `settings.react.version` are
 * shared.
 */
export default createUiConfig({
  // `dist/`, `node_modules/` and `.turbo/` are already covered by `.gitignore`, and the baseline
  // already excludes generated sources and `oxlint.config.ts`. The rest are the tooling files the
  // ESLint config listed, which sit outside `tsconfig.json`'s `include` ("src") and so have no
  // program for the type-aware pass.
  ignorePatterns: [
    'build/**',
    'out/**',
    '.next/**',
    '.output/**',
    '.storybook/**',
    'next-env.d.ts',
    'postcss.config.mjs',
    '*.config.js',
    '*.config.ts',
  ],
});
