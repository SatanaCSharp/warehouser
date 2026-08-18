import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ADMINISTRATION_SLICE_FILES,
  MODULE_SURFACE,
  MODULES_FIXTURES_DIRECTORY,
  WAREHOUSE_MODULE_MANIFEST,
  WORKSPACE_MODULE_MANIFEST,
} from 'test/module-surface';

// The first import-boundary enforcement `apps/web` has ever had (CH-W5). It
// encodes the rule stated in
// `docs/system/adr/14-08-2026-domain-owned-flat-modules.md`: code lives in the
// module of the entity whose invariants it enforces, and reaches other modules
// only through their declared public surface.
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
// `modules/warehouse/hooks/warehouse-name-validation.spec.ts` does against
// `modules/access/hooks/workspace-role-name-validation`) is test-only coupling,
// not a production boundary crossing. The exception list this spec consults is
// genuinely empty: every production import resolves to a declared entry.

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(fileURLToPath(import.meta.url)),
);
const MODULES_DIRECTORY = posix.join(SRC_DIRECTORY, 'modules');
const FIXTURES_DIRECTORY = posix.join(
  MODULES_DIRECTORY,
  MODULES_FIXTURES_DIRECTORY,
);

const SURFACE_RULE =
  'a file may reach into modules/<x>/ only through that module\u2019s declared public surface, declared in apps/web/src/test/module-surface.ts (CR-AC-04)';

const IMPORT_SPECIFIER =
  /(?:from|import)\s*\(?\s*['"](?<specifier>[^'"]+)['"]\s*\)?/gu;

const isSpecFile = (relativePath: string): boolean =>
  /\.spec\.tsx?$/u.test(relativePath);

const isFixtureFile = (relativePath: string): boolean =>
  relativePath.startsWith(`modules/${MODULES_FIXTURES_DIRECTORY}/`);

/** Every production source file under `apps/web/src`, relative to `src`. */
const productionFiles = (): string[] =>
  globSync('**/*.{ts,tsx}', { cwd: SRC_DIRECTORY })
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => !isSpecFile(entry) && !isFixtureFile(entry))
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

interface Violation {
  readonly importer: string;
  readonly target: string;
  readonly message: string;
}

/**
 * Reports every import in `relativePaths` that reaches into a module the
 * importer does not belong to without landing on that module's declared
 * surface. Each message names the importer, the target and the rule (CR-AC-12).
 */
const findSurfaceViolations = (relativePaths: readonly string[]): Violation[] =>
  relativePaths.flatMap((importer) => {
    const source = readFileSync(posix.join(SRC_DIRECTORY, importer), 'utf8');
    const importerModule = owningModule(importer);

    return [...source.matchAll(IMPORT_SPECIFIER)].flatMap<Violation>(
      (match) => {
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
      },
    );
  });

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
        .filter(
          (entry) =>
            entry.isDirectory() && entry.name !== MODULES_FIXTURES_DIRECTORY,
        )
        .map((entry) => entry.name)
        .sort();

      expect(Object.keys(MODULE_SURFACE).sort()).toStrictEqual(
        moduleDirectories,
      );
    });

    it('keeps modules/fixtures/ free of anything but fixtures', () => {
      // `modules/fixtures/` is excluded from the module list and from the
      // scanned tree, so this pins that nothing else can hide behind that
      // exclusion.
      const fixtureEntries = readdirSync(FIXTURES_DIRECTORY, {
        withFileTypes: true,
      });

      expect(fixtureEntries.length).toBeGreaterThan(0);
      expect(
        fixtureEntries
          .filter(
            (entry) => !entry.isFile() || !entry.name.endsWith('.fixture.ts'),
          )
          .map((entry) => entry.name),
      ).toStrictEqual([]);
    });
  });

  describe('declared public surface', () => {
    const scannedFiles = productionFiles();

    it('discovers the production sources it is meant to scan', () => {
      // Guards against the scan silently passing over a mis-resolved directory.
      expect(scannedFiles.length).toBeGreaterThan(0);
      expect(scannedFiles).toContain('router.ts');
      expect(scannedFiles).toContain('shared/layouts/WarehouseLayout.tsx');
      expect(scannedFiles).not.toContain(
        'modules/fixtures/undeclared-module-import.fixture.ts',
      );
    });

    it('resolves every cross-module import to a declared surface entry', () => {
      expect(
        findSurfaceViolations(scannedFiles).map(
          (violation) => violation.message,
        ),
      ).toStrictEqual([]);
    });

    it('fails a file that imports an undeclared path, naming it and the rule', () => {
      const fixture = 'modules/fixtures/undeclared-module-import.fixture.ts';

      const [violation, ...rest] = findSurfaceViolations([fixture]);

      expect(rest).toStrictEqual([]);
      expect(violation.importer).toBe(fixture);
      expect(violation.target).toBe(
        'modules/workspace/hooks/useRenameWorkspace',
      );
      expect(violation.message).toContain(fixture);
      expect(violation.message).toContain(
        "modules/workspace's declared public surface",
      );
      expect(violation.message).toContain(SURFACE_RULE);
    });
  });

  describe('modules/workspace file manifest', () => {
    it('contains exactly the files CR-AC-03 enumerates', () => {
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
      // administering the set of them, and because two files outside the module
      // import it, so the sole-consumer tiebreak does not reach it
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
});
