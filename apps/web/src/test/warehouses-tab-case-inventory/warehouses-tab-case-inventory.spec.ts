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
 * This file lives in its own directory under `src/test/` because it reads four
 * colocated specs at once and belongs to none of them;
 * `docs/system/guides/placing-web-tests.md` files a spec with no single owner
 * there rather than one level above its subjects.
 *
 * Scope. It pins the three files T11 and T12 carve out, the names those files
 * take away from the tab spec, and — over all four files at once — that the
 * union is exactly the baseline's 39 names **plus the additions enumerated in
 * `ADDED_CASES`, less the deletions enumerated in `DELETED_CASES`**,
 * distributed 26 / 7 / 4 / 4, with every name declared exactly once. Every
 * baseline name not enumerated as deleted must still be present: the additions
 * widen what may appear, never what may disappear, and a disappearance is
 * legal only where a later change request removed the *subject* and said so by
 * name. Every assertion reports the offending **case name**, because a bare
 * count tells a reviewer that something was lost without telling them what.
 *
 * What this gate cannot decide. Case-count identity is necessary, not
 * sufficient: CR-RG-01 also requires that every moved expectation's subject and
 * expected value be diff-identical, which is a review gate on T11 and T12. A
 * green run here says no case was dropped, renamed or duplicated. It says
 * nothing about what the surviving cases assert.
 *
 * `test-plan.md` §"CI placement" retires this gate after ship: it has no
 * meaning against a tree where the pre-split file no longer exists.
 */

