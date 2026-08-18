import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// T1 — the capture script for the three `baseline_revision` comparison artifacts of the
// `refactor-warehouse-components` change request.
//
//   node tests/refactor/capture-baselines.mjs
//
// Every artifact is produced from `BASELINE_REVISION` and nothing else, so re-running this after
// the tree has moved reproduces the same bytes rather than snapshotting the refactor in progress.
// test-plan.md § "Test data" is explicit that the baselines are *compared, never regenerated to
// make a gate pass* — this script exists so that regenerating one is a deliberate, reviewable act
// rather than a hand transcription nobody can reproduce.
//
// The two source-derived artifacts read the baseline out of git directly (`git show`, `git
// ls-tree`), so they do not care what the working tree currently holds. The chunk manifest cannot:
// it needs a real build. Rather than check the baseline out into a throwaway worktree and install
// into it, the script *asserts* that the working tree's code is already identical to the baseline
// and refuses to capture a manifest otherwise — which is the same guarantee, and is why
// test-plan.md's "the baseline was captured against a contaminated tree" edge case cannot happen
// silently here.
import {
  BASELINE_REVISION,
  CHUNK_MANIFEST_PATH,
  FENCED_TREES,
  NEIGHBOUR_TREES_PATH,
  WAREHOUSES_TAB_CASES_PATH,
  WAREHOUSES_TAB_SPEC_AT_BASELINE,
} from './baselines.mjs';
import { buildWebBundle, normalizeOutput } from './chunk-manifest.mjs';
import {
  assertGroupsAccountForEveryCase,
  extractGroupedCases,
} from './grouped-cases.mjs';

/** The trees whose content must match the baseline before a build is a baseline build. */
const BUILD_INPUT_TREES = ['apps/web', 'packages'];

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const writeArtifact = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`wrote ${path}`);
};

const sortObject = (entries) =>
  Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : 1)));

// --- the Warehouses-tab case inventory ------------------------------------------------------

const captureWarehousesTabCases = () => {
  const source = git(
    'show',
    `${BASELINE_REVISION}:${WAREHOUSES_TAB_SPEC_AT_BASELINE}`,
  );
  const groups = extractGroupedCases(source);
  assertGroupsAccountForEveryCase(source, groups);

  const flattened = groups.flatMap((group) => group.cases);

  writeArtifact(WAREHOUSES_TAB_CASES_PATH, {
    baselineRevision: BASELINE_REVISION,
    source: WAREHOUSES_TAB_SPEC_AT_BASELINE,
    caseCount: flattened.length,
    groups,
    cases: [...new Set(flattened)].sort(),
  });
};

// --- the neighbour-tree digest ---------------------------------------------------------------

// `git ls-tree` yields git's own content hash per file, which is exactly the per-file digest
// CR-RG-07 needs and costs nothing to reproduce: it is read out of the object database rather than
// computed over a checkout, so it cannot pick up a stray local edit.
const captureNeighbourTrees = () => {
  const trees = {};

  for (const tree of FENCED_TREES) {
    const listing = git('ls-tree', '-r', BASELINE_REVISION, '--', tree).trim();
    if (listing === '') {
      throw new Error(`no files found under ${tree} at ${BASELINE_REVISION}`);
    }

    trees[tree] = sortObject(
      listing.split('\n').map((line) => {
        const [meta, path] = line.split('\t');
        const [, , blob] = meta.split(' ');
        return [path, blob];
      }),
    );
  }

  writeArtifact(NEIGHBOUR_TREES_PATH, {
    baselineRevision: BASELINE_REVISION,
    trees: sortObject(Object.entries(trees)),
  });
};

// --- the normalized module→chunk manifest ------------------------------------------------------

const assertTreeMatchesBaseline = () => {
  const drift = git(
    'diff',
    '--name-only',
    BASELINE_REVISION,
    '--',
    ...BUILD_INPUT_TREES,
  )
    .split('\n')
    .filter((path) => path !== '' && !path.endsWith('tsconfig.tsbuildinfo'));

  if (drift.length > 0) {
    throw new Error(
      `the working tree differs from ${BASELINE_REVISION} in ${drift.length} build input(s) — ` +
        `a build here would not be a baseline build:\n  ${drift.join('\n  ')}`,
    );
  }
};

const captureChunkManifest = async () => {
  assertTreeMatchesBaseline();

  const { modules, chunks } = normalizeOutput(await buildWebBundle());

  writeArtifact(CHUNK_MANIFEST_PATH, {
    baselineRevision: BASELINE_REVISION,
    modules,
    chunks,
  });
};

// ----------------------------------------------------------------------------------------------

captureWarehousesTabCases();
captureNeighbourTrees();

// CR-RG-05 states the failure mode outright: a baseline build that cannot be produced leaves the
// criterion **unverified, not satisfied**. So a build failure is reported and tolerated here — the
// other two artifacts must still land — rather than substituting a HEAD build, which would make a
// later comparison vacuously pass.
try {
  await captureChunkManifest();
} catch (error) {
  console.error(
    `\nCR-RG-05 baseline build NOT produced — the criterion is unverified, not satisfied:\n  ${error.message}`,
  );
  process.exitCode = 1;
}
