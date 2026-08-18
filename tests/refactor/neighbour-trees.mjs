// T16 — the CR-RG-07 classifier: what a hunk in a fenced neighbour tree *is*.
//
// `spec.md` CR-RG-07 is the fence around the whole change request — the evidence that a
// behavior-preserving refactor did not leak into its neighbours — and `sad.md` R5 makes it the
// fallback evidence CR-RG-06 leans on when no container runtime is available. So the comparison
// cannot stop at "some files differ": every hunk has to be named and admitted, or named and
// refused.
//
// The baseline is `apps/web/src/test/baselines/neighbour-trees.json`, a per-file git blob digest of
// the five trees captured by T1 at `BASELINE_REVISION`. It is *compared, never regenerated*
// (test-plan.md § "Test data"). A failure here means the tree is wrong, not the baseline.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { FENCED_TREES } from './baselines.mjs';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// One `hash-object` process for a whole tree rather than one per file: `apps/server` alone runs to
// four figures, and a spawn per file would make the fence too slow to run after every step, which
// is where test-plan.md § "CI placement" puts it.
const hashWorkingFiles = (paths) => {
  if (paths.length === 0) {
    return [];
  }

  return execFileSync('git', ['hash-object', '--stdin-paths'], {
    encoding: 'utf8',
    input: `${paths.join('\n')}\n`,
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter((line) => line !== '');
};

/**
 * The one comment hunk `sad.md` §11 O2 carves out of `modules/access`.
 *
 * O2 is explicit that this exists *only* because `spec.md` CR-RG-07 was amended for exactly this
 * line: `workspace-role-name-validation.spec.ts` names the moved
 * `warehouse-name-validation.spec.ts` as where its Warehouse half lives, and CR-AC-02's "no stale
 * reference survives" requires the re-point. It is therefore encoded as a **location** — one file,
 * one hunk start — and never as a category. Comments are not free in `modules/access`.
 */
export const PERMITTED_COMMENT_HUNK = {
  file: 'apps/web/src/modules/access/hooks/workspace-role-name-validation.spec.ts',
  startLine: 17,
};

/** The CR-AC-06 rename, the only path change CR-RG-07 admits anywhere. */
export const PERMITTED_RENAME = {
  from: 'apps/web/src/modules/auth/store/authSlice.spec.ts',
  to: 'apps/web/src/modules/auth/store/auth.slice.spec.ts',
};

/** `spec.md` §3, unconditional: this subtree is unmoved and otherwise unedited. */
export const UNMOVED_ACCESS_SUBTREE =
  'apps/web/src/modules/access/components/workspace-administration/';

const IMPORT_LINE = /^import (?:type )?(.*) from '([^']+)';$/u;
const COMMENT_LINE = /^\s*\/\//u;

/**
 * True when two lines are the same import statement pointing at the same module through its new
 * CH-W6 domain-grouped path.
 *
 * The test is deliberately narrow: the imported bindings must be byte-identical, the old specifier
 * must be a `shared/api/<module>` root path, and the new one must be that same module under one
 * domain directory. An import whose *bindings* changed, or that now names a different module, is
 * not an import-specifier hunk — it is a code change wearing one.
 */
const isSharedApiSpecifierRewrite = (before, after) => {
  const from = IMPORT_LINE.exec(before);
  const to = IMPORT_LINE.exec(after);
  if (from === null || to === null || from[1] !== to[1]) {
    return false;
  }

  const [, , oldPath] = from;
  const [, , newPath] = to;
  const moved = /^shared\/api\/[a-z-]+\/([a-z-]+)$/u.exec(newPath);

  return moved !== null && oldPath === `shared/api/${moved[1]}`;
};

/** Groups the differing line indices of two equal-length files into contiguous hunks. */
const collectHunks = (baselineLines, currentLines) => {
  const hunks = [];
  let open = null;

  baselineLines.forEach((line, index) => {
    if (line === currentLines[index]) {
      open = null;
      return;
    }

    if (open === null) {
      open = { startLine: index + 1, before: [], after: [] };
      hunks.push(open);
    }

    open.before.push(line);
    open.after.push(currentLines[index]);
  });

  return hunks;
};

const describeHunk = (hunk) =>
  hunk.before
    .map((line, index) => `-${line}\n+${hunk.after[index]}`)
    .join('\n');

/**
 * Classifies one changed file into named hunks.
 *
 * A change in line count is refused outright as a single `structural` hunk. Every diff CR-RG-07
 * admits is an in-place line replacement — an import specifier or the O2 comment re-point — so a
 * file that grew or shrank has had something added to it or taken out of it, which no row of the
 * permitted-diff table covers.
 */
const classifyFile = (path, baselineBlob) => {
  const baselineLines = git('cat-file', 'blob', baselineBlob).split('\n');
  const currentLines = readFileSync(path, 'utf8').split('\n');

  if (baselineLines.length !== currentLines.length) {
    return [
      {
        path,
        kind: 'structural',
        startLine: 1,
        detail:
          `line count changed from ${baselineLines.length} to ` +
          `${currentLines.length}`,
      },
    ];
  }

  return collectHunks(baselineLines, currentLines).map((hunk) => {
    const everyLine = (predicate) =>
      hunk.before.every((line, index) => predicate(line, hunk.after[index]));

    let kind = 'other';
    if (everyLine(isSharedApiSpecifierRewrite)) {
      kind = 'import-specifier';
    } else if (
      everyLine(
        (before, after) =>
          COMMENT_LINE.test(before) && COMMENT_LINE.test(after),
      )
    ) {
      kind = 'comment';
    }

    return {
      path,
      kind,
      startLine: hunk.startLine,
      detail: describeHunk(hunk),
    };
  });
};

/**
 * Compares one fenced tree against its baseline digest and classifies everything that differs.
 *
 * The working tree is enumerated rather than `HEAD`, so an uncommitted edit inside a fenced tree is
 * a failure too — a fence that only sees committed state is not a fence during implementation.
 * Tracked and untracked-but-not-ignored files are both listed: a new file dropped into
 * `apps/server` is exactly the leak CR-RG-07 exists to catch.
 */
export const compareTree = (tree, baselineFiles) => {
  const listed = git(
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    tree,
  )
    .split('\n')
    .filter((path) => path !== '');

  const hashes = hashWorkingFiles(listed);
  const current = new Map(listed.map((path, index) => [path, hashes[index]]));

  const added = listed.filter((path) => !(path in baselineFiles));
  const removed = Object.keys(baselineFiles).filter(
    (path) => !current.has(path),
  );

  // Rename detection by identical blob: `auth.slice.spec.ts` is one rename, and reporting it as a
  // deletion plus an addition would both misname it and let a genuine delete/add pair hide behind
  // the same shape.
  const renames = [];
  for (const from of [...removed]) {
    const to = added.find((path) => current.get(path) === baselineFiles[from]);
    if (to !== undefined) {
      renames.push({ from, to });
      removed.splice(removed.indexOf(from), 1);
      added.splice(added.indexOf(to), 1);
    }
  }

  const hunks = listed
    .filter(
      (path) =>
        path in baselineFiles && current.get(path) !== baselineFiles[path],
    )
    .flatMap((path) => classifyFile(path, baselineFiles[path]));

  return { tree, added, removed, renames, hunks };
};

/** Renders one finding the way a failure message has to name it: file, line, and the hunk itself. */
export const formatHunk = (hunk) =>
  `${hunk.path}:${hunk.startLine} [${hunk.kind}]\n${hunk.detail}`;

export const compareFencedTrees = (digest) =>
  FENCED_TREES.map((tree) => compareTree(tree, digest.trees[tree]));
