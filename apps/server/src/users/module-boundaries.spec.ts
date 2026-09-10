import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// T13 DoD: "users imports no `access/*` or `auth/*` feature-owned file" and
// "`UsersModule` is registered in `AppModule`". This mirrors
// `shared/domain/repositories/repository-boundaries.spec.ts`'s static-source-
// scan style (`readdirSync`/`readFileSync` + regex) rather than a runtime
// dependency-graph tool, since no such tool exists in this repo yet.

const usersDirectory = import.meta.dirname;
const appModulePath = join(import.meta.dirname, '../app.module.ts');

// CR-AC-08: "`apps/server/src/users/**` production code imports nothing from
// `access`, `auth`, `warehouses` or `workspaces`". The first two were already
// asserted here; `warehouses` and `workspaces` are a **new** constraint this
// change request adds (CH-S6) — a tightening of the list, never a relaxation of
// the rule, which keeps its original shape: a bare specifier naming a sibling
// module, since intra-application imports resolve through `baseUrl: ./src`.
const FORBIDDEN_MODULES = ['access', 'auth', 'warehouses', 'workspaces'];

// A trailing `/` alone no longer spells every reach into the module. Under
// `moduleResolution: "Bundler"` a barrel import is the bare directory name —
// `from 'access'`, where it used to be `from 'access/index.js'` — so the
// closing quote has to count as a terminator too, or the single most likely
// violation walks straight past a pattern that still reports green on every
// other spelling. That is the same silent-anchor failure the PGlite tier's
// `resolve.alias` entries guard against by accepting the specifier with or
// without its `.js` (vitest.pglite.config.ts).
//
// The extension itself needs no clause: `access/domain/errors/x.js` and
// `access/domain/errors/x` both match on the `/` after the module name.
// The relative traversal `../../access/...` is the same import wearing another
// spelling and is caught alongside the bare one, matching
// `customers/module-boundaries.spec.ts`'s pattern.
const forbiddenImportPattern = (featureModule: string): RegExp =>
  new RegExp(`from\\s+['"](?:\\.\\./)*${featureModule}(?:/|['"])`, 'u');

const collectTsFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    if (statSync(entryPath).isDirectory()) {
      return collectTsFiles(entryPath);
    }
    // Only production source is boundary-checked here. `*.spec.ts` files
    // (including `*.integration.spec.ts`) legitimately import cross-feature
    // commands/repositories for test setup/fixtures (e.g. AC-15's race test
    // exercises `access`'s own `TransferWarehouseManagerCommand` against a
    // concurrent `DeleteMemberCommand`) — that is test-only coupling, not the
    // production import boundary this DoD item targets.
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts')
      ? [entryPath]
      : [];
  });

describe('users module boundaries', () => {
  const usersSources = collectTsFiles(usersDirectory).map((filePath) => ({
    filePath,
    source: readFileSync(filePath, 'utf8'),
  }));

  it('discovers at least one source file under users/', () => {
    // Guards against the scan silently passing over an empty/misnamed
    // directory once UsersController/UsersModule exist.
    expect(usersSources.length).toBeGreaterThan(0);
  });

  it.each(usersSources)(
    '$filePath imports no access/*, auth/*, warehouses/* or workspaces/* feature-owned file',
    ({ source }) => {
      for (const featureModule of FORBIDDEN_MODULES) {
        expect(source).not.toMatch(forbiddenImportPattern(featureModule));
      }
    },
  );

  // Teeth. The list above only means something if every entry rejects — and the
  // two entries CH-S6 adds have no offending file in the tree today, so without
  // this case a typo in either would pass unnoticed (CR-AC-12).
  //
  // Each entry is exercised in every spelling the reach can wear: a deep path
  // with and without the `.js` the build appends, the bare barrel, the barrel's
  // explicit `/index` forms, and a relative traversal. One spelling passing is
  // not evidence the others do — the bare barrel in particular was invisible to
  // this pattern until it was widened above.
  const spellings = (featureModule: string): string[] => [
    `${featureModule}/domain/errors/some.errors`,
    `${featureModule}/domain/errors/some.errors.js`,
    featureModule,
    `${featureModule}/index`,
    `${featureModule}/index.js`,
    `../../${featureModule}/domain/errors/some.errors`,
  ];

  it.each(
    FORBIDDEN_MODULES.flatMap((featureModule) =>
      spellings(featureModule).map(
        (specifier) => [featureModule, specifier] as const,
      ),
    ),
  )(
    "rejects a users file that imports %s as '%s'",
    (featureModule, specifier) => {
      const offending = `import { something } from '${specifier}';`;

      expect(offending).toMatch(forbiddenImportPattern(featureModule));
    },
  );

  // …and still discriminates. A pattern that matched everything would satisfy
  // every case above while policing nothing.
  it.each(FORBIDDEN_MODULES)(
    'admits a specifier that merely contains %s',
    (featureModule) => {
      expect(
        `import { something } from 'shared/${featureModule}/some-helper';`,
      ).not.toMatch(forbiddenImportPattern(featureModule));
      expect(
        `import { something } from '@warehouser/contracts/${featureModule}';`,
      ).not.toMatch(forbiddenImportPattern(featureModule));
      expect(
        `import { something } from '${featureModule}-adjacent/thing';`,
      ).not.toMatch(forbiddenImportPattern(featureModule));
    },
  );

  it('registers UsersModule in AppModule', () => {
    const appModuleSource = readFileSync(appModulePath, 'utf8');
    // Two legal specifiers — the module barrel and the module file itself — each in the spellings
    // the tree admits: bare (`moduleResolution: "Bundler"` writes no extension), and with the `.js`
    // the build emits and pre-Bundler source carried. Tolerating both is the point: the previous
    // pattern named only `.js` and so stopped matching the day the tree became extensionless,
    // which a `toMatch` reports as a failure but a `not.toMatch` would have reported as green
    // forever. The alternation is also fully bracketed now; before, its second branch matched a
    // bare `from 'users/users.module.js'` with no `UsersModule` in it at all.
    expect(appModuleSource).toMatch(
      /import\s*\{[^}]*\bUsersModule\b[^}]*\}\s*from\s*['"]users(?:\/(?:index|users\.module)(?:\.js)?)?['"]/u,
    );
    expect(appModuleSource).toMatch(/imports:\s*\[[^\]]*\bUsersModule\b/su);
  });
});
