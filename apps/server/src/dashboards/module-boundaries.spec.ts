import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

// T22 (sad.md §10 "Hand-enumerated gates") — `dashboards` is a query-only
// feature module with no `module-boundaries.spec.ts` of its own, so nothing
// forbade it importing another feature module or forbade another module
// reaching into it: every sibling module's own boundary spec enumerates its
// *own* forbidden imports and none of them names `dashboards`, and this
// module never got a spec that names them. `server-architecture.md` §Testing
// states the convention this file follows — one `module-boundaries.spec.ts`
// per module, a static source scan rather than a dependency-graph tool.
//
// Scoped to exactly what the task names: forbid `dashboards` importing
// another feature module, and forbid any other module importing
// `dashboards`. `access/module-boundaries.spec.ts` and
// `users/module-boundaries.spec.ts` discover the sibling module list from
// disk rather than hand-enumerating it (both cite the "rotted list" failure
// mode a hand-written array fell into), and this file follows that
// precedent in both directions, so a module added or removed tomorrow needs
// no edit here.

const MODULE_NAME = 'dashboards';
const moduleDirectory = import.meta.dirname;
const sourceRoot = join(import.meta.dirname, '..');

// The module list is exactly the directories directly under `src/`
// (adr/14-08-2026-domain-owned-flat-modules.md §Flatness). `shared/` is
// server-wide infrastructure and `test/` is cross-cutting test support —
// neither is a module.
const NON_MODULE_DIRECTORIES = ['shared', 'test'];

const FEATURE_MODULES = readdirSync(sourceRoot, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && !NON_MODULE_DIRECTORIES.includes(entry.name),
  )
  .map((entry) => entry.name);

const toPosix = (value: string): string => value.split(sep).join('/');

interface ScannedSource {
  readonly filePath: string;
  readonly source: string;
}

/** Every production `.ts` file under `directory`, `*.spec.ts` excluded — a
 * spec legitimately imports cross-feature fixtures for test setup, which is
 * test-only coupling rather than the production import boundary this file
 * governs (`access/module-boundaries.spec.ts`'s documented scope). */
const collectProductionSources = (directory: string): ScannedSource[] =>
  readdirSync(directory).flatMap((entry) => {
    const absolute = join(directory, entry);

    if (statSync(absolute).isDirectory()) {
      return collectProductionSources(absolute);
    }

    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) {
      return [];
    }

    return [
      {
        filePath: toPosix(relative(sourceRoot, absolute)),
        source: readFileSync(absolute, 'utf8'),
      },
    ];
  });

/**
 * Matches a bare specifier naming `featureModule` (intra-application imports
 * resolve through `baseUrl: ./src`) or a relative traversal into it — both
 * spellings an import of a sibling module can wear, following
 * `users/module-boundaries.spec.ts`'s pattern. The closing quote counts as a
 * terminator too, so the bare barrel form (`from 'dashboards'`, under
 * `moduleResolution: "Bundler"`) is caught as well as a deep path.
 */
const forbiddenModuleImportPattern = (featureModule: string): RegExp =>
  new RegExp(`from\\s+['"](?:\\.\\./)*${featureModule}(?:/|['"])`, 'u');

/** One violation message per offending file, naming the file and the sibling
 * module it reached into. */
const findForeignModuleImports = (
  sources: readonly ScannedSource[],
  forbiddenModules: readonly string[],
): string[] =>
  sources.flatMap(({ filePath, source }) =>
    forbiddenModules
      .filter((featureModule) =>
        forbiddenModuleImportPattern(featureModule).test(source),
      )
      .map(
        (featureModule) =>
          `${filePath} imports '${featureModule}', which is a foreign feature module — dashboards must not import another feature module, and no other module may import dashboards (sad.md §10, server-architecture.md §"Dependency direction")`,
      ),
  );

const dashboardsSources = collectProductionSources(moduleDirectory);
const otherModules = FEATURE_MODULES.filter((name) => name !== MODULE_NAME);

