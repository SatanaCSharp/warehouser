import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { makeStore } from 'store';

// CR-AC-06 (refactor-warehouse-components): the state-placement guard. The
// request moves twenty-two files between modules, and its §3 non-goal is that
// none of that movement introduces browser state. So this pins three facts —
// that `store/` scaffolding was not created "for symmetry" in the modules the
// move touched, that the registered slice inventory is the one
// `baseline_revision` (42f1205) registered, and that the auth slice spec now
// follows the module it tests without its cases changing.
//
// It scans the tree and the composed store rather than rendering, so it belongs
// beside `module-boundaries.spec.ts` and `warehouse-administration-split.spec.ts`
// at the `modules/` root rather than inside any one module:
// `frontend-architecture.md` § Testing colocates a slice test *with its owner*,
// and this guard's subject spans `auth`, `warehouse`, `workspace` and the root
// store, so no module owns it. `sad.md` §5.1 also fixes the workspace file
// manifest, which a colocated spec would enlarge.

const MODULES_DIRECTORY = posix.dirname(fileURLToPath(import.meta.url));

const AUTH_STORE_DIRECTORY = posix.join(MODULES_DIRECTORY, 'auth/store');

/**
 * `frontend-architecture.md` § "Redux Toolkit infrastructure": a feature slice
 * lives in `modules/<module>/store/`, and a slice is added only for state used
 * across modules or needed globally across routes. `auth` is the one module
 * that qualifies today, so it is the one module carrying the directory.
 */
const MODULES_WITH_A_STORE_DIRECTORY = ['auth'] as const;

/**
 * The keys `combineReducers` in `store/index.ts` registered at
 * `baseline_revision`: the one feature slice and the single shared RTK Query
 * API slice. A new state slice adds a key here.
 */
const BASELINE_REGISTERED_REDUCERS = ['auth', 'api'] as const;

/** The case names of the auth slice spec at `baseline_revision`. */
const BASELINE_AUTH_SLICE_CASES = [
  'starts unknown and contains no reusable credential field',
  'transitions between authenticated and anonymous through safe user data',
] as const;

const CASE_NAME = /^\s*it\((?<quote>['"`])(?<name>.*?)\k<quote>/gmu;

const modulesWithAStoreDirectory = (): string[] =>
  readdirSync(MODULES_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((module) =>
      existsSync(posix.join(MODULES_DIRECTORY, module, 'store')),
    )
    .sort();

const caseNamesOf = (file: string): string[] => {
  const path = posix.join(AUTH_STORE_DIRECTORY, file);

  if (!existsSync(path)) {
    return [];
  }

  return [...readFileSync(path, 'utf8').matchAll(CASE_NAME)].map(
    (match) => match.groups?.name ?? '',
  );
};

describe('the state placement of the refactored modules (CR-AC-06)', () => {
  it('keeps a store directory only where a slice is warranted', () => {
    expect(modulesWithAStoreDirectory()).toStrictEqual([
      ...MODULES_WITH_A_STORE_DIRECTORY,
    ]);
  });

  it('registers no state slice beyond the baseline inventory', () => {
    expect(Object.keys(makeStore().getState()).sort()).toStrictEqual(
      [...BASELINE_REGISTERED_REDUCERS].sort(),
    );
  });

  it('names the auth slice spec after the module it tests', () => {
    expect(
      readdirSync(AUTH_STORE_DIRECTORY)
        .filter((entry) => entry.endsWith('.spec.ts'))
        .sort(),
    ).toStrictEqual(['auth.slice.spec.ts']);
  });

  it('renames that spec without changing the cases it declares', () => {
    expect(caseNamesOf('auth.slice.spec.ts')).toStrictEqual([
      ...BASELINE_AUTH_SLICE_CASES,
    ]);
  });
});
