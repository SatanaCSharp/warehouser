import { createServiceConfig } from '@warehouser/oxlint-config';

/**
 * `apps/server` lints with the shared NestJS service layer — the successor to
 * `packages/eslint-config-service`, which now lives in `packages/oxlint-config/src/service.ts`
 * together with the repository baseline it builds on.
 *
 * This file exists because oxlint reads its configuration from the current working directory, and
 * turbo runs this package's `lint` script with the cwd here. Everything it adds is specific to this
 * application; the rules and the spec-file relaxations are shared.
 */
export default createServiceConfig({
  // `dist/` and `node_modules/` are already covered by `.gitignore`, and the baseline already
  // excludes `oxlint.config.ts`. The `vitest.*.ts` configs sit outside `tsconfig.json`'s `include`
  // ("src/**/*", "migrations/**/*"), so the type-aware pass has no program for them — the same
  // reason the ESLint config ignored them.
  ignorePatterns: ['vitest.*.ts'],
});
