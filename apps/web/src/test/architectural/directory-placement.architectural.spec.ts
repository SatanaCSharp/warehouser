import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Placement rules the module graph cannot hold.
 *
 * Everything else in this tier asks dependency-cruiser a question about edges.
 * The rules here are about where a file *is*, and a file in the wrong directory
 * imports exactly what it would have imported in the right one — there is no
 * edge to find. They are asserted over the tree itself instead, which is the
 * same mechanism the existing specs under `src/test/` already use.
 *
 * They live in this tier rather than in one of their own because they answer
 * the same kind of question at the same cost, and because a contributor who
 * moves a directory wants one command to tell them what that broke.
 */

const srcRoot = fileURLToPath(new URL('../../', import.meta.url));

const walk = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);

    return entry.isDirectory() ? walk(absolute) : [relative(srcRoot, absolute)];
  });

const directoriesIn = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const ALL_FILES = walk(srcRoot);

const isSpec = (path: string): boolean => /\.spec\.tsx?$/u.test(path);

/**
 * The corpus guard every spec in this file leans on.
 *
 * A placement rule is a statement about a set of paths, and an empty set
 * satisfies all of them. If the walk ever returns nothing — a moved root, a
 * renamed directory — every assertion below would pass while checking nothing.
 */
describe('the tree being examined', () => {
  it('is the real one', () => {
    expect(ALL_FILES.length).toBeGreaterThan(500);
    expect(ALL_FILES).toContain('router.ts');
  });
});

describe('hooks are filed by what they do', () => {
  /**
   * "'Every `hooks/` directory — a module's or `shared/`'s — uses the same six
   * names.'" (`docs/system/guides/placing-web-hooks.md` §2). Five of the six are
   * in use; `mutations/` is empty by consequence of
   * `docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`,
   * which removed every wrapper that would have lived there. It stays legal
   * because that ADR keeps one narrow case open — a hook that composes more
   * than one request.
   */
  const CATEGORIES = [
    'queries',
    'mutations',
    'forms',
    'projections',
    'effects',
    'state',
  ];

  it('uses only the six category names', () => {
    const categories = ALL_FILES.filter((path) => path.includes('/hooks/')).map(
      (path) => path.split('/hooks/')[1]?.split('/')[0],
    );

    expect(
      [...new Set(categories)].filter((name) => !CATEGORIES.includes(name)),
    ).toEqual([]);
  });

  /**
   * "'Create a directory when its first hook arrives; do not pre-create empty
   * ones. A `hooks/` directory with fewer than two hooks total may keep them
   * flat.'" (`placing-web-hooks.md` §2). No `hooks/` directory in the tree has
   * fewer than two hooks, so nothing is exercising that allowance and a file
   * sitting directly in `hooks/` today is unfiled rather than exempt.
   */
  it('puts no file directly in a hooks directory', () => {
    const unfiled = ALL_FILES.filter((path) =>
      /(?:^|\/)hooks\/[^/]+$/u.test(path),
    );

    expect(unfiled).toEqual([]);
  });
});

describe('state is placed where its owner is', () => {
  /**
   * "'The root store imports that reducer directly from the slice file; do not
   * add a separate reducer-export file.'"
   * (`docs/system/frontend-architecture.md` §'State').
   */
  it('adds no reducer re-export file', () => {
    expect(ALL_FILES.filter((path) => path.endsWith('.reducer.ts'))).toEqual(
      [],
    );
  });

  /**
   * "'Root `store/` contains only composition, typed hooks, and generic
   * middleware.'" (`docs/system/guides/adding-a-web-module.md` §8). Stated as
   * the exact contents rather than as a pattern, because the failure this
   * catches is a feature slice arriving under a name nobody predicted.
   */
  it('keeps the root store to composition, typed hooks and middleware', () => {
    const rootStore = ALL_FILES.filter((path) =>
      path.startsWith('store/'),
    ).sort();

    expect(rootStore).toEqual([
      'store/hooks.ts',
      'store/index.ts',
      'store/middleware/api-error.middleware.spec.ts',
      'store/middleware/api-error.middleware.ts',
      'store/middleware/mutation-feedback.middleware.spec.ts',
      'store/middleware/mutation-feedback.middleware.ts',
    ]);
  });
});

