/**
 * The repository-wide lint baseline — the successor to `packages/eslint-config-base`, and the
 * config that used to live in the repository root's own `oxlint.config.ts`.
 *
 * It is a plain object rather than a config file. oxlint's `extends` never resolves a workspace
 * package by name, and it merges only `rules`, `plugins` and `overrides` — `env`, `globals`,
 * `settings`, `ignorePatterns`, `jsPlugins` and `options` do NOT inherit. Both limits go away when
 * the shared layer is an ordinary Node module: `createBaseConfig()` in `./index.ts` merges every
 * field in JavaScript and hands oxlint one flat, self-contained config, so no consumer has to
 * restate `jsPlugins` or `plugins: []` to keep what this file declares.
 *
 * Nothing here is a rule this repository invented for the shared layer: it is the former root
 * `oxlint.config.ts` verbatim, minus the exclusions that only made sense at the repository root.
 */
import type { OxlintConfig } from 'oxlint';

/**
 * `options` is not part of the baseline, and must not be: oxlint accepts the field only in the
 * *root* config of a run, and fails the whole run when a nested one declares it. During
 * `pnpm --filter <pkg> lint` that package's config is the root config, but during `pnpm lint:all`
 * the same file is a nested one — so a shared layer that emitted `options` everywhere would make
 * the two runs mutually exclusive. Only the repository root's `oxlint.config.ts` passes this.
 *
 * Nothing is lost by the packages not carrying it: `respectEslintDisableDirectives` is `true` by
 * default. It is stated at the root because 71 `// eslint-disable` comments are load-bearing across
 * `apps/server/src` — `max-lines-per-function` in the long HTTP-contract suites and
 * `no-relative-import-paths/no-relative-import-paths` in the PGlite test harness, which must reach
 * its own directory before the alias trie is installed — and a silent upstream default flip would
 * take all 71 with it.
 *
 * Type-aware linting is switched on per run with `--type-aware` on the command line rather than
 * with `options.typeAware` here, for the same root-config-only reason: setting it would apply to a
 * whole-repo run and silently not apply to `pnpm --filter <pkg> lint`. The CLI flag takes
 * precedence and works from any cwd.
 */
export const rootOptions: OxlintConfig['options'] = {
  respectEslintDisableDirectives: true,
};

