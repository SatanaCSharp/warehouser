# Linting With oxlint

This guide applies to the whole repository — `apps/web`, `apps/server`, and every `packages/*`. It
states what the linter is, how to run it, how to change a rule, and how to suppress one.

oxlint is the only linter. Prettier is the only formatter, it runs separately, and the linter owns
no formatting rule. The decision and what it cost are recorded in
[Replace ESLint with oxlint](../adr/11-09-2026-oxlint-replaces-eslint.md); this guide is the
procedure that follows from it.

## 1. Running it

| Command                                  | What it runs                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm lint`                              | turbo, then each package's own `oxlint --type-aware --max-warnings=0 src` |
| `pnpm --filter @warehouser/web lint`     | one package's `src`                                                       |
| `pnpm --filter @warehouser/web lint:fix` | oxlint's safe fixes over that package, then the same check again          |
| `pnpm lint:all`                          | one run over the whole tree, from the repository-root config              |

Every one of them passes `--max-warnings=0`. A warning fails the run exactly as an error does, in
every package and in the commit hook alike — the severity in the shared config expresses how serious
a rule is, the exit code does not.

`pnpm lint` and `pnpm lint:all` are not the same run, and a config change is not proven until both
are green. `pnpm lint` starts turbo with the working directory inside each package, so **that
package's** `oxlint.config.ts` is the root config of its run. `pnpm lint:all` starts once at the
repository root, so every package config is a **nested** one. Only the second exercises oxlint's
nested-config validation — which is what rejects an `options` block in a package config (§4).

A clean run prints nothing and exits `0`. A finding is printed as
`file://…:line:col: severity plugin(rule): message` — for example
`error typescript(no-base-to-string): …` — and that `plugin(rule)` is the name to use in a config
entry or a disable comment (§5).

## 2. `--type-aware` is not optional

The rules that need type information — `typescript/no-floating-promises`,
`typescript/no-misused-promises`, `typescript/only-throw-error`, the `typescript/no-unsafe-*`
family, `typescript/require-await`, `typescript/no-deprecated`,
`typescript/no-unnecessary-condition`, `typescript/prefer-nullish-coalescing` — run **only** under
`--type-aware`. A run without the flag is quietly weaker and still exits `0`, which is the failure
mode to watch for: it looks like a pass.

Every `lint` and `lint:fix` script in the repository passes it, and so does the commit hook. Pass it
by hand too when you invoke `oxlint` directly.

It is a command-line flag rather than `options.typeAware` in a config for the reason §4 gives:
`options` is accepted only in the run's root config, so setting it there would apply to
`pnpm lint:all` and silently not apply to `pnpm --filter <pkg> lint`. The flag takes precedence and
works from any working directory.

The type-aware pass runs through `oxlint-tsgolint`, a separate binary with its own embedded
typescript-go engine. It is versioned against TypeScript's line rather than oxlint's, and it needs no
`typescript` package of its own — which is why the repository stays on TypeScript 5.9.3. It also does
not follow pnpm's symlinked `node_modules/@types`, which is why three `tsconfig.json` files name
their `types` explicitly; removing those entries brings back 137 spurious `no-unsafe-*` diagnostics.

A file outside its package's `tsconfig.json` `include` has no program in the type-aware pass and
would be typed as `any` throughout. That is why each package's config ignores its own
`vitest.config.ts`, `*.config.ts` and the repository root ignores `tests/`, `docs/`, `ai/` and the
root-level tooling files — not because those files do not matter, but because linting them
type-aware would be meaningless.

## 3. Where the configuration lives

`packages/oxlint-config` holds everything of substance, in three layers:

| Factory               | Layer                                                  | Consumers                         |
| --------------------- | ------------------------------------------------------ | --------------------------------- |
| `createBaseConfig`    | the repository-wide baseline (`src/base.ts`)           | the repository root, `packages/*` |
| `createServiceConfig` | baseline + NestJS relaxations (`src/service.ts`)       | `apps/server`                     |
| `createUiConfig`      | baseline + React / jsx-a11y / react-perf (`src/ui.ts`) | `apps/web`                        |