describe('loaders and routes are placed where the router expects them', () => {
  /**
   * "'The loader function goes in `modules/<module>/loaders/`'" and 'filing a
   * route loader in `guards/`, `utils/` or `api/` instead of the module's
   * `loaders/`' is named as an anti-pattern
   * (`docs/system/guides/adding-a-web-module.md` §6, §'Anti-patterns').
   */
  it('files every loader in its module’s loaders directory', () => {
    const misfiled = ALL_FILES.filter(
      (path) =>
        path.endsWith('.loader.ts') &&
        !/^modules\/[^/]+\/loaders\//u.test(path),
    );

    expect(misfiled).toEqual([]);
  });

  /**
   * "'What flatness forbids is a _second domain entity_ acquiring a home inside
   * another module's tree'", and a home is 'a name in the module list, an entry
   * in the surface declaration, and its own `route.tsx`/`page.tsx`'
   * (`docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`,
   * Accepted). A `components/` directory is a grouping, never a home, so a
   * route or page appearing under one is a module forming where none was
   * declared. `modules/auth/{login,sign-up,sign-out}/` are sanctioned sub-trees
   * and are not under `components/`, so the rule reaches them correctly.
   */
  it('grows no route or page inside a components directory', () => {
    const nested = ALL_FILES.filter(
      (path) =>
        path.includes('/components/') && /\/(?:route|page)\.tsx$/u.test(path),
    );

    expect(nested).toEqual([]);
  });
});

describe('context has a module-level home', () => {
  /**
   * "'One context pair lives in one file, in a `context/` directory in the
   * owning module'", and the only other file it may hold is
   * '`modules/<module>/context/<name>.reducer.ts`'
   * (`docs/system/guides/sharing-web-state-with-context.md` §9). `apps/web`
   * contains no context today, so this spec is what the first one will be
   * measured against.
   */
  it('holds only providers, their reducers and their specs', () => {
    const misplaced = ALL_FILES.filter(
      (path) =>
        path.includes('/context/') &&
        !/^modules\/[^/]+\/context\/(?:[A-Z][A-Za-z]*Provider|[a-z0-9-]+\.reducer)(?:\.spec)?\.tsx?$/u.test(
          path,
        ),
    );

    expect(misplaced).toEqual([]);
  });
});

