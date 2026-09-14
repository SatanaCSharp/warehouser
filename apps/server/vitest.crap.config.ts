import { readFile } from 'node:fs/promises';

import {
  type CrapTypescriptVitestOptions,
  CrapTypescriptVitestReporter,
  withCrapTypescriptVitest,
} from '@barney-media/crap-typescript-vitest';
import { defineConfig } from 'vitest/config';

/**
 * The CRAP tier: `CC^2 * (1 - coverage)^3 + CC` over the coverage of *every*
 * tier that exercises production code at runtime.
 *
 * Why this file exists at all. CRAP divides by coverage, so the gate is only as
 * honest as the denominator it is handed. Measured against the unit tier alone
 * — which is what `pnpm crap` did until this config — 52 of the 71 functions
 * scoring 0.0% coverage lived in a file with an `*.integration.spec.ts`
 * sibling: code that is thoroughly tested against PGlite, reported as untested,
 * and ranked at the top of the report for it. A repository method is *supposed*
 * to be tested against a database rather than mocks, so the old ranking
 * punished exactly the convention this app follows. Merging the tiers took the
 * worst score from 90.0 to 20.0 and the failing count from 50 to 9 without one
 * line of production code changing.
 *
 * `test.projects` is what closes that: one invocation runs the unit tier and
 * the PGlite tier, they write one `coverage-final.json` between them, and the
 * analyser reads that. PGlite is in-process, so this needs no Docker and no new
 * infrastructure, and neither tier config moves — they are referenced by path,
 * which keeps each one's own plugins and `resolve.alias` (the PGlite DataSource
 * swap in particular) intact.
 *
 * The architectural tier is deliberately absent. It parses the source tree with
 * ts-morph to assert where mappers live and how they are written; it never
 * calls the code it reads, so it would add analysis time and no coverage.
 *
 * The cost is real: this run pays for the PGlite tier, so it is materially
 * slower than the unit tier alone. That is the price of the number meaning
 * something, and it is why `crap` is a task of its own rather than a flag on
 * `test`.
 */

/**
 * 5.0 is the gate. The tool's own hard ceiling is 8.0 and its default is 6.0, so this is stricter
 * than either, and deliberately.
 *
 * Read the arithmetic before changing it. At 100% coverage the `(1 - coverage)^3` term vanishes and
 * CRAP *is* cyclomatic complexity, so the threshold doubles as a per-function CC cap: 5 permits
 * CC 5 only at exactly 100% coverage, CC 4 from 60.3%, CC 3 from 39.4%, and CC 2 from anything
 * above zero. A function at CC 5 therefore sits on a knife edge — one uncovered branch fails it —
 * which is why the decomposition this threshold forced aimed at CC 4 wherever it was free to.
 *
 * Raising it back is not a configuration change, it is a decision to stop holding the line the
 * refactor bought.
 */
const threshold = 5;

/**
 * Where the machine-readable report goes. The text report on stdout is for a
 * human reading a failed run; this is what {@link skipGuard} and any future CI
 * job read.
 */
const reportPath = './coverage/crap-report.json';

const analysis: CrapTypescriptVitestOptions = {
  threshold,
  excludes: [
    // The harnesses, fixtures and builders the specs share. The analyser's own
    // baseline filter drops `*.spec.ts` and `__tests__/` but knows nothing about
    // this layout, so without this it scores test support as production code —
    // and scores it badly, because nothing covers a harness.
    'src/test/**',
    // The process entrypoint, and the one file here that is composition and
    // nothing else: it constructs the Nest application, installs the body-parser
    // limit, the validation pipe and the platform configuration, and listens.
    // Every decision it appears to make is delegated to a function that is
    // tested on its own — `readHttpPlatformConfig` and `configureHttpPlatform`
    // both have specs — so its own complexity is two `??` defaults around calls
    // it cannot make without a running process. Covering it would mean doubling
    // `NestFactory` and asserting that the mock was called, which proves the
    // mock rather than the wiring. It is excluded rather than left scoring at
    // 0% so that the count of untested functions stays a count of real gaps.
    'src/main.ts',
  ],
  // No CI consumes a JUnit artifact yet, so writing one per run is litter.
  junit: false,
};

/**
 * The smallest cyclomatic complexity that could fail the gate if the analyser
 * could see it.
 *
 * A `skipped` function is one the analyser could not attribute coverage to, so
 * its true score is unknown — but its CC is not, and CC alone bounds the score
 * from below: the worst case is zero coverage, where CRAP is `CC^2 + CC`. Any
 * skipped function at or above this CC is therefore a failure the gate cannot
 * rule out, and {@link skipGuard} refuses to let it pass quietly. Below it, a
 * skip is provably harmless at this threshold.
 *
 * Deriving it from the threshold rather than hard-coding it means the bar
 * tightens on its own as the threshold ratchets down: at 8 it is CC 3, at 5 it
 * is CC 2.
 */
