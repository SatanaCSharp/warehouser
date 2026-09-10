import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

// T13 (CH-S6) — the executable form of CR-AC-05, CR-AC-08 and CR-AC-12 for the `warehouses`
// module. It mirrors `users/module-boundaries.spec.ts`'s static-source-scan style
// (`readdirSync`/`readFileSync` + regex) rather than a runtime dependency-graph tool, since no such
// tool exists in this repo yet, and it checks the two things CR-AC-12 says a boundary spec may
// check mechanically: the **file manifest** and the **import graph**. The question
// `sad.md` §4.7 poses — *whose invariants does this file enforce?* — is deliberately NOT encoded
// here; it stays a human review test.
//
// The import rule extends `server-architecture.md` §"Dependency direction" ("modules communicate
// through exported use-case modules, explicit services, or events") with
// `adding-a-server-module.md` §8's module-private clause: another module's error factories, domain
// predicates and DTOs are reached only through an exported use-case module, never by importing
// `<module>/domain/errors/`, `<module>/domain/*.predicates.ts` or `<module>/rest/dtos/` directly.
//
// Teeth checks use **inline fixture sources**, following
// `shared/domain/repositories/repository-boundaries.spec.ts`'s precedent for a narrowed rule. A
// fixture *file* is deliberately not used: `tests/access/fixtures/authorization-coverage/` can hold
// one only because it lives outside `apps/server/src` and is read as text by `node --test`. Any
// file under `src/` is compiled by `tsc` and linted by `eslint src`, so a fixture there would make
// the deliberate violation a real import in the shipped tree — and a fixture inside `warehouses/`
// would additionally perturb the file-inventory counts this spec and others assert.

const MODULE_NAME = 'warehouses';
const moduleDirectory = import.meta.dirname;
const sourceRoot = join(import.meta.dirname, '..');
const appModulePath = join(sourceRoot, 'app.module.ts');

// The module list is exactly the directories directly under `src/`
// (adr/14-08-2026-domain-owned-flat-modules.md, §Flatness). `shared/` is explicitly *not* a module,
// so imports into it are unconstrained here, and neither is `test/`.
//
// **Read from disk, never enumerated.** A literal list silently stops policing every module added
// after it was written: this one still named five of the nine and so could not have failed on an
// import of `customers`, `customer-orders`, `items` or `purchase-drafts` — the comment above it
// claimed a completeness it did not have (2026-09-04 backend review, finding 6).
const NON_MODULE_DIRECTORIES = ['shared', 'test'];

const FEATURE_MODULES = readdirSync(sourceRoot, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && !NON_MODULE_DIRECTORIES.includes(entry.name),
  )
  .map((entry) => entry.name);

// A module contains layer directories, never another module (adding-a-server-module.md §1).
const LAYER_DIRECTORIES = ['domain', 'usecases', 'rest', 'handlers'];

// CR-AC-05 enumerates this module's contents. Holding it as a literal is what makes an added or
// removed production file fail and name itself, rather than passing silently (CR-AC-12).
const DECLARED_MANIFEST = [
  'domain/errors/warehouse.errors.ts',
  'index.ts',
  'rest/controllers/warehouse.controller.ts',
  'rest/dtos/warehouse-mutation.dto.ts',
  'rest/rest.module.ts',
  'usecases/commands/archive-warehouse.command.ts',
  'usecases/commands/create-warehouse.command.ts',
  'usecases/commands/rename-warehouse.command.ts',
  'usecases/commands/restore-warehouse.command.ts',
  // T11/AC-10 — the Warehouse's own Delivery Address: one command, one
  // accompanying Workspace-scoped read.
  'usecases/commands/set-warehouse-delivery-address.command.ts',
  'usecases/queries/list-workspace-warehouses.query.ts',
  'usecases/queries/read-warehouse-delivery-address.query.ts',
  'usecases/usecase.module.ts',
];

