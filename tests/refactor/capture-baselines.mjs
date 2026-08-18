import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

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
  stripContentHash,
} from './baselines.mjs';
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

/**
 * Only modules the request can actually move are recorded.
 *
 * A dependency's position inside the vendor chunk is not something CR-RG-05 has an opinion about,
 * and recording all of it would make the artifact churn on every lockfile bump. The chunk
 * inventory below is what carries the "no new eager chunk" half of the criterion, and it is
 * complete.
 */
const isTrackedModule = (path) =>
  (path.startsWith('apps/web/src/') || path.startsWith('packages/')) &&
  !path.includes('node_modules');

const toRepoRelative = (modulePath) =>
  modulePath.replace(`${process.cwd()}/`, '').replace(/^\0/u, '');

/**
 * A chunk identity that survives hash stripping.
 *
 * Stripping the content hash alone is not enough to name a chunk: every lazy route emits a chunk
 * called `page-<hash>.js`, so four distinct route boundaries collapse onto one key and the
 * manifest silently loses exactly the structure CR-RG-05 exists to protect ("every lazy
 * `import('./page')` route boundary is preserved"). A chunk that fronts a module is therefore
 * keyed by that module, which is stable across builds and is the thing the criterion names.
 */
const chunkKey = (item) => {
  const stripped = stripContentHash(item.fileName);

  return item.facadeModuleId
    ? `${stripped} [${toRepoRelative(item.facadeModuleId)}]`
    : stripped;
};

const captureChunkManifest = async () => {
  assertTreeMatchesBaseline();

  const require = createRequire(
    pathToFileURL(`${process.cwd()}/apps/web/package.json`),
  );
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);

  const result = await build({
    root: 'apps/web',
    configFile: 'apps/web/vite.config.ts',
    logLevel: 'silent',
  });
  const [{ output }] = Array.isArray(result) ? result : [result];

  const modules = [];
  const chunks = [];
  const seen = new Set();

  for (const item of output) {
    const key = chunkKey(item);

    // A collision would make the manifest quietly lossy in the same way the un-disambiguated
    // filename was, so it refuses instead.
    if (seen.has(key)) {
      throw new Error(
        `two output files normalize to the same chunk key '${key}' — ` +
          'the manifest would lose one of them',
      );
    }
    seen.add(key);

    if (item.type !== 'chunk') {
      chunks.push([key, { type: 'asset' }]);
      continue;
    }

    chunks.push([
      key,
      {
        type: 'chunk',
        isEntry: item.isEntry,
        isDynamicEntry: item.isDynamicEntry,
      },
    ]);

    for (const modulePath of Object.keys(item.modules)) {
      const relative = toRepoRelative(modulePath);
      if (isTrackedModule(relative)) {
        modules.push([relative, key]);
      }
    }
  }

  writeArtifact(CHUNK_MANIFEST_PATH, {
    baselineRevision: BASELINE_REVISION,
    modules: sortObject(modules),
    chunks: sortObject(chunks),
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
