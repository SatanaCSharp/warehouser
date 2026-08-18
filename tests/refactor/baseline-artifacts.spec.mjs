import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

// T1 — the integrity gate over the three `baseline_revision` comparison artifacts of the
// `refactor-warehouse-components` change request (docs/change-requests/refactor-warehouse-components/
// test-plan.md § "Test data": the baselines are *compared, never regenerated to make a gate pass*).
//
// Every later gate — the case-count identity of T13, the neighbour-tree fence of T16, the chunk
// manifest of T17 — is only as good as the artifact it compares against. A baseline that was
// hand-transcribed, truncated, or captured against a contaminated tree invalidates all three
// silently, because a comparison against a wrong baseline still passes. This spec is what makes
// that failure loud: it pins the shape and the counts the capture must produce, independently of
// the capture script that produced them.
import {
  BASELINE_REVISION,
  CHUNK_MANIFEST_PATH,
  NEIGHBOUR_TREES_PATH,
  WAREHOUSES_TAB_CASES_PATH,
  FENCED_TREES,
} from './baselines.mjs';

// sad.md §5.4's first column: the ten `describe` blocks of the pre-split WarehousesTab.spec.tsx and
// the number of cases each declares. The distribution is asserted, not just the total — a case
// moved between two groups during capture would leave the total intact.
const EXPECTED_GROUPS = [
  ['the Warehouse list (AC-33, AC-12a)', 6],
  ['the detail pane and the level boundary (AC-33)', 3],
  ['adding a Warehouse (AC-06, AC-08)', 4],
  ['renaming a Warehouse (AC-09)', 4],
  ['archiving and restoring (AC-11, AC-11a, AC-12a)', 5],
  ['giving warehouse access (AC-23, AC-23a)', 3],
  ['withdrawing warehouse access (AC-25b, AC-25c)', 3],
  ['responsive behaviour (desktop 1440 / mobile 390)', 2],
  ['accessibility', 3],
  ['the Enter action (CR-AC-04, CR-AC-13, CR-AC-14, CR-RG-02)', 6],
];

const EXPECTED_CASE_COUNT = 39;

const readArtifact = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('the Warehouses-tab case inventory totals 39 across sad.md §5.4s ten groups', () => {
  const inventory = readArtifact(WAREHOUSES_TAB_CASES_PATH);

  assert.equal(inventory.baselineRevision, BASELINE_REVISION);
  assert.equal(inventory.caseCount, EXPECTED_CASE_COUNT);
  assert.deepEqual(
    inventory.groups.map((group) => [group.describe, group.cases.length]),
    EXPECTED_GROUPS,
  );
});

// The union is what T13 compares against, so it has to be a faithful flattening of the groups. A
// duplicated title across two groups would make the union shorter than the count — which is exactly
// the hole `tests/refactor/split-cases.spec.mjs` documents, and why T13 asserts both.
test('the inventorys union is the sorted flattening of its ten groups', () => {
  const inventory = readArtifact(WAREHOUSES_TAB_CASES_PATH);
  const flattened = inventory.groups.flatMap((group) => group.cases);

  assert.equal(flattened.length, EXPECTED_CASE_COUNT);
  assert.deepEqual(inventory.cases, [...new Set(flattened)].sort());
});

test('the neighbour-tree digest covers all five trees CR-RG-07 fences', () => {
  const digest = readArtifact(NEIGHBOUR_TREES_PATH);

  assert.equal(digest.baselineRevision, BASELINE_REVISION);
  assert.deepEqual(Object.keys(digest.trees).sort(), [...FENCED_TREES].sort());

  for (const [tree, files] of Object.entries(digest.trees)) {
    assert.ok(
      Object.keys(files).length > 0,
      `expected ${tree} to digest at least one file`,
    );
  }
});

// CR-RG-05 states the failure mode outright: a baseline build that cannot be produced leaves the
// criterion **unverified, not satisfied**. So the manifest's absence is not a failure of this gate —
// but a manifest that is present and malformed is, because T17 would then compare against noise.
test('the chunk manifest is either absent or a sorted module to chunk map', () => {
  if (!existsSync(CHUNK_MANIFEST_PATH)) {
    return;
  }

  const manifest = readArtifact(CHUNK_MANIFEST_PATH);

  assert.equal(manifest.baselineRevision, BASELINE_REVISION);
  assert.ok(Object.keys(manifest.modules).length > 0);
  assert.deepEqual(
    Object.keys(manifest.modules),
    Object.keys(manifest.modules).toSorted(),
  );
  assert.deepEqual(
    Object.keys(manifest.chunks),
    Object.keys(manifest.chunks).toSorted(),
  );

  // Hash stripping is what makes two builds comparable at all: vite content-hashes every chunk
  // filename, so an unstripped name differs between builds that are otherwise identical. A key is
  // `<stripped filename>` or `<stripped filename> [<module it fronts>]`, so the filename is
  // everything before the disambiguating suffix.
  for (const chunk of Object.keys(manifest.chunks)) {
    assert.doesNotMatch(
      chunk.replace(/ \[.+\]$/u, ''),
      /-[A-Za-z0-9_-]{8}\.[a-z]+$/u,
      `expected ${chunk} to have its content hash stripped`,
    );
  }

  // The lazy `import('./page')` route boundaries are the structure CR-RG-05 protects. If the
  // manifest recorded none, the comparison would pass over a bundle that had eagerly inlined every
  // route — the exact regression the criterion names.
  const dynamicEntries = Object.entries(manifest.chunks).filter(
    ([, chunk]) => chunk.isDynamicEntry,
  );
  assert.ok(
    dynamicEntries.length > 1,
    'expected the baseline to record the lazy route boundaries, found ' +
      `${dynamicEntries.length}`,
  );

  // Every module must name a chunk that the inventory declares, or T17's diff would compare
  // against dangling references.
  for (const [module, chunk] of Object.entries(manifest.modules)) {
    assert.ok(
      chunk in manifest.chunks,
      `module ${module} names undeclared chunk ${chunk}`,
    );
  }
});
