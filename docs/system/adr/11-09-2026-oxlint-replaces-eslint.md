# Replace ESLint With oxlint

Status: Accepted

Date: 2026-09-11

## Context

Until this decision the repository linted with ESLint 9 flat config. The arrangement was five
`eslint.config.mjs` files — one per linted package — on top of three workspace config packages
(`@warehouser/eslint-config-base`, `-service`, `-ui`) and fourteen external `eslint*` dependencies
(`eslint`, `typescript-eslint`, `@typescript-eslint/*`, `eslint-config-prettier`,
`eslint-plugin-import`, `-react`, `-react-hooks`, `-prettier`, `-simple-import-sort`,
`-unused-imports`, `-no-relative-import-paths`, `eslint-import-resolver-typescript`, `@eslint/js`).

Three costs came with it, all observed in this tree:

- **Type-aware linting was the slow half of every gate.** The rules this repository most depends on
  — `no-floating-promises`, `no-misused-promises`, `only-throw-error`, the `no-unsafe-*` family —
  need type information, and under `typescript-eslint` that means building a TypeScript program per
  run. It was the dominant cost of `pnpm lint` and of every pre-commit hook.
- **The commit hook was 200 lines of linter workarounds.** `.lintstagedrc.js` grouped staged files by
  their nearest `eslint.config.*`, asked ESLint's Node API which of them were ignored, then changed
  directory into each package and shelled out to `npx eslint` twice. None of that logic was about
  what the repository wanted checked; all of it was about what ESLint could not resolve for itself.
- **The NestJS line this server tracks had already moved.** After the upgrade to NestJS 12, the
  framework packages `apps/server` depends on lint themselves with oxlint: `@nestjs/config@12.0.0`,
  `@nestjs/typeorm@12.0.1`, `@nestjs/jwt@12.0.1` and `@nestjs/passport@12.0.0` each declare `oxlint`
  in `devDependencies` and an `oxlint` `lint` script. Staying on ESLint meant diverging from the
  tooling of the framework whose idioms the server's lint config exists to accommodate.

oxlint is a Rust linter that parses and lints in parallel, reads an ESLint-compatible configuration,
and honours `eslint-disable` comments. Its type-aware rules run through `oxlint-tsgolint`, a separate
binary with its own embedded typescript-go engine — so it needs no `typescript` package of its own
and the repository stays on TypeScript 5.9.3. Measured on this tree after the migration, a whole-tree
type-aware run over 876 files takes about 3.2 seconds of wall time.

## Decision

**oxlint is the repository's only linter.** Prettier remains the only formatter and runs separately;
no formatting rule lives in the linter.

The arrangement that implements it:

- One workspace package, `@warehouser/oxlint-config`, holds three layers — a repository baseline, a
  NestJS service layer, and a React UI layer — exposed as `createBaseConfig`, `createServiceConfig`
  and `createUiConfig`. Each linted package and the repository root carries one `oxlint.config.ts`
  that calls a factory and states only what is true of that package.
- The layers are composed in JavaScript by `mergeOxlintConfig`, not by oxlint's `extends`. `extends`
  merges only `rules`, `plugins` and `overrides`, and it drops each rule's **options** — which is how
  every package once ran `max-lines-per-function` at the default 50 rather than the configured 200.
- Every `lint` script passes `--type-aware --max-warnings=0`. The flag is on the command line rather
  than in `options`, because `options` is accepted only in a run's root config and would therefore
  apply to `pnpm lint:all` while silently not applying to `pnpm --filter <pkg> lint`.
- Two ESLint plugins survive through oxlint's `jsPlugins` bridge, because oxlint implements nothing
  equivalent: `no-relative-import-paths` (the reason ~4000 specifiers read `shared/...`) and
  `simple-import-sort`. Because that bridge is documented as alpha and outside semver, `oxlint` is
  pinned to an exact version in the catalog rather than caret-ranged.
- Rules are adopted one at a time, never by category. oxlint files far more rules under `correctness`
  — its one default-on category — than ESLint's recommended preset contained, so enabling a plugin
  turns its whole surface into errors.

The procedure that follows from this — how to run it, change a rule, and suppress one — is
[Linting with oxlint](../guides/linting-with-oxlint.md).

## Alternatives

