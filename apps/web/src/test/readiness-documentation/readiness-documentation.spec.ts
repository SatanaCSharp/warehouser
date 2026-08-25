import { existsSync, globSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The documentation gate for the global-loader change request (CR-AC-01).
 *
 * CR-AC-01 is the only criterion whose subject is a document rather than a
 * behaviour: `docs/system` must state that first-paint readiness of a
 * destination is owned by its **route**, that the narrowest-owner rule
 * continues to govern **error, empty and success only**, and that the four
 * `writing-web-components.md` passages `change.md` §8 names no longer
 * reference a removed symbol. `sad.md` §11 adds the two `loaders/` rows.
 * Nine reconciliation rows in total, all asserted below.
 *
 * **Why no single file owns it.** Its subject is four `docs/system` documents
 * and the index that describes them — not one file, and not any file under
 * `apps/web/src` at all. There is no source file whose behaviour these rules
 * are; the closest candidates (`route.tsx`, `MembersTab.tsx`,
 * `access-dataset.ts`) each realize one clause of one row, and a spec placed
 * beside any of them would read as if that file owned the documentation
 * contract and would silently enlarge whatever manifest its directory is
 * already subject to (`docs/system/guides/placing-web-tests.md` §2). §3 of
 * that guide files such a spec in its own dedicated `src/test/<subject>/`
 * directory, named for what it establishes rather than for the tree it reads —
 * which is what this directory is, and why it carries this comment.
 *
 * **It is a structural gate over document content.** It reads the documents as
 * text: each rule asserts the sentence the reconciliation added *and*, where
 * the row narrowed an existing rule, the absence of the sentence it replaced.
 * Both halves are required. Asserting only the addition would let a future
 * edit restore "the narrowest owner that can coordinate the complete loading,
 * error, empty, and success behavior" beside it and leave the documents saying
 * two different things; asserting only the absence would pass on a document
 * that says nothing at all.
 *
 * **What it deliberately does not assert.** That the error, empty and success
 * halves of the narrowest-owner rule are *unchanged* is asserted positively
 * here, because CR-AC-01 narrows that rule rather than deleting it and
 * CR-AC-15 depends on the surviving half: a permitted actor whose read failed
 * must still reach the component's own error arm. The behavioural rows live in
 * `src/test/route-readiness/`, `src/test/loader-permission-parity/` and the
 * colocated specs; the repository-wide sweep for a reintroduced readiness term
 * in *code* is `src/test/readiness-removal/`. This gate is the documentation
 * half of the same pair, and it fails one edit earlier — when a document stops
 * instructing what the code already does.
 */

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);

/** `apps/web/src` → `apps/web` → `apps` → the repository root. */
const REPOSITORY_ROOT = posix.dirname(
  posix.dirname(posix.dirname(SRC_DIRECTORY)),
);

const SYSTEM_DOCUMENTS = posix.join(REPOSITORY_ROOT, 'docs/system');

const documentOf = (relativePath: string): string =>
  readFileSync(posix.join(SYSTEM_DOCUMENTS, relativePath), 'utf8');

/**
 * Prose in these documents is hard-wrapped, so a sentence the reconciliation
 * added spans two or three source lines. Every prose assertion below runs
 * against the collapsed form, so a rewrap is not a failure and a deletion is.
 */
const flowed = (text: string): string => text.replace(/\s+/gu, ' ').trim();

