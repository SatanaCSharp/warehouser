// @ts-check
import baseConfig from '@warehouser/eslint-config-base';

export default [
  ...baseConfig,
  {
    ignores: [
      // Tooling configs that sit outside `tsconfig.json`'s `include`
      // ("src/**/*.ts"), so the typed-lint project service cannot parse them.
      'eslint.config.mjs',
      'vitest.config.ts',
      'dist/**',
      'node_modules/**',
    ],
  },
  // {   TODO the lint-staged has to be fixed
  //     rules: {
  //         '@typescript-eslint/no-base-to-string': 'off'
  //     }
  // }
];