- **Stay on ESLint 9.** Rejected. It keeps the type-aware cost, keeps the 200-line hook, and now also
  diverges from the NestJS packages' own tooling. Nothing about the setup was wrong; it had simply
  stopped being the cheapest way to get these checks.
- **Biome.** One tool for both linting and formatting, and faster than ESLint. Rejected because
  adopting it displaces Prettier and reformats the entire tree in the same change — a diff that buries
  the lint decision — and because its TypeScript rule surface is materially smaller than the
  type-aware set this repository relies on.
- **Run oxlint for speed and keep ESLint for the rules only it has.** Rejected. Two linters means two
  configurations, two disable-comment vocabularies, and a standing question about which one owns a
  given rule. The handful of rules oxlint lacks is not worth that; the ones that mattered are listed
  as losses below, and one of them became a test instead.
- **Convert the two surviving plugins to native oxlint rules.** Deferred, not rejected. It would
  remove the alpha `jsPlugins` bridge and the exact version pin, but it is a separate piece of work
  with its own risk, and the bridge is doing its job today.

## Consequences

**What it bought.**

- The type-aware gate is fast enough that the commit hook runs two full oxlint passes over the staged
  files — a fix pass and a check pass — and still costs less than the old hook's file-grouping did.
- `.lintstagedrc.js` went from 200 lines to 62, and what remains describes the gate rather than the
  linter's limitations.
- One shared config package replaced three, and each consumer's config is a factory call rather than a
  restated copy of `env`, `ignorePatterns`, `settings` and `jsPlugins`.
- Coverage that the ESLint setup never had: the import-cycle check now runs in `apps/server` — the
  half of the repository with a DI graph, where a cycle surfaces as an `undefined` provider far from
  its cause — and the `promise` and `vitest` plugins run everywhere. `vitest/no-focused-tests` closes
  the largest blind spot of the old setup: a committed `it.only` reduced a spec file to one test and
  the gate still reported green.

**What it costs, honestly.**

- **Rules genuinely lost.** `react/no-deprecated`, `import/no-useless-path-segments`,
  `react/prefer-stateless-function` and `import/order` have no oxlint equivalent.
  `max-nested-callbacks` is off pending an oxlint defect: it double-counts an arrow passed as an
  object property value inside a call argument, disagreeing with ESLint on 14 of 50 sites in one spec
  and fabricating five warnings that would have made those files uncommittable.
- **`no-restricted-syntax` has no equivalent either**, and it enforced the `effectiveWarehouseId`
  control. It moved to `apps/web/src/test/effective-warehouse-id/effective-warehouse-id.spec.ts`,
  which is stronger than the rule it replaces — a spec cannot be silenced with a disable comment — but
  it is a different mechanism, and the next rule oxlint lacks will need the same treatment rather than
  a config entry.
- **Two directive spellings coexist.** All 71 pre-existing `eslint-disable` comments still suppress,
  none were rewritten, and `--report-unused-disable-directives` reports zero; `respectEslintDisableDirectives`
  is switched on in the root config to keep it that way. The cost is that the codebase now contains
  both `eslint-disable` and `oxlint-disable` comments meaning the same thing, and a silent upstream
  default flip would take all 71 with it.
- **An alpha dependency is on the critical path.** The `jsPlugins` bridge is outside semver, so
  `oxlint` is pinned exactly and a patch bump is a deliberate change with a lint run behind it.
- **Category semantics are a standing hazard.** Because oxlint puts so much under `correctness`,
  adding a plugin, or leaving a category alone, opts the tree into checks nobody chose. Every rule
  this repository declines is named in `packages/oxlint-config/src/base.ts` with the count it produced
  here, and that discipline has to be kept up.
- **`oxlint-tsgolint` does not follow pnpm's symlinked `node_modules/@types`.** Three `tsconfig.json`
  files name their `types` explicitly as a result; without it, 137 spurious `no-unsafe-*` diagnostics
  fire on types `tsc` resolves fine.

## Links

- [Linting with oxlint](../guides/linting-with-oxlint.md) — the procedure.
- `packages/oxlint-config/src/base.ts` — the baseline, with every declined rule named and measured.
- `.lintstagedrc.js` and `AGENTS.md` § Committing — the commit gate this decision feeds.