Each linted package, and the repository root, carries one `oxlint.config.ts` that calls a factory and
adds only what is true of that package:

```ts
import { createUiConfig } from '@warehouser/oxlint-config';

export default createUiConfig({ ignorePatterns: ['build/**'] });
```

Four things about those files:

- **They are load-bearing, not decoration.** oxlint resolves its configuration from the working
  directory, and turbo runs each package's `lint` script with the working directory inside that
  package. A package with no config there would not find the root one at all.
- **They need no build.** The sources are `.ts` and Node type-strips them, the same arrangement
  `@warehouser/tsconfig` uses — so `lint` has no `dependsOn` for this package and there is nothing to
  rebuild before a lint run.
- **They are ESM**, like every configuration in this repository; every workspace package and the
  root are `"type": "module"`.
- **Only one config per directory.** oxlint fails the run outright when it finds both an
  `.oxlintrc.json` and an `oxlint.config.ts` beside each other, rather than picking one.

## 4. Changing a rule

A rule severity or option is changed in `packages/oxlint-config`, never by copying a block into a
package config. A package config carries only what is specific to it: its `env`, its
`ignorePatterns`, and `overrides` that are true of that package alone.

Three properties of the merge decide how a change behaves. All three fail silently — the lint stays
green while the effective rules are not the ones the config appears to state.

- **`extends` is deliberately unused.** oxlint's `extends` merges only `rules`, `plugins` and
  `overrides`, and it **drops each rule's options**: `complexity: ['warn', { max: 20 }]` reaches a
  child as a bare `complexity: 'warn'` with the default cap. That is how all five packages once ran
  `max-lines-per-function` at 50 instead of 200. `mergeOxlintConfig` composes the layers in
  JavaScript instead, and hands each consumer one flat, self-contained config.
- **`plugins` and `jsPlugins` are replaced, never unioned.** A layer that states its own `plugins`
  list must repeat every plugin it still wants — `src/ui.ts` repeats all seven of the baseline's
  before adding its three. Dropping one by omission switches that plugin off for that consumer alone.
- **`options` belongs only to the run's root config.** oxlint fails outright when a nested config
  declares it. It lives in the exported `rootOptions` and is applied by the repository-root
  `oxlint.config.ts` and nowhere else.

A further property is oxlint's own, and it governs whether a change is even worth making: oxlint
files far more rules under `correctness` — its one default-on category — than ESLint's recommended
preset contained. Turning a plugin on turns its **whole** `correctness` surface into errors. Adopt a
plugin rule by rule, naming what you keep and naming what you decline with the count it produced on
this tree; `src/base.ts` and `src/ui.ts` are written that way throughout.

Prove a config change rather than trusting a green run:

```sh
pnpm exec oxlint --print-config .   # in each package, before and after; diff the JSON
pnpm lint
pnpm lint:all
```

Diff severities and rule options separately — the options are what `extends` used to eat, and a
green `pnpm lint` says nothing about them.

## 5. Suppressing a rule in code

In order of preference: fix the code; narrow the rule in the shared config; add an `overrides` entry
scoped to a file glob when the exemption is a property of a whole class of files (the `src/**/*.spec.ts`
relaxations are the model); and only then an inline directive.

An inline directive names the rule the way oxlint names it and carries its reason after `--`:

```ts
// oxlint-disable-next-line typescript/no-unnecessary-condition -- `Object.values` widens away the
// `| undefined` each optional property carries, so the rule concludes the operands cannot overlap.
```

The prefixes are not ESLint's:

| ESLint name                        | oxlint name                                                            |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `@typescript-eslint/no-deprecated` | `typescript/no-deprecated`                                             |
| a core rule, `no-unused-vars`      | `no-unused-vars` (written bare; `eslint/no-unused-vars` also resolves) |
| `react-hooks/rules-of-hooks`       | `react/rules-of-hooks` — oxlint has no `react-hooks/` prefix           |
| `import-x/no-cycle`                | `import/no-cycle`                                                      |
| `jsx-a11y/no-autofocus`            | unchanged                                                              |