const unprovableComplexity = (): number => {
  let cc = 1;
  while (cc * cc + cc <= threshold) {
    cc += 1;
  }
  return cc;
};

interface CrapReportEntry {
  status: 'failed' | 'passed' | 'skipped';
  cc: number;
  method: string;
  src: string;
  lineStart: number;
}

/**
 * Makes the analyser's blind spot loud.
 *
 * The analyser matches a function to Istanbul's `fnMap` by name and span, and
 * when it matches more than one entry or none it scores the function `N/A` and
 * moves on. That is silent by construction: a `skipped` row is not a failure,
 * so a gate reading only the exit code reports success over code it never
 * measured. This app gets off lightly — 6 of 942 functions, all at CC 1–2, none
 * of which can fail at this threshold — but `apps/web` has 63, two of them the
 * most complex functions in that app, and the difference is TSX rather than
 * anything either app did. A tripwire that costs nothing while the count stays
 * harmless is worth having before it stops being harmless.
 *
 * `coverage.include` does not help: it fixes only the `file_unmatched` skip
 * reason, and these are not that. The fix for one of these is to restructure it
 * until the analyser can match it.
 */
const skipGuard = {
  async onFinishedReportCoverage(): Promise<void> {
    const bar = unprovableComplexity();
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
      methods: CrapReportEntry[];
    };

    const unmeasured = report.methods
      .filter((entry) => entry.status === 'skipped' && entry.cc >= bar)
      .sort((left, right) => right.cc - left.cc);

    if (unmeasured.length === 0) {
      return;
    }

    process.stderr.write(
      `\nCRAP could not measure ${String(unmeasured.length)} function(s) at CC >= ${String(bar)}, ` +
        `each of which could score above the threshold of ${String(threshold)}:\n` +
        unmeasured
          .map(
            (entry) =>
              `  CC ${String(entry.cc).padStart(2)}  ${entry.method} — ${entry.src}:${String(entry.lineStart)}\n`,
          )
          .join('') +
        `The analyser could not attribute coverage to these. They are not passing; they are unscored.\n`,
    );
    process.exitCode = 2;
  },
};

const config = defineConfig({
  test: {
    projects: ['./vitest.config.ts', './vitest.pglite.config.ts'],
    coverage: {
      // Required. Vitest 5's `coverageConfigDefaults` has no `include` (the old
      // `all` option is gone), and with it unset the v8 provider reports only
      // files some test imported. A source file no test touches is then absent
      // from `coverage-final.json` entirely, and the analyser has no coverage to
      // attribute to its functions.
      //
      // Note the limit of this, because the comment it replaces overstated it:
      // `include` fixes exactly one of the analyser's three skip reasons,
      // `file_unmatched`. It does nothing for the two that actually occur, which
      // are the analyser failing to match a function inside a file that *is* in
      // the report — see {@link skipGuard}.
      include: ['src/**/*.ts'],
      // Matches the analyser's `excludes` above: shared test support is not the
      // subject under measurement.
      exclude: ['**/*.spec.ts', 'src/test/**'],
      reportsDirectory: './coverage',
    },
  },
});

/**
 * Three reporters run after coverage, in this order — Vitest awaits
 * `onFinishedReportCoverage` one reporter at a time, in array order, so the
 * guard is guaranteed to see a fully written report file.
 *
 * 1. `withCrapTypescriptVitest` — the human-facing text report, failures only.
 *    The full table is ~1000 rows per app, which is not readable; the failing
 *    rows are the point.
 * 2. A second analyser pass writing {@link reportPath}. It re-analyses rather
 *    than reusing the first pass's metrics because the adapter exposes no way to
 *    emit two formats from one instance. That costs ~0.5s — measured — on top of
 *    a ~40s run, which is not worth avoiding.
 * 3. {@link skipGuard}, which reads that file.
 *
 * Both analyser passes read the coverage the run just produced
 * (`coverageMode: "existing-only"`), so neither shells out a second `vitest run`
 * the way the `crap-typescript` CLI does.
 */
const withTextReport = withCrapTypescriptVitest(config, {
  ...analysis,
  format: 'text',
  failuresOnly: true,
});

export default {
  ...withTextReport,
  test: {
    ...withTextReport.test,
    reporters: [
      ...(withTextReport.test?.reporters as unknown[]),
      new CrapTypescriptVitestReporter({
        ...analysis,
        format: 'json',
        output: reportPath,
        // Both passes reach the same verdict and both announce it, so without
        // this the run prints `CRAP threshold exceeded` twice and reads like two
        // separate failures. Only that one line is dropped — anything else this
        // pass has to say (a failed write to `output`, a malformed coverage
        // report) is a real error and still surfaces.
        stderr: {
          write: (chunk: string) =>
            chunk.startsWith('CRAP threshold exceeded:') ||
            process.stderr.write(chunk),
        },
      }),
      skipGuard,
    ],
  },
};
