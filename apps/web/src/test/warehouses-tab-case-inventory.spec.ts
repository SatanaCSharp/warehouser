import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import baseline from 'test/baselines/warehouses-tab-cases.json';

/**
 * The case-inventory gate for the CH-W5 spec split
 * (refactor-warehouse-components CR-RG-01, CR-RG-02, CR-RG-04).
 *
 * `WarehousesTab.spec.tsx` held 39 cases in ten `describe` blocks at
 * `baseline_revision = 42f1205`. `sad.md` §5.4 redistributes them across four
 * files without deleting one, so the only mechanical protection against a case
 * being dropped while a 1122-line spec becomes four files is a comparison
 * against the frozen inventory in `test/baselines/warehouses-tab-cases.json`.
 * That baseline is **compared, never regenerated** — regenerating it to make
 * this gate pass is the failure mode it exists to catch.
 *
 * This file lives under `src/test/` because it reads four colocated specs at
 * once and belongs to none of them; `docs/system/frontend-architecture.md`
 * §"Testing" reserves that directory for cross-cutting test support.
 *
 * Scope — T11 only. It pins the two files T11 carves out and the names they
 * take away from the tab spec. The full four-file, 39-case identity gate
 * arrives with `WarehousePeopleList.spec.tsx` in T12/T13; this gate is
 * deliberately silent about the three cases that move there.
 */

const WAREHOUSES_DIRECTORY = posix.join(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
  'modules/workspace/components/workspace-administration/warehouses',
);

const CASE_NAME =
  /\bit\(\s*(?<quote>['"])(?<name>(?:\\.|(?!\k<quote>).)*)\k<quote>/gu;

const caseNamesIn = (specFileName: string): string[] =>
  Array.from(
    readFileSync(
      posix.join(WAREHOUSES_DIRECTORY, specFileName),
      'utf8',
    ).matchAll(CASE_NAME),
    (match) => (match.groups?.name ?? '').replace(/\\(?<escaped>.)/gu, '$1'),
  );

const specFileNames = (): string[] =>
  readdirSync(WAREHOUSES_DIRECTORY).filter((entry) =>
    entry.endsWith('.spec.tsx'),
  );

const baselineGroup = (describeName: string): string[] => {
  const group = baseline.groups.find(
    (candidate) => candidate.describe === describeName,
  );
  if (!group) {
    throw new Error(`No baseline group named ${describeName}`);
  }
  return group.cases;
};

/** All six cases of the list block move whole (`sad.md` §5.4). */
const LIST_SPEC_CASES = [
  ...baselineGroup('the Warehouse list (AC-33, AC-12a)'),
  // The accessibility block splits: this case names the list as its subject,
  // the two dialog focus cases assert orchestration and stay.
  'exposes the list as a labelled list of buttons that report their selected state',
];

/**
 * The Enter block splits four/two. These four name the row as their subject;
 * "navigates to that Warehouse's view when Enter is activated" (a navigation)
 * and "leaves rename, archive/restore and grant/withdraw access reachable on a
 * row that also renders Enter" (a cross-pane effect) are orchestration
 * outcomes and stay in the tab spec (`sad.md` §4.6).
 */
const ROW_SPEC_CASES = [
  "renders Enter on a row for a non-archived Warehouse in the actor's own membership list",
  'gives each Enter action an accessible name naming its own Warehouse',
  'omits Enter — hidden, not disabled — on a non-membership row, an archived membership row, and an archived non-membership row',
  'places the selection button before Enter in focus order and never nests Enter inside it',
];

const MOVED_CASES = [...LIST_SPEC_CASES, ...ROW_SPEC_CASES];

/**
 * The four cases CR-RG-04 pins to the tab spec, because each asserts a request
 * that must not fire or a control the whole tab must not offer — neither is
 * visible to a child mounted in isolation.
 */
const PERMISSION_CASES = [
  'omits the people list entirely without WORKSPACE_MEMBERS:WATCH and never requests it (AC-30)',
  'omits the add control entirely without WAREHOUSES:CREATE (AC-30)',
  'offers no editable name at all without WAREHOUSES:RENAME (AC-30)',
  'omits both lifecycle controls without WAREHOUSES:ARCHIVE (AC-30)',
];

/** The two dialog focus cases of the accessibility block, which stay. */
const DIALOG_FOCUS_CASES = [
  'keeps the archive dialog cancel before its destructive primary and returns focus to the trigger on Escape',
  'exposes the reason the archive action is unavailable rather than only dimming it (AC-11a)',
];

describe('the Warehouses tab case inventory (CR-RG-01)', () => {
  it('draws every case it moves from the frozen baseline, spelled identically', () => {
    expect(baseline.caseCount).toBe(39);
    expect(baseline.baselineRevision).toBe(
      '42f1205d552f8284f8ec57358ad9022340b5f76e',
    );
    expect(
      MOVED_CASES.filter((name) => !baseline.cases.includes(name)),
    ).toEqual([]);
  });

  it('gives WarehouseList.spec.tsx exactly the seven list cases', () => {
    expect([...caseNamesIn('WarehouseList.spec.tsx')].sort()).toEqual(
      [...LIST_SPEC_CASES].sort(),
    );
  });

  it('gives WarehouseRow.spec.tsx exactly the four row-scoped Enter cases', () => {
    expect([...caseNamesIn('WarehouseRow.spec.tsx')].sort()).toEqual(
      [...ROW_SPEC_CASES].sort(),
    );
  });

  it('leaves the tab spec the 28 cases the split does not take', () => {
    const tabCases = caseNamesIn('WarehousesTab.spec.tsx');

    expect(tabCases).toHaveLength(28);
    expect(tabCases.filter((name) => MOVED_CASES.includes(name))).toEqual([]);
    expect(
      [...PERMISSION_CASES, ...DIALOG_FOCUS_CASES].filter(
        (name) => !tabCases.includes(name),
      ),
    ).toEqual([]);
  });

  it('keeps every moved case reachable exactly once across the colocated specs', () => {
    const allCases = specFileNames().flatMap(caseNamesIn);

    expect(
      MOVED_CASES.map(
        (name) => allCases.filter((candidate) => candidate === name).length,
      ),
    ).toEqual(MOVED_CASES.map(() => 1));
  });
});
