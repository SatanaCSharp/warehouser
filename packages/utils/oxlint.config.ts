import { createBaseConfig } from '@warehouser/oxlint-config';

/**
 * Present so that a run with the cwd inside this package — which is how turbo invokes its `lint`
 * script — finds a configuration at all; oxlint reads its config from the working directory.
 * Everything of substance is the shared baseline in `packages/oxlint-config`.
 *
 * Written in ESM, like every other config in the repository: this package is `"type": "module"`,
 * and Node applies that to a `.ts` file it type-strips.
 */
export default createBaseConfig({
  env: { node: true },

  // `dist/` and `node_modules/` are already covered by `.gitignore`, and the baseline already
  // excludes `oxlint.config.ts`. `vitest.config.ts` sits outside `tsconfig.json`'s `include`
  // ("src/**/*.ts"), so the type-aware pass has no program for it; the same reason the ESLint
  // config ignored it.
  ignorePatterns: ['vitest.config.ts'],

  overrides: [
    {
      // A spec asserts against values a test double produced, so the type of what it received is
      // the thing under test rather than a defect. This is the one relaxation this package's ESLint
      // config carried, kept verbatim.
      files: ['src/**/*.spec.ts'],
      rules: {
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-argument': 'off',
        'typescript/unbound-method': 'off',
      },
    },
  ],
});
