import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// T13 (CH-S6) — the executable form of CR-AC-06, CR-AC-08 and CR-AC-12 for the `access` module. It
// mirrors `users/module-boundaries.spec.ts`'s static-source-scan style (`readdirSync`/`readFileSync`
// + regex) rather than a runtime dependency-graph tool, since no such tool exists in this repo yet,
// and it checks the two things CR-AC-12 says a boundary spec may check mechanically: the **file
// manifest** and the **import graph**. The question `sad.md` §4.7 poses — *whose invariants does
// this file enforce?* — is deliberately NOT encoded here; it stays a human review test.
//
// Unlike `warehouses`, this module holds no enumerated file list. CR-AC-06 is explicit that the
// `access` split "is stated as a **rule, not a count**", so pinning a literal manifest here would
// contradict the criterion it implements. The mechanical form of "contains only its own entity's
// concerns" for a module that owns one capability at two scopes is therefore structural:
//   * its directories are layer directories, never a second module keyed by scope (CR-AC-02's
//     server counterpart — "the scope appears in file and symbol names, never in a second module",
//     adding-a-server-module.md §1);
//   * its domain and use-case layers import **no** feature module at all, which is CR-AC-09's
//     "AccessUsecaseModule imports no feature module, remaining the leaf of the graph" and is what
//     forces CH-S2's error-factory move rather than a deep import back into `workspaces`.
//
// The import rule extends `server-architecture.md` §"Dependency direction" ("modules communicate
// through exported use-case modules, explicit services, or events") with
// `adding-a-server-module.md` §8's module-private clause: another module's error factories, domain
// predicates and DTOs are reached only through an exported use-case module, never by importing
// `<module>/domain/errors/`, `<module>/domain/*.predicates.ts` or `<module>/rest/dtos/` directly.
//
// `tests/access/authorization-coverage.spec.mjs:161` already asserts the narrower "access imports
// nothing from workspaces" over the same production-only scope. That rule is preserved there
// unchanged; this spec generalizes it to every sibling and every module-private surface.
//
// Teeth checks use **inline fixture sources**, following
// `shared/domain/repositories/repository-boundaries.spec.ts`'s precedent for a narrowed rule. A
// fixture *file* is deliberately not used: `tests/access/fixtures/authorization-coverage/` can hold
// one only because it lives outside `apps/server/src` and is read as text by `node --test`. Any
// file under `src/` is compiled by `tsc` and linted by `eslint src`, so a fixture there would make
// the deliberate violation a real import in the shipped tree — and a fixture inside `access/` would
// additionally perturb the file-inventory counts several other specs assert.

const MODULE_NAME = 'access';
const moduleDirectory = __dirname;
const sourceRoot = join(__dirname, '..');
const appModulePath = join(sourceRoot, 'app.module.ts');

// The module list is exactly the directories directly under `src/`
// (adr/14-08-2026-domain-owned-flat-modules.md, §Flatness). `shared/` is explicitly *not* a module,
// so imports into it are unconstrained here.
const FEATURE_MODULES = ['access', 'auth', 'users', 'warehouses', 'workspaces'];

// A module contains layer directories, never another module (adding-a-server-module.md §1).
const LAYER_DIRECTORIES = ['domain', 'usecases', 'rest', 'handlers'];

// The layers that must stay free of *any* feature-module dependency. `rest/` is excluded because a
// transport adapter legitimately imports `auth`'s exported `AuthModule` to register its guards, and
// registering a guard is not owning it (adr/14-08-2026-domain-owned-flat-modules.md, §"What is not
// a module").
const LEAF_LAYERS = ['domain', 'usecases'];

const MODULE_PRIVATE_RULE =
  "module-private — another module's error factories, domain predicates and DTOs are reached only through an exported use-case module (adding-a-server-module.md §8, CR-AC-08)";

const PUBLIC_SURFACE_RULE =
  "not public surface — a cross-module dependency resolves through an exported NestJS module, a module barrel, or a provider that module's usecase.module.ts exports, never a deep file path (server-architecture.md §'Dependency direction', CR-AC-08)";

const LEAF_RULE =
  'a feature-module dependency in access/domain or access/usecases — the access use-case layer imports no feature module and stays the leaf of the graph (CR-AC-09, CR-AC-06)';

