import { cruiseWebGraph } from 'test/architectural/web-graph';
import { describe, expect, it } from 'vitest';

/**
 * What `shared/` is allowed to hold.
 *
 * "'Keep logic inside one module until another module genuinely needs it.
 * Promote it to `shared/` only when reuse exists'", and `shared/components/` is
 * annotated in the same directory listing as '`reused by at least two modules`'
 * (`docs/system/frontend-architecture.md` §'Source structure'). 'Moving
 * single-feature code to `shared/` before it has another consumer' is named as
 * an anti-pattern (`docs/system/guides/adding-a-web-module.md`
 * §'Common failures').
 *
 * Neither fact is reachable from the rest of this tier. `no-orphan-modules`
 * (`web-rules.ts` §B) catches a file nothing imports **and** that imports
 * nothing, which a dead component never is: it imports React, and its own spec
 * imports it. So a `shared/` component whose only consumer is the spec proving
 * it works satisfies every rule this tier had — which is how one shipped.
 *
 * The question is therefore asked against the raw graph: who imports this file,
 * excluding specs? Specs are excluded on purpose. A spec is not reuse, and
 * counting it would make "is this used?" answerable by writing a test for it.
 */

/**
 * The two files that fail the cross-module test below and are **not** fixed
 * here.
 *
 * Every consumer of each lives in `modules/access` — `DatasetCard` has three,
 * `translation-key` has two — so by the rule below both are that module's code.
 * Both predate the `dashboards` remediation this spec arrived with, and
 * `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` §'Consequences'
 * says such code is 'corrected by a deliberate change, not opportunistically
 * inside unrelated work'. Moving them is that deliberate change, and it is not
 * this one.
 *
 * They are named rather than excluded by a path pattern so the list can only
 * shrink: moving either makes this spec fail until its entry goes, and a third
 * file cannot quietly join them.
 */
const PRE_EXISTING_SINGLE_MODULE_SHARED_FILES = [
  'src/shared/components/DatasetCard.tsx',
  'src/shared/utils/translation-key.ts',
] as const;

const SPEC = /\.spec\.tsx?$/u;

const isSpec = (path: string): boolean => SPEC.test(path);

/**
 * The module a file belongs to, or `null` when it belongs to none —
 * `shared/`, `store/`, `routes/`, `guards/` and the entry point.
 */
const owningModule = (path: string): string | null =>
  /^src\/modules\/(?<module>[^/]+)\//u.exec(path)?.groups?.module ?? null;

interface SharedFile {
  readonly path: string;
  /** Production importers, specs excluded. */
  readonly consumers: readonly string[];
  /** The distinct modules those importers belong to. */
  readonly consumingModules: readonly string[];
}

/**
 * Every production file under one `shared/` sub-directory, with the production
 * importers and consuming modules the graph gives it.
 */
const sharedFilesUnder = async (prefix: string): Promise<SharedFile[]> => {
  const graph = await cruiseWebGraph();

  return graph.modules
    .filter((module) => module.source.startsWith(prefix))
    .filter((module) => !isSpec(module.source))
    .map((module) => {
      const consumers = (module.dependents ?? []).filter(
        (dependent) => !isSpec(dependent),
      );

      return {
        path: module.source,
        consumers,
        consumingModules: [
          ...new Set(
            consumers
              .map(owningModule)
              .filter((name): name is string => name !== null),
          ),
        ].sort(),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
};

describe('what shared/ is allowed to hold', () => {
  /**
   * Reuse has to exist at all. A `shared/` file with no production importer is
   * not shared code: it is code that was written, proven by its own spec, and
   * never wired to anything — and every later reader has to work out whether
   * it is load-bearing before they may touch it.
   *
   * Reported as the file list rather than a count, so a failure names what to
   * delete or wire up.
   */
  it('gives every shared component and helper a production consumer', async () => {
    const unconsumed = (await sharedFilesUnder('src/shared/')).filter(
      (file) => file.consumers.length === 0,
    );

    expect(unconsumed.map((file) => file.path)).toEqual([]);
  });

  /**
   * Reuse has to be *cross-module*. '`shared/components/ # reused by at least
   * two modules`' (`docs/system/frontend-architecture.md` §'Source structure'),
   * and 'Moving single-feature code to `shared/` before it has another
   * consumer' is the anti-pattern
   * (`docs/system/guides/adding-a-web-module.md` §'Common failures').
   *
   * A file every one of whose consumers sits in **one** module is that module's
   * code kept somewhere every module can reach. The test is deliberately "all
   * consumers in one module" rather than "fewer than two modules": a shared
   * file consumed by the composition layer (`main.tsx`, `shared/layouts/`) or
   * by another `shared/` file has no module consumer at all, which is an
   * ordinary shared-platform file rather than a misplaced feature one —
   * `LocaleProvider`, `DialogHost` and `WarehouseEntryRefusal` are that case
   * and are not what this asks about.
   */
  it('leaves nothing in shared/ whose every consumer is one module', async () => {
    const singleModule = (await sharedFilesUnder('src/shared/')).filter(
      (file) =>
        file.consumingModules.length === 1 &&
        file.consumers.length > 0 &&
        file.consumers.every((consumer) => owningModule(consumer) !== null),
    );

    expect(singleModule.map((file) => file.path)).toEqual([
      ...PRE_EXISTING_SINGLE_MODULE_SHARED_FILES,
    ]);
  });
});