// The AppModule registration `WarehousesRestModule` must arrive through: the bare directory (what source
// writes under `moduleResolution: "Bundler"`), `/index`, or the `/index.js` the build emits and
// pre-Bundler source carried. All three name the barrel; a deep path such as
// `warehouses/rest/rest.module` does not, and the teeth case below holds the line. Tolerating
// all three rather than flipping to the newest is the same call `vitest.pglite.config.ts` makes
// for its `resolve.alias` entries: an anchored pattern that quietly stops matching turns a guard
// into a green no-op.
const BARREL_REGISTRATION =
  /import\s*\{[^}]*\bWarehousesRestModule\b[^}]*\}\s*from\s*['"]warehouses(?:\/index(?:\.js)?)?['"]/u;

const MODULE_PRIVATE_RULE =
  "module-private — another module's error factories, domain predicates and DTOs are reached only through an exported use-case module (adding-a-server-module.md §8, CR-AC-08)";

const PUBLIC_SURFACE_RULE =
  "not public surface — a cross-module dependency resolves through an exported NestJS module, a module barrel, or a provider that module's usecase.module.ts exports, never a deep file path (server-architecture.md §'Dependency direction', CR-AC-08)";

const toPosix = (value: string): string => value.split(sep).join('/');

/**
 * The same import in both spellings the analyzer must classify. Source is extensionless today and
 * the emitted tree carries `.js`, so a teeth check pinned to one spelling is how a guard goes
 * quiet: it keeps passing on the form it names while the other silently stops being recognised,
 * and the suite reports green over a rule that no longer holds for half the specifiers in the
 * repository. The PGlite tier's `resolve.alias` entries tolerate both for the same reason
 * (vitest.pglite.config.ts).
 */
const bothSpellings = (specifier: string): string[] => [
  specifier,
  `${specifier}.js`,
];

const collectTsFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    if (statSync(entryPath).isDirectory()) {
      return collectTsFiles(entryPath);
    }
    // Only production source is boundary-checked. `*.spec.ts` files legitimately import
    // cross-feature commands and repositories for test setup — that is test-only coupling, not the
    // production import boundary CR-AC-08 governs. This is the same production-only scope
    // `users/module-boundaries.spec.ts` and `tests/access/authorization-coverage.spec.mjs:161` use.
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts')
      ? [entryPath]
      : [];
  });

/**
 * A specifier reduced to the module path the rules below are about. An intra-application import
 * may or may not carry a `.js` extension: source is written extensionless under
 * `moduleResolution: "Bundler"` and `tsc-alias` appends the extension at build time, and a file
 * written before that switch still spells it out. Either way the extension is a spelling of the
 * resolver's rules, not of the boundary, so it is dropped before a target is classified — a
 * classifier that recognised only one spelling would stop seeing half the import graph without
 * failing anything. Failure messages still quote the specifier as written.
 */
const moduleTarget = (target: string): string => target.replace(/\.js$/u, '');

/**
 * The module-qualified target of `specifier` when it resolves into a *foreign* feature module,
 * otherwise `undefined`.
 *
 * Intra-application imports resolve through `baseUrl: ./src` (apps/server/tsconfig.json), so a
 * sibling import is a bare specifier whose first segment is that module's name. A relative
 * specifier that traverses out of this module is the same import wearing a different spelling and
 * is normalized to the same form. A scoped package subpath whose last segment happens to equal a
 * module name — `@warehouser/contracts/workspaces` — is neither, and is not a module import
 * (CR-AC-13).
 */
const foreignModuleTarget = (
  filePath: string,
  specifier: string,
): string | undefined => {
  let target: string;

  if (specifier.startsWith('.')) {
    // `filePath` is module-relative, so resolve it back to an absolute location first.
    target = toPosix(
      relative(
        sourceRoot,
        resolve(join(sourceRoot, dirname(filePath)), specifier),
      ),
    );
  } else if (specifier.startsWith('@') || specifier.startsWith('node:')) {
    return undefined;
  } else {
    target = specifier;
  }

  const normalized = moduleTarget(target);
  const [head] = normalized.split('/');

  return FEATURE_MODULES.includes(head) && head !== MODULE_NAME
    ? normalized
    : undefined;
};