`eslint-disable` comments are honoured, which is what keeps the directives written before the
migration suppressing exactly what they always did. It is oxlint's default, and the repository root's
`rootOptions` states `respectEslintDisableDirectives: true` outright so that an upstream default flip
cannot take all of them at once. Write new ones as `oxlint-disable`.

A rule oxlint does not implement can be neither enforced nor suppressed. A directive naming one —
`import/order`, `no-restricted-syntax`, a plugin that no longer runs — is dead text that reads like a
live exemption. Find them:

```sh
pnpm exec oxlint --type-aware --report-unused-disable-directives .
```

## 6. The two ESLint plugins that survive

`eslint-plugin-no-relative-import-paths` and `eslint-plugin-simple-import-sort` run through oxlint's
`jsPlugins` bridge, because oxlint implements nothing equivalent:

- `no-relative-import-paths` with `rootDir: 'src'` is why roughly 4000 specifiers in this repository
  read `shared/...` rather than `../../shared/...`. oxlint's `import/no-relative-parent-imports` bans
  `../` only, permits `./sibling`, takes no options and has no fixer, so it is not a substitute.
- `simple-import-sort` is the only import orderer in the repository. `import/order` — which oxlint
  also lacks — is retired in its favour.

Two consequences to respect. The bridge is documented as alpha and explicitly outside semver, which
is why `oxlint` is pinned to an exact version in the `pnpm-workspace.yaml` catalog rather than
caret-ranged; a version bump is a deliberate change with a lint run behind it, not a dependency
refresh. And `extends` does not merge `jsPlugins` at all, which is why the list lives in the shared
baseline and a consumer that restates it must restate all of it.

## 7. The commit gate

`.husky/pre-commit` runs `lint-staged`. For every staged `*.{js,jsx,ts,tsx,mjs,cjs}` file it runs, in
order: `oxlint --type-aware --fix`, then `oxlint --type-aware --max-warnings=0`, then
`prettier --write` — and re-stages what was rewritten. Any staged `apps/server/src/**/*.ts` also runs
the server's architectural tier, once, for the whole commit.

Three things follow:

- **Staged files only.** oxlint is fast enough to lint the whole tree on every commit, but doing so
  would let an unrelated pre-existing violation elsewhere block an unrelated commit — a change in
  what the gate means, not just in how it runs.
- **The strictness is the same one `pnpm lint` uses.** `--max-warnings=0` is not extra severity for
  the hook; every package's `lint` script passes it too. What differs is the _selection_: the hook
  judges the staged paths, including files that sit outside a package's `src` and so are never
  reached by `pnpm lint`.
- **`--fix` is the safe tier only.** `--fix-suggestions` and `--fix-dangerously` may change program
  behaviour and are used neither here nor in any `lint:fix` script.

A failing hook means the change is not ready. Fix what it reports and commit again — see
`AGENTS.md` § Committing, which also states that the hooks are never to be bypassed.

## 8. What the linter does not own

- **Formatting — Prettier does.** `quotes`, `linebreak-style` and `prettier/prettier` are not ported;
  `.prettierrc.js` is where those answers live, and `prettier --write` runs on its own.
- **Types — `tsc` does.** The baseline switches off, for TypeScript files only, the fifteen core
  rules the compiler already reports with a better message and no false positives.
- **Rules oxlint has no equivalent for — a test does.** `no-restricted-syntax` is not implemented, and
  the one control that used it now lives in
  `apps/web/src/test/effective-warehouse-id/effective-warehouse-id.spec.ts`, where it is stronger: a
  spec cannot be waved through with an inline disable comment. When a rule you want does not exist,
  write the spec; do not write a comment asking people to be careful.

## Related

- [Replace ESLint with oxlint](../adr/11-09-2026-oxlint-replaces-eslint.md) — why the linter changed,
  what was gained, and what was lost.
- [Frontend architecture](../frontend-architecture.md) and
  [Server architecture](../server-architecture.md) — the per-application checks to run before
  completing work, of which `lint` is one.
- `packages/oxlint-config/src/base.ts` — the baseline itself. Every rule it declines is named with
  what it actually found on this tree; read it before proposing a rule change.
