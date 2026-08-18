import { existsSync, globSync, readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Dirent } from 'node:fs';

// The static layout guard over `shared/api` (refactor-warehouse-components
// CR-AC-05). It encodes the tree fixed by that request's `sad.md` §5.5: seven
// modules and two colocated specs, filed under four directories that each name
// the domain their contents address, with nothing left at the root.
//
// Style follows the repository's existing enforcement pattern — a static source
// scan (`globSync`/`readFileSync` + regex), as in
// `apps/web/src/modules/module-boundaries.spec.ts` — rather than a dependency
// graph tool or an ESLint plugin, neither of which this repository has.
//
// PLACEMENT — this spec sits at `shared/`, one level above the tree it scans,
// because CR-AC-05 requires the `shared/api` root to hold directories only. A
// guard filed at that root would have to exempt itself, and an exemption is the
// one thing the criterion does not admit.
//
// A directory names the domain its contents address, not the module that
// renders them, per
// `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`
// § "A name states the domain addressed" — which is why `warehouse/` holds a
// single path builder rather than being folded into `client/`.

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(fileURLToPath(import.meta.url)),
);
const API_DIRECTORY = posix.join(SRC_DIRECTORY, 'shared/api');

/** `sad.md` §5.5's tree: every file `shared/api` may hold, and where. */
const API_LAYOUT: Readonly<Record<string, readonly string[]>> = {
  access: ['access-permissions-api.spec.ts', 'access-permissions-api.ts'],
  client: ['api-client.ts', 'mutation-outcome.ts'],
  warehouse: ['warehouse-path.ts'],
  workspace: [
    'workspace-context-api.spec.ts',
    'workspace-context-api.ts',
    'workspace-mutation.ts',
    'workspace-users-api.ts',
  ],
};

const API_DOMAINS = Object.keys(API_LAYOUT).sort();

const IMPORT_SPECIFIER =
  /(?:from|import)\s*\(?\s*['"](?<specifier>[^'"]+)['"]\s*\)?/gu;

const entriesOf = (directory: string): Dirent[] =>
  readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

/** Every source file under `apps/web/src`, relative to `src`, specs included. */
const sourceFiles = (): string[] =>
  globSync('**/*.{ts,tsx}', { cwd: SRC_DIRECTORY })
    .map((entry) => entry.split('\\').join('/'))
    .sort();

/**
 * Rewrites an import specifier to the `shared/api/...` form the layout uses:
 * extensionless, and with relative traversals resolved against the importer.
 * Web imports resolve through `baseUrl: ./src`, so a bare specifier is already
 * canonical. Returns `null` for a specifier that does not name `shared/api`.
 */
const apiTarget = (importer: string, specifier: string): string | null => {
  const resolved = specifier.startsWith('.')
    ? posix.normalize(posix.join(posix.dirname(importer), specifier))
    : specifier;
  const target = resolved.replace(/\.(?:tsx?|jsx?)$/u, '');

  return target.startsWith('shared/api/') ? target : null;
};

const apiImports = (): { importer: string; target: string }[] =>
  sourceFiles().flatMap((importer) => {
    const source = readFileSync(posix.join(SRC_DIRECTORY, importer), 'utf8');

    return [...source.matchAll(IMPORT_SPECIFIER)].flatMap((match) => {
      const target = apiTarget(importer, match.groups?.specifier ?? '');

      return target === null ? [] : [{ importer, target }];
    });
  });

describe('the shared/api layout (CR-AC-05)', () => {
  it('holds exactly the four domain directories and nothing else at its root', () => {
    const entries = entriesOf(API_DIRECTORY);

    expect(
      entries
        .filter((entry) => !entry.isDirectory())
        .map((entry) => entry.name),
    ).toEqual([]);
    expect(entries.map((entry) => entry.name)).toEqual(API_DOMAINS);
  });

  it.each(API_DOMAINS)('files %s with exactly its own modules', (domain) => {
    const entries = entriesOf(posix.join(API_DIRECTORY, domain));

    expect(entries.every((entry) => entry.isFile())).toBe(true);
    expect(entries.map((entry) => entry.name)).toEqual(API_LAYOUT[domain]);
  });

  it('resolves every importer through a domain-directory path', () => {
    const unresolved = apiImports().filter(
      ({ target }) =>
        !API_DOMAINS.includes(target.split('/')[2]) ||
        !existsSync(posix.join(SRC_DIRECTORY, `${target}.ts`)),
    );

    expect(
      unresolved.map(({ importer, target }) => `${importer} -> ${target}`),
    ).toEqual([]);
  });
});
