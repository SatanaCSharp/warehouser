/**
 * `@warehouser/oxlint-config` — the repository's shared oxlint configuration.
 *
 * Three layers, matching the three ESLint config packages this replaces:
 *
 * | factory               | layer                         | consumers                         |
 * | --------------------- | ----------------------------- | --------------------------------- |
 * | `createBaseConfig`    | repository-wide baseline      | the repository root, `packages/*` |
 * | `createServiceConfig` | baseline + NestJS relaxations | `apps/server`                     |
 * | `createUiConfig`      | baseline + React/a11y/import  | `apps/web`                        |
 *
 * Each factory takes the target's own extra configuration — the rules, overrides and ignore
 * patterns that are true of that app or package and nowhere else — and returns one flat
 * `OxlintConfig` with the shared layer already merged in. See `./merge.ts` for the field-by-field
 * semantics.
 *
 * Every linted package still carries its own `oxlint.config.ts`, because oxlint reads its
 * configuration from the current working directory and turbo runs each package's `lint` script
 * with the cwd inside that package. What those files no longer carry is a copy of the shared
 * layer: they call a factory, name their extras, and stop.
 *
 * Usage is the same everywhere. Every workspace package and the repository root itself are
 * `"type": "module"`, so every consumer is an ESM one:
 *
 * ```ts
 * import { createUiConfig } from '@warehouser/oxlint-config';
 *
 * export default createUiConfig({ ignorePatterns: ['build/**'] });
 * ```
 *
 * Its sources are `.ts` and are type-stripped by Node on load: pnpm links a workspace package by
 * symlink, Node resolves that to its real path outside `node_modules`, and type stripping applies
 * there. So there is no build step and nothing to rebuild before a lint run — the same arrangement
 * `@warehouser/tsconfig` uses, and the reason `lint` does not gain a `dependsOn` on this package.
 *
 * The sources reference each other by the package's own name (`@warehouser/oxlint-config/base` and
 * friends), resolved through the `exports` map rather than through `node_modules`. A relative
 * specifier would have to carry the `.ts` extension Node resolves at runtime, and every consumer
 * that pulled these files into its own program would then need `allowImportingTsExtensions`.
 *
 * `options` is the one field a consumer other than the repository root must not pass: oxlint
 * accepts it only in the root config of a run and fails outright when a nested one declares it.
 * `rootOptions` is exported for the root's use — see `./base.ts`.
 *
 * `defineConfig` is deliberately not used here or in the consumers. It is `oxlint`'s identity
 * function for editor completions, and the factories already return a typed `OxlintConfig`; going
 * through it would add a runtime import of `oxlint` to every config for nothing.
 */
import { baseConfig, rootOptions } from '@warehouser/oxlint-config/base';
import { mergeOxlintConfig } from '@warehouser/oxlint-config/merge';
import { serviceConfig } from '@warehouser/oxlint-config/service';
import { uiConfig } from '@warehouser/oxlint-config/ui';
import type { OxlintConfig } from 'oxlint';

/** The repository-wide baseline, plus `extra`. */
export const createBaseConfig = (extra: OxlintConfig = {}): OxlintConfig =>
  mergeOxlintConfig(baseConfig, extra);

/** The baseline with the NestJS service relaxations, plus `extra`. */
export const createServiceConfig = (extra: OxlintConfig = {}): OxlintConfig =>
  mergeOxlintConfig(serviceConfig, extra);

/** The baseline with the React / jsx-a11y / import layer, plus `extra`. */
export const createUiConfig = (extra: OxlintConfig = {}): OxlintConfig =>
  mergeOxlintConfig(uiConfig, extra);

// The presets, the merge, and the root-only `options` block — see `./base.ts` for why `options`
// is not part of the baseline and only the repository root may pass it.
export { baseConfig, mergeOxlintConfig, rootOptions, serviceConfig, uiConfig };
export type { OxlintConfig } from 'oxlint';
