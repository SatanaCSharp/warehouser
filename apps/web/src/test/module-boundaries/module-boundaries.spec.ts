import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ADMINISTRATION_SLICE_FILES,
  MODULE_SURFACE,
  WAREHOUSE_MODULE_MANIFEST,
  WORKSPACE_MODULE_MANIFEST,
} from 'test/module-boundaries/module-surface';

// The first import-boundary enforcement `apps/web` has ever had
// (modules-level-refactor CH-W5). It encodes the rule stated in
// `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` (Superseded; the
// public-surface rule it states is preserved verbatim and narrowed by
// `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`): code
// lives in the module of the entity whose invariants it enforces, and reaches
// other modules only through their declared public surface.
//
// Style follows the repository's existing enforcement pattern — a static source
// scan (`globSync`/`readFileSync` + regex), as in
// `apps/server/src/users/module-boundaries.spec.ts` and
// `tests/access/authorization-coverage.spec.mjs` — rather than a dependency
// graph tool or an ESLint boundary plugin, neither of which this repository has.
//
// SCAN SCOPE — production files only. `*.spec.ts(x)` are excluded, mirroring
// `tests/access/authorization-coverage.spec.mjs:155` and
// `apps/server/src/users/module-boundaries.spec.ts`, where the server's own
// boundary scans filter spec files out. This is a scan *scope*, not an
// exception: the rule binds the production import graph, and a spec that
// exercises two modules' validators in one `it.each` (as
// `modules/workspace/utils/warehouse-name-validation.spec.ts` does against
// `modules/access/utils/workspace-role-name-validation`) is test-only coupling,
// not a production boundary crossing. The exception list this spec consults is
// genuinely empty: every production import resolves to a declared entry.

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);
const MODULES_DIRECTORY = posix.join(SRC_DIRECTORY, 'modules');

const SURFACE_RULE =
  'a file may reach into modules/<x>/ only through that module\u2019s declared public surface, declared in apps/web/src/test/module-boundaries/module-surface.ts (modules-level-refactor CR-AC-04)';

const IMPORT_SPECIFIER =
  /(?:from|import)\s*\(?\s*['"](?<specifier>[^'"]+)['"]\s*\)?/gu;

const isSpecFile = (relativePath: string): boolean =>
  /\.spec\.tsx?$/u.test(relativePath);

/** Every production source file under `apps/web/src`, relative to `src`. */
const productionFiles = (): string[] =>
  globSync('**/*.{ts,tsx}', { cwd: SRC_DIRECTORY })
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => !isSpecFile(entry))
    .sort();

/** Every file of one module, relative to that module's root, sorted. */
const moduleFiles = (moduleName: string): string[] => {
  const moduleDirectory = posix.join(MODULES_DIRECTORY, moduleName);

  return globSync('**/*', { cwd: moduleDirectory, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      posix
        .relative(
          moduleDirectory,
          posix.join(entry.parentPath.split('\\').join('/'), entry.name),
        )
        .split('\\')
        .join('/'),
    )
    .sort();
};

/** The module a file belongs to, or `null` for the composition layer. */
const owningModule = (relativePath: string): string | null =>
  relativePath.startsWith('modules/') ? relativePath.split('/')[1] : null;

/**
 * Rewrites an import specifier to the canonical `modules/...` form the surface
 * declaration uses: extensionless, and with relative traversals resolved
 * against the importer. Web imports resolve through `baseUrl: ./src`, so a bare
 * specifier is already canonical.
 */
const canonicalTarget = (importer: string, specifier: string): string => {
  const resolved = specifier.startsWith('.')
    ? posix.normalize(posix.join(posix.dirname(importer), specifier))
    : specifier;

  return resolved.replace(/\.(?:tsx?|jsx?)$/u, '');
};

/**
 * The two files that make up the boundary machinery: this spec and the surface
 * declaration it reads.
 */
const MACHINERY_FILES = [
  'test/module-boundaries/module-boundaries.spec.ts',
  'test/module-boundaries/module-surface.ts',
] as const;

/**
 * The pre-move home of the warehouse-name validation spec. Written with a
 * unicode escape for its final character so this guard's own source is not a
 * hit for the scan below.
 */
const MOVED_VALIDATION_SPEC =
  'modules/warehouse/hooks/warehouse-name-validatio\u006E';

/**
 * The `modules-level-refactor` identifiers the boundary machinery cites, each
 * of which this request re-uses for something unrelated. Their digits are
 * escaped for the same reason as `MOVED_VALIDATION_SPEC`: this list must not
 * read as one of the unqualified citations it looks for.
 */
const PREDECESSOR_IDENTIFIERS = [
  'CH-W\u0035',
  'CR-AC-0\u0033',
  'CR-AC-0\u0034',
] as const;

/** The request that owns those identifiers, as written before each citation. */
const PREDECESSOR_REQUEST = 'modules-level-refactor';

/**
 * Every source under `apps/web/src`, relative to `src` — specs and comments
 * included, because a stale reference is a documentation defect that no
 * production scan would see.
 *
 * `test/baselines/*.json` are excluded on purpose: they are frozen artifacts
 * that record the tree at `baseline_revision`, so they legitimately name
 * pre-move paths. Scanning them would make this guard fight the baselines it
 * exists to protect.
 */
const scannedSources = (): string[] =>
  globSync('**/*.{ts,tsx,json}', { cwd: SRC_DIRECTORY })
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => !entry.startsWith('test/baselines/'))
    .sort();

