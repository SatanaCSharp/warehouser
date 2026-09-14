import { readFile } from 'node:fs/promises';

import {
  type CrapTypescriptVitestOptions,
  CrapTypescriptVitestReporter,
  withCrapTypescriptVitest,
} from '@barney-media/crap-typescript-vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

import base from './vite.config';

/**
 * The CRAP tier: `CC^2 * (1 - coverage)^3 + CC` over the app's own test run.
 *
 * It is a config of its own rather than an environment branch inside
 * `vite.config.ts` because that file is also what `vite dev` and `vite build`
 * read, and the two things this tier changes — a coverage provider and three
 * reporters — have no business being in either.
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
 * In `.tsx` that cap lands on JSX conditionals rather than on decision logic, which was the one
 * place this threshold was argued over: `??` defaults, `?.` reads and value ternaries in props are
 * what a component's CC is usually made of, and splitting a component to shed them can read worse
 * than the component did. The answer taken here was to lift those readings into named module-level
 * helpers above the component rather than to split the component — the operator leaves the body,
 * the markup stays whole, and the rule each helper encodes gets a name and a comment.
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
    // The browser entrypoint, and the one file here that is composition and
    // nothing else: it awaits the i18next resources, finds the root element,
    // and mounts the provider chain. Every part of that chain is covered where
    // it lives — `LocaleProvider` and `App` both have their own specs — so what
    // is left is a `createRoot` call and a `document.getElementById` guard that
    // cannot run without a real document to mount into. Covering it would mean
    // doubling `react-dom/client` and asserting the double was called. Excluded
    // rather than left scoring at 0% so that the count of untested functions
    // stays a count of real gaps. `apps/server` excludes its `main.ts` for the
    // same reason.
    'src/main.tsx',
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
 * when it matches more than one entry (`fnmap_conflict`) or none
 * (`statement_unattributed`) it scores the function `N/A` and moves on. That is
 * silent by construction: a `skipped` row is not a failure, so a gate reading
 * only the exit code reports success over code it never measured. On the last
 * run that was 63 of 1019 functions here, including the two most complex in the
 * app — a CC 12 and a CC 11, both of which fail at any threshold this
 * repository would set.
 *
 * `coverage.include` does not help: it fixes only the third skip reason,
 * `file_unmatched`, and every skip here is one of the other two. The istanbul
 * provider recovers some (71 skips became 63) and is worth having, but it does
 * not close the hole either. So the hole is declared instead: this reporter
 * fails the run for any skipped function complex enough to be hiding a real
 * failure, and names it. The fix for one is to restructure it until the
 * analyser can match it — usually by lifting the logic out of the TSX that made
 * it ambiguous, which is the same direction the threshold is pushing anyway.
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

const config = mergeConfig(
  base,
  defineConfig({
    test: {
      coverage: {
        // Not the default `v8`, and the difference matters here specifically.
        //
        // v8 reports the byte ranges the engine actually executed and maps them
        // back through source maps. For plain `.ts` that round-trips well
        // enough; for `.tsx` it does not, and the resulting `fnMap` carries
        // imprecise spans the analyser cannot match a function to. Istanbul
        // instruments the source before it runs, so the names and spans are the
        // real ones. Measured on this suite: 71 skipped functions under v8, 63
        // under istanbul, and istanbul was not slower (51.0s vs 53.7s). It is a
        // clear improvement and not a cure — see {@link skipGuard}.
        provider: 'istanbul',
        // Required. Vitest 5's `coverageConfigDefaults` has no `include` (the
        // old `all` option is gone), and with it unset the provider reports
        // only files some test imported. A source file no test touches is then
        // absent from `coverage-final.json` entirely, and the analyser has no
        // coverage to attribute to its functions.
        //
        // Note the limit of this, because the comment it replaces overstated
        // it: `include` fixes exactly one of the analyser's three skip reasons,
        // `file_unmatched`. It does nothing for `fnmap_conflict` or
        // `statement_unattributed`, which are the analyser failing to match a
        // function inside a file that *is* in the report.
        include: ['src/**/*.{ts,tsx}'],
        // The specs themselves, and the harness they share, are not the
        // subject under measurement.
        exclude: ['**/*.spec.{ts,tsx}', 'src/test/**'],
        reportsDirectory: './coverage',
      },
    },
  }),
);

/**
 * Three reporters run after coverage, in this order — Vitest awaits
 * `onFinishedReportCoverage` one reporter at a time, in array order, so the
 * guard is guaranteed to see a fully written report file.
 *
 * 1. `withCrapTypescriptVitest` — the human-facing text report, failures only.
 *    The full table is ~1000 rows across five packages at the repository root,
 *    which is not readable; the failing rows are the point.
 * 2. A second analyser pass writing {@link reportPath}. It re-analyses rather
 *    than reusing the first pass's metrics because the adapter exposes no way
 *    to emit two formats from one instance. That costs ~0.5s — measured — on
 *    top of a ~50s run, which is not worth avoiding.
 * 3. {@link skipGuard}, which reads that file.
 *
 * Both analyser passes read the coverage the run just produced
 * (`coverageMode: "existing-only"`), so neither shells out a second `vitest
 * run` the way the `crap-typescript` CLI does.
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
