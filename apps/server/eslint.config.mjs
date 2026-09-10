import serviceConfig from '@warehouser/eslint-config-service';

export default [
  ...serviceConfig,
  {
    ignores: [
      // Tooling configs that sit outside `tsconfig.json`'s `include`
      // ("src/**/*", "migrations/**/*"), so the typed-lint project service
      // cannot parse them.
      'vitest.*.ts',
      'dist/**',
      'node_modules/**',
    ],
  },
];