export const baseConfig: OxlintConfig = {
  // `eslint`, `typescript`, `unicorn` and `oxc` are oxlint's defaults. They are listed rather than
  // left implicit so that the merge in `./index.ts` has something to replace: a consumer that wants
  // more plugins (`apps/web`) states the whole list, and one that wants exactly these states
  // nothing. Under `extends` this had to be `plugins: []` in every child, because oxlint unions a
  // declared list with the parent's and re-adds its own defaults when the key is absent.
  //
  // `import`, `promise` and `vitest` are the three added after the migration. All three used to be
  // reachable only from `apps/web` (`import`) or from nowhere at all, which meant `apps/server` —
  // the half of the repository with a DI graph and the larger test suite — ran neither the
  // cycle check nor any test-framework rule. Each one's rule severities are set below; a plugin
  // turns its whole `correctness` surface into errors, so the ones that misread this repository's
  // idioms are named `off` there rather than left to fire.
  //
  // `plugins` is REPLACED, never unioned, by `mergeOxlintConfig` — so `./ui.ts`, which states its
  // own list, has to repeat all seven of these. It does.
  plugins: [
    'eslint',
    'typescript',
    'unicorn',
    'oxc',
    'import',
    'promise',
    'vitest',
  ],

  // Two ESLint plugins survive the migration because oxlint implements nothing equivalent.
  //
  // `no-relative-import-paths` with `rootDir: 'src'` is the reason ~4000 specifiers in this
  // repository read `shared/...` rather than `../../shared/...`. oxlint's
  // `import/no-relative-parent-imports` bans `../` only, permits `./sibling`, takes no options and
  // has no fixer, so it is not a substitute.
  //
  // `simple-import-sort` is now the only import orderer in the repository. `import/order` — which
  // `apps/web` used and which oxlint also lacks — is retired; the old UI config had to switch
  // `simple-import-sort` off to stop the two fighting, so unifying on one sorter removes that wart
  // rather than adding a loss.
  //
  // The `jsPlugins` bridge is documented as alpha and outside semver, which is why `oxlint` is
  // pinned to an exact version in the catalog. `extends` does not merge `jsPlugins`, which is why
  // every consumer used to restate this list; the factory carries it instead.
  jsPlugins: [
    'eslint-plugin-no-relative-import-paths',
    'eslint-plugin-simple-import-sort',
  ],

  env: { es2022: true },

  // Shared, config-relative exclusions. `.gitignore` is honoured automatically, which already
  // covers `node_modules/`, `dist/`, `.turbo/`, `coverage/` and the worktree directories.
  //
  // `oxlint.config.ts` is here rather than in each consumer: every one of them is outside its own
  // `tsconfig.json`'s `include`, so the type-aware pass has no program for it and would type every
  // value in it as `any`. The pattern has no leading slash, so it matches at any depth — which is
  // what makes it cover the sibling configs during a whole-repository run as well.
  //
  // Anything that is specific to one consumer — `vitest.config.ts`, `apps/web`'s build output
  // directories, the repository root's tooling files — is passed to the factory by that consumer
  // and appended to this list.
  ignorePatterns: ['**/*.gen.ts', '**/routeTree.gen.ts', 'oxlint.config.ts'],

  // `correctness` is oxlint's only default-on category and is the closest analogue of
  // `eslint:recommended` + `tseslint.configs.recommended`. Every other category stays off and the
  // rules this repository wants out of them are named individually below, exactly as the ESLint
  // config named them.
  categories: {
    correctness: 'error',
    suspicious: 'off',
    pedantic: 'off',
    perf: 'off',
    style: 'off',
    restriction: 'off',
    nursery: 'off',
  },

  rules: {
    // ---- `tseslint.configs.recommended` members that are not oxlint `correctness`.
    'typescript/ban-ts-comment': 'error',
    'no-array-constructor': 'error',
    'typescript/no-empty-object-type': 'error',
    'typescript/no-explicit-any': 'error',
    'typescript/no-namespace': 'error',
    'typescript/no-require-imports': 'error',
    'typescript/no-unnecessary-type-constraint': 'error',
    'typescript/no-unsafe-function-type': 'error',

    // ---- `tseslint.configs.recommendedTypeChecked` members that are not oxlint `correctness`.
    // These are the type-aware rules; they only run under `--type-aware`.
    'typescript/no-misused-promises': 'error',
    'typescript/no-unnecessary-type-assertion': 'error',
    'typescript/no-unsafe-enum-comparison': 'error',
    'typescript/only-throw-error': 'error',
    'typescript/prefer-promise-reject-errors': 'error',
    'typescript/require-await': 'error',
    'typescript/restrict-plus-operands': 'error',
    'typescript/no-unsafe-argument': 'error',
    'typescript/no-unsafe-call': 'error',
    'typescript/no-unsafe-member-access': 'error',
    'typescript/no-unsafe-return': 'error',
    // The base ESLint config turned this one off outright, for both apps and all three packages.
    'typescript/no-unsafe-assignment': 'off',

    // ---- The one rule oxlint's `correctness` category adds that this repository declines.
    // `no-misused-spread` belongs to `typescript-eslint`'s `strict` tier, which this repository has
    // never run — oxlint files it under `correctness`, so leaving it alone would opt the whole tree
    // into a stricter preset as a side effect of changing linters. It also happens to be wrong on
    // both shapes it finds here: `[...value].length` in `packages/contracts` counts code points on
    // purpose (its own spec feeds it an astral string and asserts the count is halved), and the 27
    // sites in `apps/server`'s test factories spread an `overrides` object literal whose *type* is
    // a `Partial<…Entity>` but which is never a class instance at runtime. Adopting the `strict`
    // tier is a decision worth making deliberately, not one to make by accident here.
    'typescript/no-misused-spread': 'off',

    // ---- `eslint:recommended` members that are not oxlint `correctness`. These three are the
    // whole difference between the two presets once the rules TypeScript supersedes (the override
    // at the foot of this file) and the base config's own list are taken out.
    // `no-unexpected-multiline` is deliberately absent: `eslint-config-prettier` switched it off and
    // nothing switched it back on, so it was not running before this change either.
    'no-case-declarations': 'warn',
    'no-fallthrough': 'error',
    'no-prototype-builtins': 'error',

    // ---- The two rules `typescript-eslint`'s `eslint-recommended` layer *adds* because TypeScript
    // makes them free: `let`/`const` transpile to `var` and spread transpiles to `apply`.
    'no-var': 'error',
    'prefer-spread': 'error',

    // ---- The base config's explicit rule list, in its original order.
    'max-classes-per-file': 'off',
    // oxlint has no `typescript/no-use-before-define`; the one `eslint/` rule is TS-aware and
    // accepts the same `"nofunc"` argument.
    'no-use-before-define': ['error', 'nofunc'],
    // Replaces both `unused-imports/no-unused-imports` (`warn`, no oxlint plugin) and
    // `@typescript-eslint/no-unused-vars` (`error`, from the recommended preset) — oxlint has one
    // TS-aware `no-unused-vars` that does the work of both, so it takes the stricter of the two
    // severities. `fix.imports: "safe-fix"` promotes unused-import removal out of the dangerous
    // tier so a plain `--fix` still deletes them, and `fix.variables: "off"` keeps it from touching
    // anything else — which is exactly what the old `unused-imports` rule did.
    'no-unused-vars': [
      'error',
      { fix: { imports: 'safe-fix', variables: 'off' } },
    ],
    'no-relative-import-paths/no-relative-import-paths': [
      'warn',
      { rootDir: 'src' },
    ],
    'simple-import-sort/imports': 'warn',
    'simple-import-sort/exports': 'warn',
    'no-void': 'off',
    'no-continue': 'off',
    curly: ['warn', 'all'],
    // `linebreak-style` and `quotes` are deliberately not ported. Both are formatting rules and
    // Prettier already owns them (`.prettierrc.js` sets `singleQuote: true`; `endOfLine` defaults
    // to `lf`). `prettier/prettier` is gone for the same reason — `prettier --write` runs on its
    // own in `.lintstagedrc.js`.
    'typescript/explicit-member-accessibility': [
      'error',
      { accessibility: 'no-public' },
    ],
    'typescript/explicit-function-return-type': [
      'error',
      { allowExpressions: true },
    ],
    'class-methods-use-this': 'off',
    'accessor-pairs': 'warn',
    complexity: ['warn', { max: 20 }],
    'default-case': 'warn',
    'default-case-last': 'warn',
    eqeqeq: ['warn', 'always', { null: 'ignore' }],
    'grouped-accessor-pairs': 'warn',
    'max-lines': [
      'warn',
      { max: 1000, skipBlankLines: true, skipComments: true },
    ],
    'max-lines-per-function': [
      'warn',
      { max: 200, skipBlankLines: true, skipComments: true },
    ],
    // OFF, and not by choice: oxlint 1.82.0's `max-nested-callbacks` counts a different depth from
    // ESLint's. Measured on `apps/web/src/modules/workspace/components/WorkspaceAdministration.spec.tsx`
    // with `max: 0`, so every function is reported with its depth: of the 50 sites both implementations
    // agree exist, they disagree on 14, oxlint counting one or two deeper from line 481 onward. The
    // trigger is an arrow function that is an object *property* value inside a call's argument
    // (`stubWorkspaceServer({ onRenameWorkspace: () => ({ … }) })`): ESLint never pushes it on the
    // callback stack, oxlint pushes it and does not pop it, so every later sibling in the file is
    // counted deeper than it is. At `max: 4` that fabricates 5 warnings in `apps/web` — and since the
    // pre-commit hook runs `--max-warnings=0` on staged files, leaving the rule on would make those
    // five spec files uncommittable for a defect that is not in them. Restore this to
    // `['warn', { max: 4 }]` once oxlint's stack handling matches.
    'max-nested-callbacks': 'off',
    'max-statements': ['warn', { max: 30 }],
    'no-alert': 'warn',
    'no-bitwise': 'warn',
    'no-caller': 'error',
    'no-console': 'warn',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-empty-static-block': 'warn',
    'no-eq-null': 'warn',
    'no-eval': 'error',
    'no-extend-native': 'warn',
    'no-global-assign': 'error',
    'no-lone-blocks': 'warn',
    'no-multi-assign': 'warn',
    'no-new-func': 'error',
    'no-new-wrappers': 'warn',
    'no-nonoctal-decimal-escape': 'error',
    // `no-octal` and `no-octal-escape` are not ported — oxlint implements neither. Nothing is
    // actually lost: a legacy octal literal (`071`) and a legacy octal escape (`"\071"`) are both
    // syntax errors under `"use strict"` and in ES modules, which is every file here.
    'no-param-reassign': ['warn', { props: true }],
    'no-regex-spaces': 'warn',
    'no-restricted-exports': 'warn',
    'no-restricted-globals': 'warn',
    'no-restricted-properties': 'warn',
    // `no-restricted-syntax` is not ported — oxlint implements no such rule, and its only
    // configured use was the `effectiveWarehouseId` control in `apps/web`. That control now lives
    // in `apps/web/src/test/effective-warehouse-id/effective-warehouse-id.spec.ts`, where it is
    // stronger: a spec cannot be waved through with an inline disable comment.
    'no-return-assign': 'warn',
    'no-script-url': 'warn',
    'no-sequences': 'warn',
    'no-shadow-restricted-names': 'error',
    'no-throw-literal': 'warn',
    'no-unused-labels': 'warn',
    'no-useless-call': 'warn',
    'no-useless-catch': 'warn',
    'no-useless-escape': 'warn',
    'no-useless-rename': 'warn',
    'no-useless-return': 'warn',
    'no-with': 'error',
    'prefer-const': 'warn',
    'prefer-named-capture-group': 'warn',
    'prefer-object-has-own': 'warn',
    'prefer-regex-literals': 'warn',
    'prefer-rest-params': 'warn',
    'prefer-template': 'warn',
    'preserve-caught-error': 'warn',
    'require-unicode-regexp': 'warn',

    // ======================================================================================
    // Added after the ESLint migration. Everything above this line is a rule the ESLint
    // config also ran; everything below is new, and each entry records what it was measured
    // at on this tree when it was adopted.
    // ======================================================================================

    // ---- ESM and string hygiene. Both measured at zero findings repository-wide, so they are
    // regression guards rather than cleanups.
    //
    // `prefer-node-protocol` matters because `apps/server` is ESM now: a bare `'crypto'` resolves
    // to the builtin only by the resolver's own precedence and loses to a userland package of that
    // name if one ever enters the graph. All ~40 builtin imports already write `node:`.
    'unicorn/prefer-node-protocol': 'error',
    // A `'${x}'` in single quotes is not interpolated, and Prettier's `singleQuote: true` plus the
    // volume of i18n message strings here is exactly the shape that produces one.
    'no-template-curly-in-string': 'warn',

    // ---- Type-aware additions. These run only under `--type-aware`, which every `lint` script in
    // the repository passes.
    //
    // `no-deprecated` is the one with live findings: 146 in `packages/contracts` (Zod v3 APIs that
    // v4 deprecated), 8 in `apps/web` (`React.FormEvent`, which React's own types now say does not
    // exist, and `ZodTypeAny`), 5 in `apps/server` (including `scanFromPrototype`, a Nest API that
    // will not survive the next major). NOTE: `packages/*` lint with `--max-warnings=0`, so this is
    // fatal in `packages/contracts` until that migration is done — see the note in
    // `packages/contracts/oxlint.config.ts`.
    'typescript/no-deprecated': 'warn',
    // Reports conditions that provably cannot change the outcome — which is where dead defensive
    // code and genuinely wrong narrowing both hide. Several findings here are
    // "the types have no overlap", which is a defect rather than a nit. 24 in `apps/server`,
    // 48 in `apps/web`, 2 in `packages/contracts`. oxlint files it under `nursery`; it is named
    // explicitly, which enables it regardless of the category being off.
    'typescript/no-unnecessary-condition': 'warn',
    // `||` on a `number` or a `string` swallows `0` and `''` — in a warehouse domain that is a
    // quantity of zero silently becoming a default. 1 finding.
    'typescript/prefer-nullish-coalescing': 'warn',

    // ---- Type-only imports. `separate-type-imports` (the default fix style) is deliberate: it
    // produces the top-level `import type { … }` form, which is what the 446 existing type imports
    // in `apps/server` already use and what `import/consistent-type-specifier-style` below also
    // wants. The two rules would fight if this were `inline-type-imports`.
    //
    // `disallowTypeAnnotations` defaults to `true`, which bans `typeof import('…')` in a type
    // position. That form is not optional in a Vitest module mock: `vi.mock` is hoisted above the
    // import block, so the factory types its own `importOriginal<typeof import('…')>()` inline —
    // a top-level import of the module being mocked would both defeat the hoist and be the very
    // thing the mock replaces. Ten spec files across `apps/web` do this, all correctly.
    //
    // TURNED OFF FOR `apps/server` in `./service.ts` — see the reasoning there. It is a runtime
    // hazard under `emitDecoratorMetadata`, not a style preference.
    'typescript/consistent-type-imports': [
      'error',
      {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
        disallowTypeAnnotations: false,
      },
    ],

    // ---- import. The plugin now runs everywhere rather than only in `apps/web`.
    //
    // `no-cycle` is the reason: in a NestJS application a circular import is the classic cause of
    // an `undefined` provider at injection time, and the failure surfaces far from the cycle.
    // `apps/server` is the half of the repository that has a DI graph and it had no cycle check at
    // all. Measured at zero cycles in every package, so it is a guard rather than a cleanup.
    // `apps/web` already ran it at `warn`; `./ui.ts` keeps that severity.
    'import/no-cycle': 'error',
    'import/no-duplicates': 'warn',
    'import/consistent-type-specifier-style': 'warn',

    // ---- promise. Thirteen of the plugin's sixteen rules are on and all thirteen are at zero
    // findings across `apps/*` and `packages/*` — this codebase is uniformly async/await, so they
    // are guards rather than cleanups. `no-callback-in-promise` and `no-new-statics` are
    // `correctness` and come on with the plugin itself; the rest are named because their categories
    // are off.
    'promise/always-return': 'warn',
    'promise/catch-or-return': 'warn',
    'promise/no-multiple-resolved': 'warn',
    'promise/no-nesting': 'warn',
    'promise/no-promise-in-callback': 'warn',
    'promise/no-return-in-finally': 'warn',
    'promise/no-return-wrap': 'warn',
    'promise/param-names': 'warn',
    'promise/prefer-catch': 'warn',
    'promise/spec-only': 'warn',
    'promise/valid-params': 'warn',

    // The three that are OFF, and what each one actually found here. All three are `style`: they
    // express a preference for async/await over the promise primitives, and every finding on this
    // tree is at a site where the primitive is the correct tool and `await` is not available.
    //
    // `avoid-new` — 37 findings, all of them the one thing `new Promise` exists for: adapting a
    // callback-only API. `shared/domain/security/password-hashing.ts` wraps node's `scrypt`,
    // `packages/utils/src/async/sleep.ts` wraps `setTimeout`, and `apps/web`'s `router.spec.tsx`
    // builds test deferreds.
    'promise/avoid-new': 'off',
    // `prefer-await-to-callbacks` — 20 findings, and they are the same executors `avoid-new` flags
    // plus `shared/database/db-transaction.service.ts`, whose *own* public API takes a callback
    // (`runInTransaction(cb)`). There is nothing to await.
    'promise/prefer-await-to-callbacks': 'off',
    // `prefer-await-to-then` — 21 findings at module top level in non-async modules, where `await`
    // is not reachable: `apps/web/src/i18n.ts` does
    // `void i18nReady.then(() => syncDocumentLanguage(…))` as a side effect of loading the module.
    'promise/prefer-await-to-then': 'off',

    // ---- vitest. The plugin is on for its `correctness` tier, which is where the rules worth
    // having live: `no-focused-tests` in particular closes the largest blind spot in the previous
    // setup — a committed `it.only` reduced a spec file to one test and the gate still reported
    // green. It, `no-disabled-tests`, `no-standalone-expect`, `hoisted-apis-on-top`,
    // `no-conditional-tests`, `prefer-snapshot-hint`, `require-awaited-expect-poll` and
    // `require-local-test-context-for-concurrent-snapshots` are all at zero findings and stay on.
    //
    // The six below are `correctness` too, so they arrive as errors, and every one of them misreads
    // an idiom this repository uses on purpose. Each is named with what it actually found.
    //
    // `require-mock-type-parameters`: 335 findings in `apps/server` and 209 in `apps/web`. Noise,
    // and the reason this plugin must be adopted rule-by-rule rather than wholesale.
    'vitest/require-mock-type-parameters': 'off',
    // `require-to-throw-message`: 23 findings. The suites here assert on the error *object*
    // (`rejects.toMatchObject({ code })`), which is stronger than a message substring.
    'vitest/require-to-throw-message': 'off',
    // `expect-expect` and `valid-describe-callback` share one root cause: the integration suites
    // pass a named function as the block body — `it('… (AC-11)', verifyCreateRenameArchiveRestore)`
    // and `describe('… (AC-33)', registerMembersTests)` — and neither rule follows the identifier.
    // 14 and 7 findings respectively, all false.
    'vitest/expect-expect': 'off',
    'vitest/valid-describe-callback': 'off',
    // `valid-title`: 2 findings, both `describe(DbTransactionService.name, …)`. A computed title
    // that tracks the class it covers is better than a literal that can drift from it.
    'vitest/valid-title': 'off',
    // `no-conditional-expect`: 3 findings, all deliberate. `rename-workspace.command.integration.
    // spec.ts` loops over invalid names inside a try/catch that throws `expected rejection did not
    // occur` in the try, so the assertions cannot be skipped; `home/route.spec.tsx` swallows a
    // `waitFor` rejection on purpose to test the *unresolved* window and asserts after it.
    'vitest/no-conditional-expect': 'off',
  },

  overrides: [
    {
      // `typescript-eslint`'s `eslint-recommended` layer switched every one of these off for
      // TypeScript files, because the compiler already reports the same defect with a better
      // message and no false positives — the ts error code is named beside each. oxlint files them
      // all under `correctness`, so without this block the migration would silently turn on
      // fifteen checks the repository had deliberately delegated to `tsc`, and at least one of them
      // fires on legal code: `no-redeclare` reads the `const X = {...} as const` + `type X = ...`
      // declaration-merging pair in `packages/shared-types/src/enums/` as a duplicate.
      //
      // The file list mirrors `eslint-recommended`'s own, which is why it is scoped rather than
      // written as plain top-level rules: on a `.js` or `.mjs` file there is no compiler to defer
      // to and these rules should keep running.
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
      rules: {
        'constructor-super': 'off', // ts(2335) & ts(2377)
        'getter-return': 'off', // ts(2378)
        'no-class-assign': 'off', // ts(2629)
        'no-const-assign': 'off', // ts(2588)
        'no-dupe-class-members': 'off', // ts(2393) & ts(2300)
        'no-dupe-keys': 'off', // ts(1117)
        'no-func-assign': 'off', // ts(2630)
        'no-import-assign': 'off', // ts(2632) & ts(2540)
        'no-new-native-nonconstructor': 'off', // ts(7009)
        'no-obj-calls': 'off', // ts(2349)
        'no-redeclare': 'off', // ts(2451)
        'no-setter-return': 'off', // ts(2408)
        'no-this-before-super': 'off', // ts(2376) & ts(17009)
        'no-unreachable': 'off', // ts(7027)
        'no-unsafe-negation': 'off', // ts(2365) & ts(2322) & ts(2358)
        // `no-dupe-args`, `no-new-symbol` and `no-undef` are on the same list upstream but need no
        // entry: oxlint implements neither of the first two, and files `no-undef` under `nursery`,
        // which this config leaves off. `no-with` is on that list too, but the base config
        // re-enabled it at `error` above and that is what shipped.
      },
    },
  ],
};