const headingLevelOf = (line: string): number =>
  (/^#+/u.exec(line)?.[0] ?? '').length;

/**
 * One `##`/`###` section of a document, from its heading to the next heading
 * of the same or a higher level. Headings inside fenced code blocks are
 * skipped, so a `#` comment in an example cannot end a section early.
 */
const sectionOf = (source: string, heading: string): string => {
  const lines = source.split('\n');
  const headings: number[] = [];
  let isFenced = false;

  lines.forEach((line, index) => {
    if (line.startsWith('```')) {
      isFenced = !isFenced;
      return;
    }
    if (!isFenced && /^#{1,6} /u.test(line)) {
      headings.push(index);
    }
  });

  const start = headings.find(
    (index) => lines[index].replace(/^#+ /u, '') === heading,
  );

  expect(start, `"${heading}" is missing`).toBeTypeOf('number');

  const from = start as number;
  const level = headingLevelOf(lines[from]);
  const end =
    headings.find(
      (index) => index > from && headingLevelOf(lines[index]) <= level,
    ) ?? lines.length;

  return lines.slice(from + 1, end).join('\n');
};

/**
 * The fenced code blocks of a section, joined. The documented directory trees
 * are code blocks, and a row must be asserted *there* rather than anywhere in
 * the section: the prose beside the tree names `modules/<module>/loaders/` too,
 * so a section-wide search would pass on a tree the row had been deleted from.
 */
const codeOf = (section: string): string => {
  const lines = section.split('\n');
  let isFenced = false;

  return lines
    .filter((line) => {
      if (line.startsWith('```')) {
        isFenced = !isFenced;
        return false;
      }
      return isFenced;
    })
    .join('\n');
};

const FRONTEND_ARCHITECTURE = 'frontend-architecture.md';
const ADDING_A_WEB_MODULE = 'guides/adding-a-web-module.md';
const WRITING_WEB_COMPONENTS = 'guides/writing-web-components.md';
const WEB_INDEX = 'web-index.md';

// ---------------------------------------------------------------------------
// Rows 1–2: `frontend-architecture.md` §Page and §Route
// ---------------------------------------------------------------------------

describe('readiness documentation — frontend-architecture.md §Page (CR-AC-01, CH-01)', () => {
  const page = (): string =>
    sectionOf(documentOf(FRONTEND_ARCHITECTURE), 'Page');

  it('assigns first-paint readiness of a destination to its route', () => {
    expect(flowed(page())).toContain(
      'First-paint readiness of a destination is owned by its route, not by a component.',
    );
    expect(flowed(page())).toContain(
      'The route awaits the data its destination paints',
    );
  });

  it('leaves a component no waiting affordance of its own', () => {
    expect(flowed(page())).toContain(
      'A component therefore declares no spinner, no skeleton, no readiness branch and no waiting copy of its own',
    );
  });

  it('keeps the narrowest-owner rule governing error, empty and success', () => {
    expect(flowed(page())).toContain(
      'Use the narrowest owner that can coordinate the complete error, empty, and success behavior.',
    );
    expect(flowed(page())).toContain(
      'error, empty and success stay with the narrowest component that can coordinate them',
    );
  });

  it('no longer assigns loading to the narrowest owner', () => {
    expect(flowed(page())).not.toContain(
      'the complete loading, error, empty, and success behavior',
    );
  });
});

describe('readiness documentation — frontend-architecture.md §Route (CR-AC-01)', () => {
  const route = (): string =>
    sectionOf(documentOf(FRONTEND_ARCHITECTURE), 'Route');

  it('states that a route awaits the data its destination paints', () => {
    expect(flowed(route())).toContain(
      'A route **awaits the data its destination paints**',
    );
  });

  it('keeps the dispatches out of route.tsx and names where they live', () => {
    expect(flowed(route())).toContain(
      'It contains no feature JSX, form handling, RTK dispatch, or direct API calls.',
    );
    expect(flowed(route())).toContain('modules/<module>/loaders/');
  });
});

// ---------------------------------------------------------------------------
// Row 3: `frontend-architecture.md` §Source structure lists `loaders/`
// ---------------------------------------------------------------------------

describe('readiness documentation — frontend-architecture.md §Source structure (sad.md §11, ADR 0001)', () => {
  const sourceStructure = (): string =>
    sectionOf(documentOf(FRONTEND_ARCHITECTURE), 'Source structure');

  it('lists loaders/ in the modules/<module>/ tree', () => {
    const treeLine = codeOf(sourceStructure())
      .split('\n')
      .find((line) => line.includes('loaders/'));

    expect(treeLine, 'loaders/ is missing from the documented tree').toBeTypeOf(
      'string',
    );
    expect(treeLine).toContain('plain route data functions');
  });

  it('describes a loader as a plain route data function, per ADR 0001', () => {
    expect(flowed(sourceStructure())).toContain(
      '`modules/<module>/loaders/` holds **plain route data functions**',
    );
    expect(sourceStructure()).toContain(
      'change-requests/global-loader/adr/0001-module-owned-route-loaders.md',
    );
  });

  it("carries ADR 0001's three rules for the directory", () => {
    const text = flowed(sourceStructure());

    expect(text).toContain('dispatches, it does not decide access');
    expect(text).toContain('imports no page and no component');
    expect(text).toContain('declared public surface');
  });
});

// ---------------------------------------------------------------------------
// Row 4: `adding-a-web-module.md` — when a route declares a loader, and where
// ---------------------------------------------------------------------------

describe('readiness documentation — adding-a-web-module.md (sad.md §11)', () => {
  const guide = (): string => documentOf(ADDING_A_WEB_MODULE);

  it('states when a new route declares a loader', () => {
    const section = flowed(
      sectionOf(guide(), 'When the route declares a loader'),
    );

    expect(section).toContain(
      'Declare a `loader` when the destination paints server data.',
    );
    expect(section).toContain(
      'A destination that paints no server data declares no loader',
    );
  });

  it("states where the loader's file goes", () => {
    const section = flowed(
      sectionOf(guide(), 'When the route declares a loader'),
    );

    expect(section).toContain(
      'The loader function goes in `modules/<module>/loaders/`',
    );
    expect(section).toContain('with its spec beside it');
  });

  it('lists loaders/ in the feature-slice tree', () => {
    const tree = codeOf(sectionOf(guide(), '4. Create the feature slice'));

    expect(tree).toMatch(/loaders\/.*route data functions/u);
  });
});

// ---------------------------------------------------------------------------
// Rows 5–8: the four `writing-web-components.md` passages
// ---------------------------------------------------------------------------

/**
 * Symbols this change request deleted from `apps/web`. A document naming one
 * instructs a contributor to write code that does not compile — which is the
 * failure CR-AC-01's last clause forbids.
 */
const REMOVED_SYMBOLS = [
  'DatasetSkeleton',
  'WorkspaceListSkeleton',
  'WarehouseListSkeleton',
  'isReady',
  'isRefreshing',
  'loadingLabel',
] as const;

describe('readiness documentation — the four writing-web-components.md passages (CR-AC-01)', () => {
  const guide = (): string => documentOf(WRITING_WEB_COMPONENTS);

  it('§1 keeps DatasetMessage alone as the private-helper example', () => {
    expect(
      flowed(sectionOf(guide(), '1. Export one component per file')),
    ).toContain('`DatasetCard.tsx` keeps `DatasetMessage` this way');
  });

  it('§3 has the Tab/panel container render what its route already awaited', () => {
    const shape = flowed(
      sectionOf(guide(), '3. Give each component one reason to change'),
    );

    expect(shape).toContain(
      'resolves capabilities and renders the datasets its route already awaited',
    );
    expect(shape).toContain('It does not resolve the datasets itself');
  });

  it('§4 has callers reading .items only', () => {
    const read = flowed(sectionOf(guide(), '4. Read data where you use it'));

    expect(read).toContain('callers just read `.items`.');
    expect(read).toContain(
      'A hook returns the data it has and reports no readiness',
    );
  });

  it('§6 branches on permission and the error arm, not on readiness', () => {
    // The heading gained its second clause when §6 turned "keep branching
    // flat" into an outright ban on the `if`/`else if` chain. What this case
    // protects is unchanged: §6's surviving guard branches on a Permission and
    // a failed read, and readiness is still not one of the states it exits on.
    const branching = sectionOf(
      guide(),
      '6. Keep branching flat — never write an `if`/`else if` chain',
    );

    expect(branching).toContain('if (!canReadMembers || members.isError) {');
    expect(flowed(branching)).toContain(
      'Readiness is not one of the whole-component states',
    );
    expect(flowed(branching)).toContain(
      '`MembersDatasetCard` resolves `items.length === 0` into the card',
    );
  });

  it('names no removed symbol anywhere in the guide', () => {
    REMOVED_SYMBOLS.forEach((symbol) => {
      expect(
        guide(),
        `${WRITING_WEB_COMPONENTS} still names ${symbol}`,
      ).not.toContain(symbol);
    });
    expect(guide()).not.toContain('Skeleton');
  });
});

// ---------------------------------------------------------------------------
// Row 9: `web-index.md` still describes the documents it names
// ---------------------------------------------------------------------------

describe('readiness documentation — web-index.md (AGENTS.md index-currency rule)', () => {
  const index = (): string => documentOf(WEB_INDEX);

  const entryOf = (target: string): string => {
    const entries = index()
      .split(/\n- \[/u)
      .map((entry) => `- [${entry}`);
    const entry = entries.find((candidate) =>
      candidate.includes(`](${target})`),
    );

    expect(entry, `no ${WEB_INDEX} entry links ${target}`).toBeTypeOf('string');

    return flowed(entry as string);
  };

  it('describes frontend-architecture.md as it now reads', () => {
    const entry = entryOf(FRONTEND_ARCHITECTURE);

    expect(entry).toContain('module-owned `loaders/`');
    expect(entry).toContain(
      "the route owns a destination's first-paint readiness while the narrowest component owns error, empty and success",
    );
  });

  it('describes the loader step adding-a-web-module.md now carries', () => {
    expect(entryOf(ADDING_A_WEB_MODULE)).toContain(
      "declare the route's loader when the destination paints server data",
    );
  });

  it('links a document that exists for every entry', () => {
    const targets = [...index().matchAll(/\]\((?<target>[^)#]+\.md)[^)]*\)/gu)]
      .map((match) => match.groups?.target ?? '')
      .filter((target) => !target.startsWith('http'));

    expect(targets.length).toBeGreaterThan(10);
    targets.forEach((target) => {
      expect(
        existsSync(posix.join(SYSTEM_DOCUMENTS, target)),
        `${WEB_INDEX} names a missing document: ${target}`,
      ).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// No `docs/system` document names a symbol this request deleted
// ---------------------------------------------------------------------------

describe('readiness documentation — no system document names a removed symbol', () => {
  /**
   * The two HeroUI documents are generated from the vendored HeroUI v3 docs
   * and describe that library's components, not this repository's. They are
   * excluded so a regenerated listing cannot fail a gate about `apps/web`.
   */
  const GENERATED_DOCUMENTS = [
    'guides/heroui-react-v3-docs-index.md',
    'guides/heroui-design-principles.md',
  ];

  it('leaves no removed symbol anywhere under docs/system', () => {
    const documents = globSync('**/*.md', { cwd: SYSTEM_DOCUMENTS })
      .map((entry) => entry.split('\\').join('/'))
      .filter((entry) => !GENERATED_DOCUMENTS.includes(entry))
      .sort();

    expect(documents.length).toBeGreaterThan(10);

    const offenders = documents.flatMap((relativePath) => {
      const source = documentOf(relativePath);

      return REMOVED_SYMBOLS.filter((symbol) => source.includes(symbol)).map(
        (symbol) => `${relativePath}: ${symbol}`,
      );
    });

    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The gate documents its own placement
// ---------------------------------------------------------------------------

describe('readiness documentation — the gate documents its own placement', () => {
  /**
   * `placing-web-tests.md` §3: "Say in the file's header comment why no owner
   * exists." Asserted rather than assumed, for the same reason
   * `src/test/readiness-removal/` asserts it.
   */
  it('opens with a comment saying why no single file owns it', () => {
    const header = readFileSync(
      posix.join(
        SRC_DIRECTORY,
        'test/readiness-documentation/readiness-documentation.spec.ts',
      ),
      'utf8',
    ).split('\nconst SRC_DIRECTORY')[0];

    expect(header).toContain('Why no single file owns it');
    expect(header).toContain('placing-web-tests.md');
  });
});