const toPosix = (value: string): string => value.split(sep).join('/');

const collectTsFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    if (statSync(entryPath).isDirectory()) {
      return collectTsFiles(entryPath);
    }
    // Only production source is boundary-checked. `*.spec.ts` files legitimately import
    // cross-feature commands and repositories for test setup — that is test-only coupling, not the
    // production import boundary CR-AC-08 governs. This is the same production-only scope
    // `users/module-boundaries.spec.ts` and `tests/access/authorization-coverage.spec.mjs:161` use,
    // which CR-AC-06 requires CH-S6 to preserve.
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts')
      ? [entryPath]
      : [];
  });

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

  const [head] = target.split('/');

  return FEATURE_MODULES.includes(head) && head !== MODULE_NAME
    ? target
    : undefined;
};

const isModulePrivate = (target: string): boolean =>
  /\/domain\/errors\//u.test(target) ||
  /\/domain\/predicates\//u.test(target) ||
  /\.predicates$/u.test(target) ||
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

/** One message per feature-module import found in a layer that must import none (CR-AC-09). */
const findLeafViolations = (sources: ScannedSource[]): string[] =>
  sources
    .filter(({ filePath }) =>
      LEAF_LAYERS.some((layer) =>
        filePath.startsWith(`${MODULE_NAME}/${layer}/`),
      ),
    )
    .flatMap(({ filePath, source }) =>
      [...source.matchAll(/from\s*['"](?<specifier>[^'"]+)['"]/gu)].flatMap(
        (match) => {
          const specifier = match.groups?.specifier ?? '';

          return foreignModuleTarget(filePath, specifier) === undefined
            ? []
            : [`${filePath} imports '${specifier}', which is ${LEAF_RULE}`];
        },
      ),
    );