const WAREHOUSES_DIRECTORY = posix.join(
  posix.dirname(posix.dirname(posix.dirname(fileURLToPath(import.meta.url)))),
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

/**
 * Two blocks split rather than move whole (`sad.md` §5.4). These three name
 * the people pane as their subject; the three that stay assert orchestration
 * outcomes — a request that must not fire, a mutation, and a server denial —
 * which a child mounted in isolation cannot see (`sad.md` §4.6).
 */
const PEOPLE_LIST_SPEC_CASES = [
  'shows who has access to the selected Warehouse and never what Role they hold there',
  'carries the line that says which level decides what a person may do inside the Warehouse',
  "exposes Withdraw access as disabled on the acting member's own row, with the reason accessible to assistive technology (AC-25c)",
];

const MOVED_CASES = [
  ...LIST_SPEC_CASES,
  ...ROW_SPEC_CASES,
  ...PEOPLE_LIST_SPEC_CASES,
];

/**
 * Cases **added after** `baseline_revision`, enumerated by name and by owning
 * file so an addition stays as reviewable as a deletion.
 *
 * The three findings that required them are recorded in
 * `docs/change-requests/refactor-warehouse-components/_review/review-2026-08-18.md`
 * (S3, S4, S5): the split moved a derivation and a permission gate behind
 * harness props, leaving three clauses of CR-RG-01 and CR-RG-03 asserted by
 * nothing that could fail. CR-RG-01 forbids deleting or rewriting an
 * expectation; it explicitly permits adding one.
 *
 * This list is the same device the retired CR-RG-05 chunk-manifest gate used
 * to admit the CH-W5 leaves: the baseline stays *compared, never
 * regenerated*, and everything not in the baseline must be named here to
 * pass. An addition nobody enumerated still fails as `unexpected`.
 */
const ADDED_CASES: Record<string, string[]> = {
  'WarehousesTab.spec.tsx': [
    'derives each row people count from the Workspace users the server returns',
  ],
  'WarehouseList.spec.tsx': [
    // global-loader CR-RG-05: `warehouses.noMatches` was the third arm of the
    // four-way branch whose loading arm CH-14 deletes, and the criterion
    // requires it to keep rendering its own message. It had no case of its own
    // before, so removing the deleted arm without adding this one would have
    // left the surviving arm unasserted.
    'names the search term that matched nothing instead of showing an empty list',
    // Follow-up B3 from `_review/code-review-front-end-2026-08-21.md`: the
    // loader settles its secondary reads, so a rejected Warehouse read still
    // commits the destination. The list gained a failed-read arm ahead of the
    // empty one, and this case is what stops it silently reverting to
    // "This workspace has no warehouse yet."
    'states that the warehouses could not be loaded instead of an empty workspace',
  ],
  'WarehousePeopleList.spec.tsx': [
    'offers no withdraw control at all to an actor without WAREHOUSE_MEMBERSHIPS:REVOKE',
  ],
};

/**
 * Cases **deleted after** `baseline_revision`, enumerated by name for the same
 * reason `ADDED_CASES` enumerates an addition: the baseline stays *compared,
 * never regenerated*, so a case that leaves the tree must be named here or the
 * gate reports it as `missing`.
 *
 * Both name a waiting affordance global-loader CH-08 removes (CR-AC-08).
 * `/workspace`'s route loader awaits the Warehouse list, the Workspace context
 * and the Workspace users before the destination paints, so neither the
 * skeleton the first case announced nor the anti-flash clause the second
 * pinned still exists to assert. The subject is gone, not the assertion:
 * CR-RG-01 forbids dropping an expectation whose subject survives, which is
 * why every other baseline name is still required below.
 *
 * The second is a former `ADDED_CASES` entry rather than a baseline name, so it
 * is deleted by removing it from that list above; it is recorded here so a
 * reader sees both halves of the same removal in one place.
 */
const DELETED_CASES = [
  'announces the loading skeleton as "Loading warehouses" before the list arrives',
] as const;

const survives = (name: string): boolean =>
  !DELETED_CASES.includes(name as (typeof DELETED_CASES)[number]);

const addedIn = (specFileName: string): string[] =>
  ADDED_CASES[specFileName] ?? [];

/** The cases one spec file must declare: what it was assigned, less what this
 * change request deleted, plus what it gained. */
const expectedIn = (specFileName: string, assigned: string[]): string[] =>
  [...assigned, ...addedIn(specFileName)].filter(survives);

const ALL_ADDED_CASES = Object.values(ADDED_CASES).flat();

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

/**
 * The other half of the withdraw block, which stays: a mutation and a server
 * denial, neither visible to the people list mounted in isolation (CR-RG-03).
 */
const WITHDRAW_ORCHESTRATION_CASES = [
  'states what is preserved, withdraws the membership and removes the person from the pane (AC-25b)',
  'handles a server denial of withdrawal independently of the offered control, without disclosing the target (AC-25c)',
];

/** The two dialog focus cases of the accessibility block, which stay. */
const DIALOG_FOCUS_CASES = [
  'keeps the archive dialog cancel before its destructive primary and returns focus to the trigger on Escape',
  'exposes the reason the archive action is unavailable rather than only dimming it (AC-11a)',
];

/**
 * The 25 the split does not take, derived from the frozen baseline by removing
 * the 14 it moves — the baseline is *compared*, never regenerated from the
 * post-split tree (`test-plan.md` §"Test data").
 */
const TAB_SPEC_CASES = baseline.cases.filter(
  (name) => !MOVED_CASES.includes(name),
);

/** Exact, not a lower bound — and it also rejects a fifth colocated spec. The
 * list spec keeps seven of its own: six of the seven it was assigned, the
 * seventh deleted with the skeleton, plus the search-empty case that replaces
 * it. */
const EXPECTED_DISTRIBUTION: Record<string, number> = {
  'WarehousesTab.spec.tsx': 25 + addedIn('WarehousesTab.spec.tsx').length,
  'WarehouseList.spec.tsx': 6 + addedIn('WarehouseList.spec.tsx').length,
  'WarehouseRow.spec.tsx': 4 + addedIn('WarehouseRow.spec.tsx').length,
  'WarehousePeopleList.spec.tsx':
    3 + addedIn('WarehousePeopleList.spec.tsx').length,
};

const occurrences = (names: string[]): Map<string, number> =>
  names.reduce(
    (counts, name) => counts.set(name, (counts.get(name) ?? 0) + 1),
    new Map<string, number>(),
  );

/**
 * The whole point of the gate: a dropped, renamed or duplicated case is
 * reported *by name*. A rename shows as one `missing` and one `unexpected`,
 * which reads as the rename it is.
 */
const identityAgainstBaseline = (
  declared: string[],
): {
  missing: string[];
  unexpected: string[];
  duplicated: string[];
} => {
  const counts = occurrences(declared);
  return {
    missing: baseline.cases
      .filter((name) => !counts.has(name) && survives(name))
      .sort(),
    unexpected: [...counts.keys()]
      .filter(
        (name) =>
          !baseline.cases.includes(name) && !ALL_ADDED_CASES.includes(name),
      )
      .sort(),
    duplicated: [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name, count]) => `${name} (declared ${count} times)`)
      .sort(),
  };
};

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

  it('gives WarehouseList.spec.tsx its six surviving list cases and the search-empty one', () => {
    expect([...caseNamesIn('WarehouseList.spec.tsx')].sort()).toEqual(
      expectedIn('WarehouseList.spec.tsx', [...LIST_SPEC_CASES]).sort(),
    );
  });

  it('gives WarehouseRow.spec.tsx exactly the four row-scoped Enter cases', () => {
    expect([...caseNamesIn('WarehouseRow.spec.tsx')].sort()).toEqual(
      expectedIn('WarehouseRow.spec.tsx', [...ROW_SPEC_CASES]).sort(),
    );
  });

  it('gives WarehousePeopleList.spec.tsx exactly the three people-pane cases', () => {
    expect([...caseNamesIn('WarehousePeopleList.spec.tsx')].sort()).toEqual(
      expectedIn('WarehousePeopleList.spec.tsx', [
        ...PEOPLE_LIST_SPEC_CASES,
      ]).sort(),
    );
  });

  it('leaves the tab spec exactly the 25 baseline cases the split does not take', () => {
    const tabCases = caseNamesIn('WarehousesTab.spec.tsx');

    expect(TAB_SPEC_CASES).toHaveLength(25);
    // Named, not counted: this diff spells out which case went missing, was
    // renamed, or arrived that the baseline does not know about.
    expect([...tabCases].sort()).toEqual(
      expectedIn('WarehousesTab.spec.tsx', TAB_SPEC_CASES).sort(),
    );
    expect(tabCases.filter((name) => MOVED_CASES.includes(name))).toEqual([]);
    expect(
      [
        ...PERMISSION_CASES,
        ...WITHDRAW_ORCHESTRATION_CASES,
        ...DIALOG_FOCUS_CASES,
      ].filter((name) => !tabCases.includes(name)),
    ).toEqual([]);
  });

  it('declares the baseline cases less the enumerated deletions plus the enumerated additions, each exactly once', () => {
    const declared = specFileNames().flatMap(caseNamesIn);

    expect(
      identityAgainstBaseline(declared),
      'a case was dropped, renamed or duplicated during the split',
    ).toEqual({ missing: [], unexpected: [], duplicated: [] });
    expect(declared).toHaveLength(
      baseline.caseCount + ALL_ADDED_CASES.length - DELETED_CASES.length,
    );
    // A deleted case is deleted, not relocated: no spec may still declare one.
    expect(declared.filter((name) => !survives(name))).toEqual([]);
  });

  it('distributes the cases exactly 26 / 7 / 4 / 4, with no fifth spec', () => {
    expect(
      Object.fromEntries(
        specFileNames().map((fileName) => [
          fileName,
          caseNamesIn(fileName).length,
        ]),
      ),
    ).toEqual(EXPECTED_DISTRIBUTION);
  });
});
