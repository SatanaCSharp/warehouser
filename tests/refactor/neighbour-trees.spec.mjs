import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// T16 — the CR-RG-07 fence: the five neighbour trees, compared to `baseline_revision` and
// classified hunk by hunk (docs/change-requests/refactor-warehouse-components/spec.md § CR-RG-07,
// test-plan.md's four CR-RG-07 rows).
//
// It lives in the repository-root static-gate suite rather than under `apps/web` for one hard
// reason: two of the five fenced trees — `apps/server` and `packages/contracts` — are outside the
// `apps/web` vitest root, and a fence that cannot see them is not the fence CR-RG-07 describes.
// test-plan.md § "CI placement" files the baseline comparisons here for the same reason.
//
// `sad.md` R5 is why this carries more weight than a structural gate usually would: CR-RG-06 needs
// a container runtime to run the server integration suite, and where none exists it is *blocked,
// not satisfied* — leaving "no file under `apps/server` was modified" as the only evidence bounding
// that risk. That evidence is this spec.
import {
  BASELINE_REVISION,
  FENCED_TREES,
  NEIGHBOUR_TREES_PATH,
} from './baselines.mjs';
import {
  PERMITTED_COMMENT_HUNK,
  PERMITTED_RENAME,
  UNMOVED_ACCESS_SUBTREE,
  compareFencedTrees,
  formatHunk,
} from './neighbour-trees.mjs';

const digest = JSON.parse(readFileSync(NEIGHBOUR_TREES_PATH, 'utf8'));

// Compared, never regenerated: a baseline captured against anything but `BASELINE_REVISION` would
// make every assertion below pass against the wrong tree.
assert.equal(digest.baselineRevision, BASELINE_REVISION);

const comparisons = new Map(
  compareFencedTrees(digest).map((comparison) => [comparison.tree, comparison]),
);

const comparisonOf = (tree) => {
  const comparison = comparisons.get(tree);
  assert.ok(comparison !== undefined, `${tree} is not a fenced tree`);
  return comparison;
};

const assertNoPathChanges = (comparison) => {
  assert.deepEqual(
    comparison.added,
    [],
    `${comparison.tree} added ${comparison.added.join(', ')}`,
  );
  assert.deepEqual(
    comparison.removed,
    [],
    `${comparison.tree} removed ${comparison.removed.join(', ')}`,
  );
  assert.deepEqual(
    comparison.renames,
    [],
    `${comparison.tree} renamed ${comparison.renames
      .map(({ from, to }) => `${from} -> ${to}`)
      .join(', ')}`,
  );
};

const assertByteIdentical = (tree) => {
  const comparison = comparisonOf(tree);

  assertNoPathChanges(comparison);
  assert.deepEqual(
    comparison.hunks.map(formatHunk),
    [],
    `${tree} must be byte-identical to ${BASELINE_REVISION}`,
  );
};

test('the digest covers exactly the five trees CR-RG-07 fences', () => {
  assert.deepEqual([...comparisons.keys()].sort(), [...FENCED_TREES].sort());
});

// test-plan.md row 1. `spec.md` §3: "No server change" — `apps/server`, `packages/contracts`, route
// paths, `@Controller` prefixes and permission identifiers are untouched.
test('the server and contracts trees are byte-identical to baseline', () => {
  assertByteIdentical('apps/server');
  assertByteIdentical('packages/contracts');
});

// test-plan.md row 2. `modules/home` imports no `shared/api` module, so CH-W6's path churn cannot
// legitimately reach it and its permitted diff is *none*.
test('the home module is byte-identical to baseline', () => {
  assertByteIdentical('apps/web/src/modules/home');
});

// test-plan.md row 3. CH-W6 is path-only churn and reaches `modules/access` legitimately in its 33
// importing files; nothing executable there may change.
test('the access module differs only in shared/api import specifiers', () => {
  const comparison = comparisonOf('apps/web/src/modules/access');

  assertNoPathChanges(comparison);

  const offending = comparison.hunks.filter(
    (hunk) => hunk.kind !== 'import-specifier',
  );
  const permitted = offending.filter(
    (hunk) =>
      hunk.kind === 'comment' &&
      hunk.path === PERMITTED_COMMENT_HUNK.file &&
      hunk.startLine === PERMITTED_COMMENT_HUNK.startLine,
  );

  // The carve-out is one hunk at one location, not a category. `sad.md` §11 O2 grants it only
  // because `spec.md` CR-RG-07 was amended for exactly this line, so a *second* comment hunk —
  // here or in any other access file — fails, and it fails naming itself.
  assert.deepEqual(
    offending.filter((hunk) => !permitted.includes(hunk)).map(formatHunk),
    [],
    'modules/access admits import specifiers plus the one O2 comment hunk at ' +
      `${PERMITTED_COMMENT_HUNK.file}:${PERMITTED_COMMENT_HUNK.startLine}`,
  );
  assert.equal(
    permitted.length,
    1,
    `expected exactly one O2 comment hunk, found ${permitted.length}`,
  );

  const changedFiles = new Set(comparison.hunks.map((hunk) => hunk.path));
  assert.equal(
    changedFiles.size,
    33,
    `CR-RG-07 names 33 importing files, found ${changedFiles.size}`,
  );
});

// `spec.md` §3, unconditional and not contingent on CH-D2 generalizing: the access tabs keep their
// current placement. Asserted separately from the tree-wide check so the failure names the
// non-goal that was breached, not just "a file changed".
test('the access workspace-administration subtree is unmoved and otherwise unedited', () => {
  const comparison = comparisonOf('apps/web/src/modules/access');
  const inSubtree = (path) => path.startsWith(UNMOVED_ACCESS_SUBTREE);

  assert.deepEqual(comparison.added.filter(inSubtree), []);
  assert.deepEqual(comparison.removed.filter(inSubtree), []);
  assert.deepEqual(
    comparison.renames.filter(
      ({ from, to }) => inSubtree(from) || inSubtree(to),
    ),
    [],
  );
  assert.deepEqual(
    comparison.hunks
      .filter(
        (hunk) => inSubtree(hunk.path) && hunk.kind !== 'import-specifier',
      )
      .map(formatHunk),
    [],
    `${UNMOVED_ACCESS_SUBTREE} may change only in import specifiers`,
  );
});

// test-plan.md row 4. `spec.md` §6.1: `modules/auth`'s only edit besides CH-W6's specifiers is a
// spec filename, so the rename is detected as a rename — one path change at 100% similarity — and
// never as a deletion plus an addition.
test('the auth module differs only in import specifiers and the CR-AC-06 rename', () => {
  const comparison = comparisonOf('apps/web/src/modules/auth');

  assert.deepEqual(comparison.added, []);
  assert.deepEqual(comparison.removed, []);
  assert.deepEqual(comparison.renames, [PERMITTED_RENAME]);
  assert.deepEqual(
    comparison.hunks
      .filter((hunk) => hunk.kind !== 'import-specifier')
      .map(formatHunk),
    [],
    'modules/auth admits import specifiers plus the CR-AC-06 rename only',
  );

  const changedFiles = new Set(comparison.hunks.map((hunk) => hunk.path));
  assert.equal(
    changedFiles.size,
    2,
    `CR-RG-07 names 2 importing files, found ${changedFiles.size}`,
  );
});
