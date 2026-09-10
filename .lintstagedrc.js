// @ts-check

/**
 * Lint-Staged Configuration for Monorepo
 *
 * The 200 lines this file used to be existed to work around ESLint: it grouped staged files by
 * their nearest `eslint.config.*`, asked ESLint's Node API which of them were ignored, then `cd`-ed
 * into each package and shelled out to `npx eslint` twice. oxlint needs none of it. It resolves the
 * nearest `.oxlintrc.json` for every path it is given itself, applies that config's
 * `ignorePatterns` (and `.gitignore`) itself, and is fast enough that the two passes cost less than
 * the grouping did.
 *
 * What still matters, and is preserved exactly:
 *
 * 1. **Only staged files are linted.** oxlint is fast enough to lint the whole tree, but doing that
 *    would let an unrelated pre-existing violation somewhere else block an unrelated commit — a
 *    change in what the gate means, not just in how it runs. The filenames are passed through.
 * 2. **`--max-warnings=0`.** The commit gate is stricter than `pnpm lint`: `apps/*` tolerate
 *    warnings in their own `lint` script, but nothing warning-level may enter a commit.
 * 3. **Fix, then check, then format.** oxlint `--fix` applies only its safe fixes (never
 *    `--fix-suggestions` or `--fix-dangerously`), the second pass fails the commit on whatever is
 *    left, and Prettier — still the only formatter — runs last so the linter never fights it.
 *    lint-staged re-stages the rewritten files.
 * 4. **`--type-aware`.** The type-aware rules are the reason `no-floating-promises` and the
 *    `no-unsafe-*` family exist in this gate at all; a run without the flag silently skips them.
 *    It is passed on the command line rather than set in a config because `options.typeAware` is
 *    root-config-only and every package config becomes the root config for a run inside it.
 */

/**
 * @param {string[]} filenames
 * @returns {string}
 */
const quoted = (filenames) => filenames.map((f) => `"${f}"`).join(' ');

/**
 * @type {import('lint-staged').Config}
 */
module.exports = {
  // Lint staged JavaScript/TypeScript with the nearest `.oxlintrc.json`, then format.
  // `--no-error-on-unmatched-pattern` covers the case where every staged file is ignored by a
  // config (a tooling file, a generated one): an empty selection is not a failed commit.
  '*.{js,jsx,ts,tsx,mjs,cjs}': (filenames) => [
    `pnpm exec oxlint --type-aware --fix --no-error-on-unmatched-pattern ${quoted(filenames)}`,
    `pnpm exec oxlint --type-aware --max-warnings=0 --no-error-on-unmatched-pattern ${quoted(filenames)}`,
    `prettier --write ${quoted(filenames)}`,
  ],

  // The architectural tier asserts the shape of the whole apps/server source tree — where mappers
  // live, how they are written — so it is not a per-file check: any staged server source file can
  // break it, and one run covers them all. Returning a function keeps lint-staged from appending
  // the staged filenames to the command, and lint-staged's stashing means the specs see exactly
  // the tree being committed rather than the working copy.
  'apps/server/src/**/*.ts': () => {
    return 'pnpm --filter @warehouser/server test:architectural';
  },

  // Format other files with Prettier only
  '*.{json,css,md}': (filenames) => {
    return `prettier --write ${quoted(filenames)}`;
  },
};