describe('access module boundaries', () => {
  const productionSources: ScannedSource[] = collectTsFiles(
    moduleDirectory,
  ).map((absolutePath) => ({
    filePath: toPosix(relative(sourceRoot, absolutePath)),
    source: readFileSync(absolutePath, 'utf8'),
  }));

  it('discovers at least one production source file under access/', () => {
    // Guards against the scan silently passing over an empty or misnamed directory.
    expect(productionSources.length).toBeGreaterThan(0);
  });

  it('contains layer directories only, never a second module keyed by scope', () => {
    const directories = readdirSync(moduleDirectory).filter((entry) =>
      statSync(join(moduleDirectory, entry)).isDirectory(),
    );

    expect(
      directories.filter((entry) => !LAYER_DIRECTORIES.includes(entry)),
    ).toEqual([]);
  });

  it('carries both scopes in one module, distinguished by file name', () => {
    // CR-AC-06/CR-AC-02: the scope is a name, not a second module. Asserting that both scopes'
    // use cases sit as siblings in one directory is the file-manifest form of that rule, and does
    // not pin a count the criterion deliberately leaves open.
    const commandDirectory = join(moduleDirectory, 'usecases', 'commands');
    const commands = readdirSync(commandDirectory).filter(
      (entry) => entry.endsWith('.command.ts') && !entry.endsWith('.spec.ts'),
    );

    expect(commands).toEqual(
      expect.arrayContaining([
        'assign-member-role.command.ts',
        'assign-workspace-role.command.ts',
        'assign-warehouse-membership.command.ts',
        'revoke-warehouse-membership.command.ts',
      ]),
    );
  });

  it('reaches every sibling module only through its declared public surface', () => {
    expect(findBoundaryViolations(productionSources)).toEqual([]);
  });

  it('keeps its domain and use-case layers free of every feature module', () => {
    expect(findLeafViolations(productionSources)).toEqual([]);
  });

  it('registers AccessRestModule in AppModule through the module barrel', () => {
    const appModuleSource = readFileSync(appModulePath, 'utf8');

    expect(appModuleSource).toMatch(
      /import\s*\{[^}]*\bAccessRestModule\b[^}]*\}\s*from\s*['"]access['"]/u,
    );
    // `[\s\S]*?` rather than `[^\]]*`: the imports array legitimately contains nested arrays
    // (`inject: [ConfigService]`), so a negated-`]` scan stops before reaching this module.
    expect(appModuleSource).toMatch(
      /imports:\s*\[[\s\S]*?\bAccessRestModule\b/u,
    );
  });

  // ---------------------------------------------------------------------------------------------
  // Teeth. A boundary that cannot fail is not a boundary (CR-AC-12): each case below feeds the
  // analyzer a deliberate violation and asserts the message names both the offending file and the
  // rule it breaks.
  // ---------------------------------------------------------------------------------------------

  const fixture = (source: string): ScannedSource[] => [
    {
      filePath: 'access/usecases/commands/assign-workspace-role.command.ts',
      source,
    },
  ];

  it('rejects an import of a sibling error factory, naming the file and the rule', () => {
    const [violation, ...rest] = findBoundaryViolations(
      fixture(
        "import { workspaceWarehouseArchivedError } from 'workspaces/domain/errors/workspace.errors';",
      ),
    );

    expect(rest).toEqual([]);
    expect(violation).toContain(
      'access/usecases/commands/assign-workspace-role.command.ts',
    );
    expect(violation).toContain("'workspaces/domain/errors/workspace.errors'");
    expect(violation).toContain('module-private');
    expect(violation).toContain('adding-a-server-module.md §8');
  });

  it('rejects an import of a sibling domain predicate, naming the file and the rule', () => {
    const [violation, ...rest] = findBoundaryViolations(
      fixture(
        "import { isMemberOfWarehouse } from 'users/domain/predicates/member-lifecycle.predicates';",
      ),
    );

    expect(rest).toEqual([]);
    expect(violation).toContain(
      'access/usecases/commands/assign-workspace-role.command.ts',
    );
    expect(violation).toContain(
      "'users/domain/predicates/member-lifecycle.predicates'",
    );
    expect(violation).toContain('module-private');
  });

  it('rejects an import of a sibling DTO, naming the file and the rule', () => {
    const [violation, ...rest] = findBoundaryViolations(
      fixture(
        "import { WarehouseMutationDto } from 'warehouses/rest/dtos/warehouse-mutation.dto';",
      ),
    );

    expect(rest).toEqual([]);
    expect(violation).toContain(
      'access/usecases/commands/assign-workspace-role.command.ts',
    );
    expect(violation).toContain(
      "'warehouses/rest/dtos/warehouse-mutation.dto'",
    );
    expect(violation).toContain('module-private');
  });

  it('rejects a relative traversal into a sibling module', () => {
    const [violation, ...rest] = findBoundaryViolations(
      fixture(
        "import { workspaceWarehouseArchivedError } from '../../../workspaces/domain/errors/workspace.errors';",
      ),
    );

    expect(rest).toEqual([]);
    expect(violation).toContain(
      "'../../../workspaces/domain/errors/workspace.errors'",
    );
    expect(violation).toContain('module-private');
  });

  it('rejects a deep import of a sibling domain service', () => {
    const [violation, ...rest] = findBoundaryViolations(
      fixture(
        "import { WorkspaceProvisioningService } from 'workspaces/domain/services/workspace-provisioning.service';",
      ),
    );

    expect(rest).toEqual([]);
    expect(violation).toContain(
      "'workspaces/domain/services/workspace-provisioning.service'",
    );
    expect(violation).toContain('not public surface');
  });

  it('rejects a feature-module dependency reaching the access use-case layer', () => {
    const [violation, ...rest] = findLeafViolations(
      fixture(
        "import { WarehousesUsecaseModule } from 'warehouses/usecases/usecase.module';",
      ),
    );

    expect(rest).toEqual([]);
    expect(violation).toContain(
      'access/usecases/commands/assign-workspace-role.command.ts',
    );
    expect(violation).toContain('stays the leaf of the graph');
  });

  // The two cases below pin the rule's admitted forms, so a later tightening cannot silently make
  // the scan pass by forbidding everything (a rule that rejects legal code is as broken as one that
  // accepts illegal code).
  it('admits the exported auth module a transport adapter registers guards from', () => {
    expect(
      findBoundaryViolations([
        {
          filePath: 'access/rest/rest.module.ts',
          source: "import { AuthModule } from 'auth/auth.module';",
        },
      ]),
    ).toEqual([]);
  });

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