const isModulePrivate = (target: string): boolean =>
  /\/domain\/errors\//u.test(target) ||
  /\/domain\/predicates\//u.test(target) ||
  target.endsWith('.predicates') ||
  /\/rest\/dtos\//u.test(target);

/** The provider names a module's `usecases/usecase.module.ts` lists in its `exports` array. */
const exportedProviders = (featureModule: string): Set<string> => {
  const modulePath = join(
    sourceRoot,
    featureModule,
    'usecases',
    'usecase.module.ts',
  );

  if (!existsSync(modulePath)) {
    return new Set();
  }

  const source = readFileSync(modulePath, 'utf8');
  const exportsBlock = /exports:\s*\[(?<providers>[^\]]*)\]/u.exec(source);

  if (exportsBlock?.groups === undefined) {
    return new Set();
  }

  const names = new Set<string>();
  const tokens = exportsBlock.groups.providers
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (!token.startsWith('...')) {
      names.add(token);
      continue;
    }

    const group = new RegExp(
      `const\\s+${token.slice(3)}\\s*=\\s*\\[(?<members>[^\\]]*)\\]`,
      'u',
    ).exec(source);

    if (group?.groups !== undefined) {
      for (const name of group.groups.members
        .split(',')
        .map((entry) => entry.trim())) {
        if (name !== '') {
          names.add(name);
        }
      }
    }
  }

  return names;
};

/**
 * `true` when `target` is part of the owning module's declared public surface: its barrel, an
 * exported NestJS module, or a provider its `usecase.module.ts` exports. The last case is what
 * CR-AC-08's "resolves through an exported `usecase.module.ts` provider" permits — NestJS requires
 * the provider class itself as the injection token, so importing that file is how a consumer names
 * a provider the sibling deliberately exported.
 */
const isPublicSurface = (target: string, importedNames: string[]): boolean => {
  const [featureModule, ...rest] = target.split('/');

  if (rest.length === 0 || target.endsWith('/index')) {
    return true;
  }

  if (target.endsWith('.module')) {
    return true;
  }

  if (rest[0] !== 'usecases') {
    return false;
  }

  const exported = exportedProviders(featureModule);

  return (
    importedNames.length > 0 &&
    importedNames.every((name) => exported.has(name))
  );
};

const namedImportsBySpecifier = (source: string): Map<string, string[]> => {
  const named = new Map<string, string[]>();

  for (const match of source.matchAll(
    /import\s+(?:type\s+)?\{(?<names>[^}]*)\}\s*from\s*['"](?<specifier>[^'"]+)['"]/gu,
  )) {
    named.set(
      match.groups?.specifier ?? '',
      (match.groups?.names ?? '')
        .split(',')
        .map((entry) =>
          entry
            .trim()
            .split(/\s+as\s+/u)[0]
            .replace(/^type\s+/u, ''),
        )
        .filter(Boolean),
    );
  }

  return named;
};

interface ScannedSource {
  readonly filePath: string;
  readonly source: string;
}

/** One message per offending import, naming the file, the import and the rule (CR-AC-12). */
const findBoundaryViolations = (sources: ScannedSource[]): string[] =>
  sources.flatMap(({ filePath, source }) => {
    const named = namedImportsBySpecifier(source);

    return [
      ...source.matchAll(/from\s*['"](?<specifier>[^'"]+)['"]/gu),
    ].flatMap((match) => {
      const specifier = match.groups?.specifier ?? '';
      {
        const target = foreignModuleTarget(filePath, specifier);

        if (target === undefined) {
          return [];
        }

        if (isModulePrivate(target)) {
          return [
            `${filePath} imports '${specifier}', which is ${MODULE_PRIVATE_RULE}`,
          ];
        }

        if (isPublicSurface(target, named.get(specifier) ?? [])) {
          return [];
        }

        return [
          `${filePath} imports '${specifier}', which is ${PUBLIC_SURFACE_RULE}`,
        ];
      }
    });
  });