interface Violation {
  readonly importer: string;
  readonly target: string;
  readonly message: string;
}

/**
 * Reports every import in `source` that reaches into a module `importer` does
 * not belong to without landing on that module's declared surface. Each message
 * names the importer, the target and the rule (CR-AC-12).
 *
 * It takes the source as an argument rather than reading it, so the negative
 * case below can exercise the detector on a source that violates the rule
 * without that source existing as a file anywhere under `src/`.
 */
const surfaceViolationsIn = (importer: string, source: string): Violation[] => {
  const importerModule = owningModule(importer);

  return [...source.matchAll(IMPORT_SPECIFIER)].flatMap<Violation>((match) => {
    const target = canonicalTarget(importer, match.groups?.specifier ?? '');

    if (!target.startsWith('modules/')) {
      return [];
    }

    const targetModule = target.split('/')[1];

    if (targetModule === importerModule) {
      return [];
    }

    const surface: readonly string[] | undefined = (
      MODULE_SURFACE as Record<string, readonly string[]>
    )[targetModule];

    if (surface === undefined) {
      return [
        {
          importer,
          target,
          message: `${importer} imports '${target}', but 'modules/${targetModule}' is not a declared module — ${SURFACE_RULE}`,
        },
      ];
    }

    if (surface.includes(target)) {
      return [];
    }

    return [
      {
        importer,
        target,
        message: `${importer} imports '${target}', which is not part of modules/${targetModule}'s declared public surface [${surface.join(', ')}] — ${SURFACE_RULE}`,
      },
    ];
  });
};

/** The same check, over files read from `apps/web/src`. */
const findSurfaceViolations = (relativePaths: readonly string[]): Violation[] =>
  relativePaths.flatMap((importer) =>
    surfaceViolationsIn(
      importer,
      readFileSync(posix.join(SRC_DIRECTORY, importer), 'utf8'),
    ),
  );

