import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// T17 — the CR-RG-05 bundle-shape comparison: a `HEAD` production build, normalized exactly the
// way T1 normalized the `baseline_revision` build, diffed against the committed manifest
// (docs/change-requests/refactor-warehouse-components/spec.md § CR-RG-05, sad.md §8 "Bundle" and
// §10, test-plan.md's two CR-RG-05 rows).
//
// It lives in the repository-root static-gate suite because it needs a real vite build of
// `apps/web` driven from the repository root and reads an artifact keyed by repository-relative
// paths — the same reason test-plan.md § "CI placement" files the other baseline comparisons here.
//
// The baseline is *compared, never regenerated* (test-plan.md § "Test data"). A failure here means
// the bundle moved, not that the artifact is stale.
//
// One honest deviation from CR-RG-05's Method, recorded rather than hidden: the Method predates
// the component splits and asks for an *empty* module-level diff. Five components (CH-W5's four
// `WarehouseList` leaves and its `WarehousePersonRow`) did not exist at
// `baseline_revision`, so a literally empty module-level diff is unreachable and manufacturing one
// would mean filtering real modules out of the comparison. They are therefore admitted by name in
// `moved-modules.mjs` and held to what the criterion actually protects — "no new eager chunk
// appears and every lazy `import('./page')` route boundary is preserved" — by requiring each to
// land in the very chunk its parent component occupies. See the finding recorded on T17.
import { BASELINE_REVISION, CHUNK_MANIFEST_PATH } from './baselines.mjs';
import { buildWebBundle, normalizeOutput } from './chunk-manifest.mjs';
import {
  POST_MOVE_TO_BASELINE_PATH,
  SPLIT_MODULE_PARENTS,
  toBaselinePath,
} from './moved-modules.mjs';

const MODULES_ROOT = 'apps/web/src/modules';

// CR-RG-05 and `sad.md` R5: a baseline build that could not be produced leaves this criterion
// *unverified, not satisfied*. The artifact either exists — and the comparison below runs for
// real — or the gate fails loudly here. It never passes quietly.
assert.ok(
  existsSync(CHUNK_MANIFEST_PATH),
  `${CHUNK_MANIFEST_PATH} is missing — the baseline build was never produced, so CR-RG-05 is ` +
    'unverified, not satisfied',
);

const baseline = JSON.parse(readFileSync(CHUNK_MANIFEST_PATH, 'utf8'));

assert.equal(baseline.baselineRevision, BASELINE_REVISION);

// One build for the whole file: `pnpm --filter @warehouser/web build` is the command CR-RG-05
// names, and running it once per case would multiply the cost of the static-gate suite.
const head = normalizeOutput(await buildWebBundle());

test('the path rewrite is an explicit mapping of moves that actually happened', () => {
  for (const [headPath, baselinePath] of POST_MOVE_TO_BASELINE_PATH) {
    assert.ok(existsSync(headPath), `${headPath} does not exist at HEAD`);
    assert.ok(
      !existsSync(baselinePath),
      `${baselinePath} still exists at HEAD, so it was not moved`,
    );
  }

  for (const [split, parent] of SPLIT_MODULE_PARENTS) {
    assert.ok(existsSync(split), `${split} does not exist at HEAD`);
    assert.ok(existsSync(parent), `${parent} does not exist at HEAD`);
  }
});

test('the chunk inventory is identical to baseline_revision', () => {
  // The load-bearing half of CR-RG-05. Every emitted chunk, with its `isEntry` /
  // `isDynamicEntry` flags: a new eager chunk, a lost lazy `import('./page')` boundary, or a
  // route boundary turned eager all show up here and nowhere else.
  assert.deepEqual(head.chunks, baseline.chunks);
});

test('every module resolves to the chunk it occupied at baseline_revision', () => {
  const unexpected = [];
  const covered = new Set();

  for (const [headPath, chunk] of Object.entries(head.modules)) {
    if (SPLIT_MODULE_PARENTS.has(headPath)) {
      continue;
    }

    const baselinePath = toBaselinePath(headPath);
    covered.add(baselinePath);

    if (baseline.modules[baselinePath] !== chunk) {
      unexpected.push(
        `${headPath} is in ${chunk}, baseline had ${baselinePath} in ` +
          `${baseline.modules[baselinePath] ?? '(no chunk)'}`,
      );
    }
  }

  for (const baselinePath of Object.keys(baseline.modules)) {
    if (!covered.has(baselinePath)) {
      unexpected.push(`${baselinePath} is in no chunk at HEAD`);
    }
  }

  assert.deepEqual(unexpected, []);
});

test('each split component lands in the chunk of the component it was carved out of', () => {
  // The splits are the only admitted module-level difference, and this is the price of admitting
  // them: a leaf that landed anywhere but its parent's chunk moved code across a chunk seam,
  // which is a bundle-shape change and a CR-RG-05 failure.
  for (const [split, parent] of SPLIT_MODULE_PARENTS) {
    assert.equal(
      head.modules[split],
      head.modules[parent],
      `${split} is in ${head.modules[split] ?? '(no chunk)'}, its parent ${parent} is in ` +
        `${head.modules[parent] ?? '(no chunk)'}`,
    );
  }
});

test('no module barrel is introduced', () => {
  // `modules-level-refactor/adr/0001` is why: a barrel would pull each module's `page` into the
  // router chunk and defeat the lazy boundary the chunk inventory above protects. The enumerated
  // surface declaration stays the mechanism.
  const barrels = [];

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.name === 'index.ts' || entry.name === 'index.tsx') {
        barrels.push(path);
      }
    }
  };

  walk(MODULES_ROOT);

  assert.deepEqual(barrels, []);
});
