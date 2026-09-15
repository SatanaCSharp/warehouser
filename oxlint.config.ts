import { createBaseConfig, rootOptions } from '@warehouser/oxlint-config';

/**
 * The repository root's own lint configuration.
 *
 * The baseline it used to hold now lives in `packages/oxlint-config`, so what is left here is only
 * what is true of the root and nowhere else: the exclusions for the repository-level files and
 * trees that no `tsconfig.json` includes.
 *
 * This file still has to exist. oxlint resolves the nearest config from the file being linted, so
 * it is what `pnpm lint:all` uses for a whole-tree run and what `.lintstagedrc.js` picks up for a
 * staged file that sits at the repository root rather than inside a package.
 *
 * It is written in ESM, like every other configuration in the repository: the root
 * `package.json` states `"type": "module"`, and Node applies that to a `.ts` file it
 * type-strips.
 *
 * Only one of `.oxlintrc.json` and `oxlint.config.ts` may exist per directory — oxlint fails the
 * run outright when it finds both, rather than picking one.
 */
export default createBaseConfig({
  // oxlint accepts `options` only in the root config of a run and fails outright when a nested one
  // declares it — so the shared baseline leaves it out and this file, the only config that is
  // always the root of its run, is where it is applied. See `packages/oxlint-config/src/base.ts`.
  options: rootOptions,

  // Appended to the baseline's shared list. `.gitignore` is honoured automatically, which already
  // covers `node_modules/`, `dist/`, `.turbo/`, `coverage/` and the worktree directories, and the
  // baseline already excludes generated sources and every `oxlint.config.ts`.
  //
  // The rest keeps the linted surface the same as it was under ESLint, which is `apps/*/src` and
  // `packages/*/src` and nothing else. That was previously true by accident — the repository root
  // had no `eslint.config.*`, so `.lintstagedrc.js`'s config lookup returned null for every
  // repository-level file and skipped it. A config at the root is exactly what oxlint's nested
  // lookup does find, so the exclusions have to be stated. Every entry below is a file or tree that
  // no `tsconfig.json` includes: the type-aware pass has no program for them and would type every
  // value in them as `any`.
  //
  // `.prettierrc.js` was already listed verbatim in `eslint-config-base`'s own `ignores`.
  ignorePatterns: [
    '/.lintstagedrc.js',
    '/.prettierrc.js',
    '/commitlint.config.js',
    '/tests/**',
    '/docs/**',
    '/ai/**',
    '/.husky/**',
  ],
});