describe('dashboards module boundaries', () => {
  it('discovers at least one production source file under dashboards/', () => {
    // Guards against the scan silently passing over an empty or misnamed
    // directory.
    expect(dashboardsSources.length).toBeGreaterThan(0);
  });

  it('discovers every sibling feature module, not a hand-written subset', () => {
    // The rotted-list failure `access/module-boundaries.spec.ts` and
    // `users/module-boundaries.spec.ts` both record: a literal here would
    // silently stop covering a module added later.
    expect(otherModules.length).toBeGreaterThan(0);
    expect(otherModules).not.toContain(MODULE_NAME);
  });

  it('imports no other feature module', () => {
    // `dashboards` is query-only: every dataset it reads comes from
    // `shared/domain/repositories/`, not from another feature's use cases.
    // `auth/auth.module` is the one sanctioned exception, registered from
    // `rest/rest.module.ts` to wire the session guards — exactly the pattern
    // every other feature's `rest.module.ts` follows
    // (`access/module-boundaries.spec.ts`'s "admits the exported auth module"
    // case).
    const forbidden = otherModules.filter((name) => name !== 'auth');

    expect(findForeignModuleImports(dashboardsSources, forbidden)).toEqual([]);
  });

  it('registers only the sanctioned auth guard import, nowhere else', () => {
    const authImporters = dashboardsSources.filter(({ source }) =>
      forbiddenModuleImportPattern('auth').test(source),
    );

    expect(authImporters.map(({ filePath }) => filePath)).toStrictEqual([
      'dashboards/rest/rest.module.ts',
    ]);
  });

  it('is imported by no other module', () => {
    const offenders = otherModules.flatMap((featureModule) => {
      const sources = collectProductionSources(join(sourceRoot, featureModule));

      return findForeignModuleImports(sources, [MODULE_NAME]);
    });

    expect(offenders).toEqual([]);
  });

  // ---------------------------------------------------------------------
  // Teeth. A boundary that cannot fail is not a boundary — each case below
  // feeds the pattern a deliberate violation, in both directions.
  // ---------------------------------------------------------------------

  it('rejects a dashboards fixture that imports a sibling module, naming it', () => {
    const fixture: ScannedSource[] = [
      {
        filePath: 'dashboards/usecases/queries/read-coverage-gap.query.ts',
        source:
          "import { WarehouseRepository } from 'warehouses/domain/repositories/warehouse.repository';",
      },
    ];

    const [violation, ...rest] = findForeignModuleImports(fixture, [
      'warehouses',
    ]);

    expect(rest).toEqual([]);
    expect(violation).toContain(
      'dashboards/usecases/queries/read-coverage-gap.query.ts',
    );
    expect(violation).toContain("'warehouses'");
  });

  it('rejects a relative traversal into a sibling module', () => {
    const fixture: ScannedSource[] = [
      {
        filePath: 'dashboards/usecases/queries/read-coverage-gap.query.ts',
        source:
          "import { WarehouseRepository } from '../../warehouses/domain/repositories/warehouse.repository';",
      },
    ];

    expect(findForeignModuleImports(fixture, ['warehouses'])).toHaveLength(1);
  });

  it('rejects a sibling module importing dashboards, naming it', () => {
    const fixture: ScannedSource[] = [
      {
        filePath: 'warehouses/usecases/queries/some.query.ts',
        source:
          "import { ReadCoverageGapQuery } from 'dashboards/usecases/queries/read-coverage-gap.query';",
      },
    ];

    const [violation, ...rest] = findForeignModuleImports(fixture, [
      MODULE_NAME,
    ]);

    expect(rest).toEqual([]);
    expect(violation).toContain('warehouses/usecases/queries/some.query.ts');
    expect(violation).toContain("'dashboards'");
  });

  it('admits a published contracts subpath named for a sibling module', () => {
    // `@warehouser/contracts/dashboards` is a package specifier, not an
    // intra-application module import — the same distinction
    // `access/module-boundaries.spec.ts` pins for
    // `@warehouser/contracts/workspaces`.
    const fixture: ScannedSource[] = [
      {
        filePath:
          'dashboards/rest/controllers/warehouse-dashboard.controller.ts',
        source:
          "import { coverageGapPanelSchema } from '@warehouser/contracts/dashboards';",
      },
    ];

    expect(findForeignModuleImports(fixture, ['dashboards'])).toEqual([]);
  });

  it('admits a specifier that merely contains a module name as a substring', () => {
    const fixture: ScannedSource[] = [
      {
        filePath: 'dashboards/usecases/queries/read-coverage-gap.query.ts',
        source: "import { thing } from 'shared/warehouses-adjacent/thing';",
      },
    ];

    expect(findForeignModuleImports(fixture, ['warehouses'])).toEqual([]);
  });
});