describe('specs are placed where their subject is', () => {
  /**
   * "'The root of `src/test/` is for cross-cutting test support that is not a
   * test … Every spec under `src/test/` is one directory down.'"
   * (`docs/system/guides/placing-web-tests.md` §5).
   */
  it('puts no spec at the root of src/test', () => {
    expect(
      ALL_FILES.filter((path) => /^test\/[^/]+$/u.test(path)).filter(isSpec),
    ).toEqual([]);
  });

  /**
   * "'One directory per subject, named in kebab-case, with the spec named after
   * the directory.'" (`docs/system/guides/placing-web-tests.md` §3).
   *
   * `architectural/` is a tier, not a subject: it is the whole of
   * `pnpm test:architectural`, it is excluded from the unit run by path, and it
   * holds one spec per area of the architecture rather than one spec about
   * itself — the same shape `apps/server/src/test/architectural/` already has.
   * `baselines/` holds frozen JSON artifacts and no spec at all, which §5 names
   * as support.
   */
  const TIER_DIRECTORIES = ['architectural', 'baselines'];

  it('names every dedicated spec after the directory that holds it', () => {
    const mismatched = directoriesIn(join(srcRoot, 'test'))
      .filter((name) => !TIER_DIRECTORIES.includes(name))
      .filter((name) => {
        const specs = readdirSync(join(srcRoot, 'test', name)).filter(isSpec);

        return (
          !specs.includes(`${name}.spec.ts`) &&
          !specs.includes(`${name}.spec.tsx`)
        );
      });

    expect(mismatched).toEqual([]);
  });

  /**
   * Every spec in the architectural tier carries the `.architectural.spec.ts`
   * suffix the tier's `include` selects on. One that does not is collected by
   * the unit run instead — where it would cruise the whole module graph on
   * every `pnpm test`, which is the cost this tier exists to keep out of it.
   */
  it('gives every architectural spec the suffix its tier selects on', () => {
    const strays = readdirSync(join(srcRoot, 'test', 'architectural'))
      .filter(isSpec)
      .filter((name) => !name.endsWith('.architectural.spec.ts'));

    expect(strays).toEqual([]);
  });

  /**
   * "'A spec's default home is the directory of the file it tests, named after
   * that file.'" (`docs/system/guides/placing-web-tests.md` §2). Specs under
   * `src/test/` are the documented exception — they exist precisely because no
   * single file owns what they establish.
   */
  /**
   * `shared/api-layout.spec.ts` is the one spec outside `src/test/` with no
   * file of its own name beside it, and its placement is argued in its own
   * header: it guards the layout of `shared/api/`, whose criterion 'requires
   * the `shared/api` root to hold directories only. A guard filed at that root
   * would have to exempt itself, and an exemption is the one thing the
   * criterion does not admit.' One level up is the nearest legal place.
   */
  const SPECS_WITHOUT_A_SAME_NAMED_SUBJECT = ['shared/api-layout.spec.ts'];

  it('sits beside its subject everywhere outside src/test', () => {
    const files = new Set(ALL_FILES);

    const orphaned = ALL_FILES.filter(isSpec)
      .filter((path) => !path.startsWith('test/'))
      .filter((path) => {
        const subject = path.replace(/\.spec\.(?<ext>tsx?)$/u, '.$<ext>');

        if (
          files.has(subject) ||
          files.has(subject.replace(/\.tsx$/u, '.ts'))
        ) {
          return false;
        }

        // A spec named for the directory it sits in, where that directory has a
        // barrel, is beside its subject: `shared/icons/icons.spec.tsx` tests
        // `shared/icons/index.ts` and takes the directory's name because
        // `index.spec.ts` would say nothing about what it covers.
        const segments = path.split('/');
        const directory = segments.slice(0, -1);
        const specName = segments.at(-1)!.replace(/\.spec\.tsx?$/u, '');

        return !(
          specName === directory.at(-1) &&
          files.has([...directory, 'index.ts'].join('/'))
        );
      });

    expect(orphaned).toEqual(SPECS_WITHOUT_A_SAME_NAMED_SUBJECT);
  });
});

describe('translations are served, not bundled', () => {
  /**
   * "'Keep all web translation resources under Vite's public directory.'"
   * (`docs/system/adr/27-07-2026-bundled-centralized-web-translations.md`,
   * Accepted; 'Bundle imported JSON under `src/shared/i18n/locales`: rejected').
   * The companion import rule is `locale-json-is-served-not-imported`; this one
   * catches the copy arriving under `src/` in the first place, which no import
   * rule would see until something read it.
   */
  it('keeps no locale resource under src', () => {
    const bundled = ALL_FILES.filter(
      (path) =>
        path.endsWith('.json') && /(?:^|\/)(?:locales?|i18n)\//u.test(path),
    );

    expect(bundled).toEqual([]);
  });
});

describe('replaced mechanisms stay replaced', () => {
  /**
   * '`run-mutation.ts`, `workspace-mutation.ts`, `access-mutation.ts`,
   * `action-feedback.ts`' and the per-scope feedback adapters
   * (`docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`,
   * Accepted), and '`useAccessCapabilities` is removed'
   * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`, Accepted).
   *
   * `deleted-mutation-plumbing-stays-deleted` catches an *import* of one of
   * these. This catches the file coming back — which happens first, and which
   * nothing else in the tree would notice until it had a consumer.
   */
  const REPLACED = [
    'run-mutation',
    'workspace-mutation',
    'access-mutation',
    'action-feedback',
    'useAccessCapabilities',
  ];

  it('does not reintroduce a file a decision deleted', () => {
    const resurrected = ALL_FILES.filter((path) =>
      REPLACED.some((name) =>
        new RegExp(`(?:^|/)${name}\\.tsx?$`, 'u').test(path),
      ),
    );

    expect(resurrected).toEqual([]);
  });
});