describe('web module boundaries', () => {
  describe('flat-module identity', () => {
    it('declares a surface for exactly the directories directly under modules/', () => {
      // Flatness is a property of module *identity*, not of directory depth:
      // the module list is exactly the directories directly under `modules/`,
      // and only those have a name and a public surface. `modules/auth/` may
      // still organize `login/`, `sign-up/` and `sign-out/` as route sub-trees
      // of its own entity and stays one module (ADR §Flatness, sad §4.7).
      const moduleDirectories = readdirSync(MODULES_DIRECTORY, {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

      expect(Object.keys(MODULE_SURFACE).sort()).toStrictEqual(
        moduleDirectories,
      );
    });
  });

  describe('declared public surface', () => {
    const scannedFiles = productionFiles();

    it('discovers the production sources it is meant to scan', () => {
      // Guards against the scan silently passing over a mis-resolved directory.
      expect(scannedFiles.length).toBeGreaterThan(0);
      expect(scannedFiles).toContain('router.ts');
      expect(scannedFiles).toContain('shared/layouts/WarehouseLayout.tsx');
    });

    it('resolves every cross-module import to a declared surface entry', () => {
      expect(
        findSurfaceViolations(scannedFiles).map(
          (violation) => violation.message,
        ),
      ).toStrictEqual([]);
    });

    it('fails a source that imports an undeclared path, naming it and the rule', () => {
      // What proves the rule has teeth: a scan that reported nothing would be
      // indistinguishable from a scan that checked nothing. The offending
      // source is held here rather than on disk, because a file that breaks the
      // rule has no legitimate home under `src/` — every directory there is
      // either a module or the composition layer, and both are bound by the
      // rule this source exists to break.
      const importer = 'shared/layouts/UndeclaredImportProbe.tsx';
      const source = [
        // Allowed: the declared surface entry the composition layer uses.
        "import { workspaceRoute } from 'modules/workspace/route';",
        // Refused: a real, working import that is deliberately not declared.
        "import { warehouseNameValidationKey } from 'modules/workspace/utils/warehouse-name-validation';",
      ].join('\n');

      const [violation, ...rest] = surfaceViolationsIn(importer, source);

      expect(rest).toStrictEqual([]);
      expect(violation.importer).toBe(importer);
      expect(violation.target).toBe(
        'modules/workspace/utils/warehouse-name-validation',
      );
      expect(violation.message).toContain(importer);
      expect(violation.message).toContain(
        "modules/workspace's declared public surface",
      );
      expect(violation.message).toContain(SURFACE_RULE);
    });
  });

  describe('modules/workspace file manifest', () => {
    it('contains exactly the files modules-level-refactor CR-AC-03 enumerates', () => {
      // Any file added here fails until someone deliberately amends the
      // manifest — which is the point: the mechanical checks cannot answer
      // "whose invariants does this file enforce?", so the manifest forces a
      // human to answer it rather than skip it (CR-AC-12).
      expect(moduleFiles('workspace')).toStrictEqual([
        ...WORKSPACE_MODULE_MANIFEST,
      ]);
    });
  });

  describe('modules/warehouse file manifest', () => {
    it('retains exactly the six files CR-AC-01 enumerates', () => {
      // The in-Warehouse destination and nothing else. `useRecordWarehouseEntry`
      // stays because it serves *entering* a Warehouse rather than
      // administering the set of them, and because its one outside importer is
      // the composition layer (`shared/layouts/WarehouseLayout.tsx`) rather than
      // another entity's module, so the tiebreak's scope condition fails and it
      // does not reach the hook
      // (`docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`).
      expect(moduleFiles('warehouse')).toStrictEqual([
        ...WAREHOUSE_MODULE_MANIFEST,
      ]);
    });

    it('resolves the administration slice under workspace, never warehouse', () => {
      const resolvesIn = (moduleName: string): string[] =>
        ADMINISTRATION_SLICE_FILES.filter((file) =>
          existsSync(posix.join(MODULES_DIRECTORY, moduleName, file)),
        );

      expect(resolvesIn('warehouse')).toStrictEqual([]);
      expect(resolvesIn('workspace')).toStrictEqual([
        ...ADMINISTRATION_SLICE_FILES,
      ]);
    });
  });

  describe('boundary machinery references', () => {
    it('leaves no source naming the pre-move warehouse-name validation spec', () => {
      const offenders = scannedSources().filter((entry) =>
        readFileSync(posix.join(SRC_DIRECTORY, entry), 'utf8').includes(
          MOVED_VALIDATION_SPEC,
        ),
      );

      expect(offenders).toStrictEqual([]);
    });

    it('qualifies every re-used predecessor identifier with its owning request', () => {
      // The machinery cites three predecessor identifiers to explain why the
      // predecessor's code exists, and this request re-uses all three numbers
      // for unrelated things. Each citation therefore names its owning request:
      // they are qualified, never renumbered.
      const unqualified = MACHINERY_FILES.flatMap((file) => {
        const source = readFileSync(posix.join(SRC_DIRECTORY, file), 'utf8');

        return PREDECESSOR_IDENTIFIERS.filter((identifier) =>
          source
            .split(`${PREDECESSOR_REQUEST} ${identifier}`)
            .join('')
            .includes(identifier),
        ).map((identifier) => `${file} cites an unqualified ${identifier}`);
      });

      expect(unqualified).toStrictEqual([]);
    });
  });
});