describe('warehouses module boundaries', () => {
  const productionSources: ScannedSource[] = collectTsFiles(
    moduleDirectory,
  ).map((absolutePath) => ({
    filePath: toPosix(relative(sourceRoot, absolutePath)),
    source: readFileSync(absolutePath, 'utf8'),
  }));

  it('discovers at least one production source file under warehouses/', () => {
    // Guards against the scan silently passing over an empty or misnamed directory.
    expect(productionSources.length).toBeGreaterThan(0);
  });

  it('contains exactly the production files CR-AC-05 enumerates', () => {
    expect(productionSources.map(({ filePath }) => filePath).sort()).toEqual(
      DECLARED_MANIFEST.map((entry) => `${MODULE_NAME}/${entry}`).sort(),
    );
  });

  it('contains layer directories only, never a nested module', () => {
    const directories = readdirSync(moduleDirectory).filter((entry) =>
      statSync(join(moduleDirectory, entry)).isDirectory(),
    );

    expect(
      directories.filter((entry) => !LAYER_DIRECTORIES.includes(entry)),
    ).toEqual([]);
  });

  it('reaches every sibling module only through its declared public surface', () => {
    expect(findBoundaryViolations(productionSources)).toEqual([]);
  });

  it('registers WarehousesRestModule in AppModule through the module barrel', () => {
    const appModuleSource = readFileSync(appModulePath, 'utf8');

    expect(appModuleSource).toMatch(BARREL_REGISTRATION);
    // `[\s\S]*?` rather than `[^\]]*`: the imports array legitimately contains nested arrays
    // (`inject: [ConfigService]`), so a negated-`]` scan stops before reaching this module.
    expect(appModuleSource).toMatch(
      /imports:\s*\[[\s\S]*?\bWarehousesRestModule\b/u,
    );
  });

  // ---------------------------------------------------------------------------------------------
  // Teeth. A boundary that cannot fail is not a boundary (CR-AC-12): each case below feeds the
  // analyzer a deliberate violation and asserts the message names both the offending file and the
  // rule it breaks.
  //
  // Every case runs in both spellings (`bothSpellings`). A violation is a violation whether or not
  // the offender wrote `.js`, and a teeth check that names only one spelling stops testing the
  // other the moment the convention moves — which is precisely what happened when the tree went
  // extensionless: these fixtures were rewritten by the codemod and half the coverage left with
  // them, silently.
  // ---------------------------------------------------------------------------------------------

  const fixture = (source: string): ScannedSource[] => [
    {
      filePath: 'warehouses/usecases/commands/create-warehouse.command.ts',
      source,
    },
  ];

  it.each(bothSpellings('access/domain/errors/workspace-access.errors'))(
    "rejects an import of a sibling error factory ('%s'), naming the file and the rule",
    (specifier: string) => {
      const [violation, ...rest] = findBoundaryViolations(
        fixture(
          `import { workspaceReplacementRoleRequiredError } from '${specifier}';`,
        ),
      );

      expect(rest).toEqual([]);
      expect(violation).toContain(
        'warehouses/usecases/commands/create-warehouse.command.ts',
      );
      expect(violation).toContain(`'${specifier}'`);
      expect(violation).toContain('module-private');
      expect(violation).toContain('adding-a-server-module.md §8');
    },
  );

  it.each(
    bothSpellings('access/domain/predicates/workspace-authority.predicates'),
  )(
    "rejects an import of a sibling domain predicate ('%s'), naming the file and the rule",
    (specifier: string) => {
      const [violation, ...rest] = findBoundaryViolations(
        fixture(
          `import { isProtectedWorkspaceOwnerRoleKind } from '${specifier}';`,
        ),
      );

      expect(rest).toEqual([]);
      expect(violation).toContain(
        'warehouses/usecases/commands/create-warehouse.command.ts',
      );
      expect(violation).toContain(`'${specifier}'`);
      expect(violation).toContain('module-private');
    },
  );

  it.each(bothSpellings('access/rest/dtos/warehouse-membership-mutation.dto'))(
    "rejects an import of a sibling DTO ('%s'), naming the file and the rule",
    (specifier: string) => {
      const [violation, ...rest] = findBoundaryViolations(
        fixture(
          `import { WarehouseMembershipAssignmentDto } from '${specifier}';`,
        ),
      );

      expect(rest).toEqual([]);
      expect(violation).toContain(
        'warehouses/usecases/commands/create-warehouse.command.ts',
      );
      expect(violation).toContain(`'${specifier}'`);
      expect(violation).toContain('module-private');
    },
  );

  it.each(bothSpellings('../../../access/domain/errors/access.errors'))(
    "rejects a relative traversal into a sibling module ('%s')",
    (specifier: string) => {
      const [violation, ...rest] = findBoundaryViolations(
        fixture(`import { membershipRequiredError } from '${specifier}';`),
      );

      expect(rest).toEqual([]);
      expect(violation).toContain(`'${specifier}'`);
      expect(violation).toContain('module-private');
    },
  );

  it.each(bothSpellings('access/domain/services/role-deletion.service'))(
    "rejects a deep use-case import of a provider the sibling does not export ('%s')",
    (specifier: string) => {
      const [violation, ...rest] = findBoundaryViolations(
        fixture(`import { RoleDeletionService } from '${specifier}';`),
      );

      expect(rest).toEqual([]);
      expect(violation).toContain(`'${specifier}'`);
      expect(violation).toContain('not public surface');
    },
  );

  it.each([
    'warehouses/rest/rest.module',
    'warehouses/rest/rest.module.js',
    'warehouses/index/nested',
  ])('refuses %s as a barrel registration', (specifier: string) => {
    expect(`import { WarehousesRestModule } from '${specifier}';`).not.toMatch(
      BARREL_REGISTRATION,
    );
  });

  it.each(['warehouses', 'warehouses/index', 'warehouses/index.js'])(
    'accepts %s as a barrel registration',
    (specifier: string) => {
      expect(`import { WarehousesRestModule } from '${specifier}';`).toMatch(
        BARREL_REGISTRATION,
      );
    },
  );

  // The two cases below pin the rule's admitted forms, so a later tightening cannot silently make
  // the scan pass by forbidding everything (a rule that rejects legal code is as broken as one that
  // accepts illegal code).
  it.each(
    bothSpellings('access/usecases/commands/provision-initial-access.command'),
  )(
    "admits a deep import of a provider the sibling usecase module exports ('%s')",
    (specifier: string) => {
      expect(
        findBoundaryViolations(
          fixture(
            `import { ProvisionInitialAccessCommand } from '${specifier}';`,
          ),
        ),
      ).toEqual([]);
    },
  );

  // The barrel is the canonical legal spelling, and it now has three forms. Pinning only one would
  // leave `isPublicSurface` free to stop recognising the others without any case noticing.
  it.each(['access', 'access/index', 'access/index.js'])(
    "admits a sibling module barrel ('%s')",
    (specifier: string) => {
      expect(
        findBoundaryViolations(
          fixture(`import { AccessRestModule } from '${specifier}';`),
        ),
      ).toEqual([]);
    },
  );

  it('admits a published contracts subpath named for another module', () => {
    expect(
      findBoundaryViolations(
        fixture(
          "import { warehouseMembershipAssignmentSchema } from '@warehouser/contracts/workspaces';",
        ),
      ),
    ).toEqual([]);
  });
});
