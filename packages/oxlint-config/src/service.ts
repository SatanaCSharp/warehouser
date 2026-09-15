/**
 * The NestJS service layer — the successor to `packages/eslint-config-service`.
 *
 * Ten relaxations, ported one for one from `eslint-config-service/index.js`, plus the `node` env
 * and the spec-file override every server suite depends on. `apps/server` is the only consumer,
 * but this is where the layer belongs: it is a statement about how NestJS code is written, not
 * about one application's directory layout.
 */
import { baseConfig } from '@warehouser/oxlint-config/base';
import { mergeOxlintConfig } from '@warehouser/oxlint-config/merge';
import type { OxlintConfig } from 'oxlint';

export const serviceConfig: OxlintConfig = mergeOxlintConfig(baseConfig, {
  env: { node: true },

  rules: {
    // NestJS-specific relaxations, ported one for one from `eslint-config-service/index.js`.
    'typescript/no-explicit-any': 'off', // Common in NestJS decorators and dependency injection
    // `no-floating-promises` is `correctness` in oxlint — i.e. an error by default — where the
    // service config had it at `warn`. Restating it keeps the severity this application actually
    // runs at; without this line every un-awaited promise in `apps/server` would become fatal.
    'typescript/no-floating-promises': 'warn', // Warn about unhandled promises
    'typescript/no-unsafe-argument': 'warn', // Warn about unsafe arguments
    'typescript/no-unsafe-assignment': 'warn', // Warn about unsafe assignments
    'typescript/no-unsafe-call': 'warn', // Warn about unsafe calls
    'typescript/no-unsafe-member-access': 'warn', // Warn about unsafe member access
    'typescript/no-unsafe-return': 'warn', // Warn about unsafe returns
    'typescript/explicit-function-return-type': 'off', // NestJS decorators make this verbose
    'typescript/explicit-module-boundary-types': 'off', // NestJS uses implicit types often
    // Kept for the record even though it is redundant: oxlint files `no-undef` under `nursery`,
    // which the baseline leaves off. TypeScript handles this better than the linter does.
    'eslint/no-undef': 'off',

    // ---- `typescript/consistent-type-imports` is OFF here, and this is a correctness decision
    // rather than a preference.
    //
    // `apps/server/tsconfig.json` extends `@warehouser/tsconfig/tsconfig.node.json`, which sets
    // `emitDecoratorMetadata: true` — that is what NestJS dependency injection and TypeORM's column
    // inference both read. Under it, a constructor parameter's type annotation is emitted into
    // `design:paramtypes` as a *runtime value*, so the import that names it is a value import even
    // though nothing else in the file uses it as one.
    //
    // The rule cannot see that. Measured on this tree it reports 324 production sites in
    // `apps/server/src`, and they include the DI parameters themselves — e.g.
    // `auth/usecases/commands/register.command.ts` lines 17 and 21, which are
    // `AuthRegistrationService` and `AuthenticationRepository`, both injected. Taking its fix would
    // rewrite them to `import type`, erase the metadata, and produce
    // `Nest can't resolve dependencies of the RegisterCommand (?, …)` at boot.
    //
    // Nothing in the gate would catch that. `tsc` stays green, because the types are unchanged, and
    // the unit suites construct these classes directly (`new RegisterCommand(repo, …)`) rather than
    // through the container — so only an integration run or an actual boot would fail.
    //
    // The rule stays on for `apps/web` and `packages/*`: `apps/web/tsconfig.json` extends
    // `tsconfig.base.json`, which does not set `emitDecoratorMetadata`, and the packages inherit it
    // but contain no decorators. Restore this when either the rule learns about decorator metadata
    // or `apps/server` stops relying on it.
    'typescript/consistent-type-imports': 'off',
  },

  overrides: [
    {
      // A spec asserts against values a test double produced, so the type of what it received is
      // the thing under test rather than a defect. `unbound-method` is the load-bearing entry:
      // oxlint files it under `correctness`, so it is on by default and this `off` is what keeps
      // `expect(repository.save).toHaveBeenCalled()` from failing every server suite.
      files: ['src/**/*.spec.ts'],
      rules: {
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/unbound-method': 'off',
      },
    },
  ],
});
