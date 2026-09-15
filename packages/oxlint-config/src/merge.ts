/**
 * The merge that replaces oxlint's `extends`.
 *
 * `extends` merges exactly three fields — `rules`, `plugins` and `overrides` — and leaves `env`,
 * `globals`, `settings`, `ignorePatterns`, `jsPlugins` and `options` to the child. That is why
 * every config in this repository used to restate the same four blocks verbatim, and why deleting
 * one of those blocks by accident silently dropped a plugin rather than failing the run.
 *
 * Merging in JavaScript instead means the presets in this package are composed here and each
 * consumer receives one flat, self-contained config. Nothing is inherited implicitly, so nothing
 * can be lost by omission.
 *
 * Field semantics, chosen to match what `extends` did where it did anything at all:
 *
 * - `rules`, and the record-shaped `options` / `env` / `globals` / `settings` / `categories`: a
 *   shallow spread, so the consumer wins per key and says nothing about the keys it does not name.
 * - `ignorePatterns` and `overrides`: appended, base first. A later `overrides` entry wins for the
 *   same file glob and rule, which is what makes a consumer's test-file relaxation beat the
 *   baseline's.
 * - `plugins` and `jsPlugins`: replaced outright, never unioned. A consumer that wants more plugins
 *   states the whole list; one that wants the baseline's states nothing. Unioning would make
 *   "exactly these" unexpressible, which is the trap `plugins: []` existed to work around.
 */
import type { OxlintConfig } from 'oxlint';

const mergeOxlintRecord = <T>(
  base: T | undefined,
  extra: T | undefined,
): T | undefined =>
  base === undefined && extra === undefined
    ? undefined
    : ({ ...base, ...extra } as T);

const mergeOxlintList = <T>(
  base: T[] | undefined,
  extra: T[] | undefined,
): T[] | undefined =>
  base === undefined && extra === undefined
    ? undefined
    : [...(base ?? []), ...(extra ?? [])];

export const mergeOxlintConfig = (
  base: OxlintConfig,
  extra: OxlintConfig = {},
): OxlintConfig => ({
  ...base,
  ...extra,
  options: mergeOxlintRecord(base.options, extra.options),
  env: mergeOxlintRecord(base.env, extra.env),
  globals: mergeOxlintRecord(base.globals, extra.globals),
  settings: mergeOxlintRecord(base.settings, extra.settings),
  categories: mergeOxlintRecord(base.categories, extra.categories),
  rules: mergeOxlintRecord(base.rules, extra.rules),
  ignorePatterns: mergeOxlintList(base.ignorePatterns, extra.ignorePatterns),
  overrides: mergeOxlintList(base.overrides, extra.overrides),
  plugins: extra.plugins ?? base.plugins,
  jsPlugins: extra.jsPlugins ?? base.jsPlugins,
});
