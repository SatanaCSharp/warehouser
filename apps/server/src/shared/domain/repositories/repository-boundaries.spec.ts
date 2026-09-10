import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryDirectory = __dirname;
const commandDirectory = join(__dirname, '../../../access/usecases/commands');
const sourceRoot = join(__dirname, '../../..');

// Not a module: `shared/` holds the pure fabrications and `test/` the reusable test support
// (server-architecture.md §"Source structure").
const NON_MODULE_DIRECTORIES = ['shared', 'test'];

describe('shared repository boundaries', () => {
  const repositorySources = readdirSync(repositoryDirectory)
    .filter((fileName) => fileName.endsWith('.repository.ts'))
    .map((fileName) => ({
      fileName,
      source: readFileSync(join(repositoryDirectory, fileName), 'utf8'),
    }));

  it.each(repositorySources)(
    '$fileName uses TypeORM APIs instead of raw queries',
    ({ source }) => {
      expect(source).not.toMatch(/\.query\s*(?:<[^;]+?>)?\s*\(/su);
    },
  );

  // code-review-back-end-2026-09-09.md — a redaction selector must not be defaultable.
  // guides/server-request-authorization.md §"Consume the observed set in the projection" requires the
  // withheld form to be built "by **not selecting** the withheld columns", so the parameter deciding
  // that is the whole mechanism: given a default, a caller that forgets it selects everything the
  // Permission was meant to withhold, and forgetting fails **open**. Required, a caller must state
  // the choice and the compiler proves every one of them did.
  it.each(repositorySources)(
    '$fileName gives no projection selector a default value',
    ({ source }) => {
      expect(source).not.toMatch(/:\s*RejectionCauseProjection\s*=/u);
    },
  );

  it.each(repositorySources)(
    '$fileName leaves exception translation outside persistence',
    ({ source }) => {
      expect(source).not.toMatch(/\btry\s*\{/u);
      expect(source).not.toMatch(/\bcatch\s*\(/u);
    },
  );

  // CR-AC-08, third clause: "no file under `shared/domain/repositories/` imports a feature module".
  // This is the rule `server-architecture.md` §"Dependency direction" states as "shared repositories
  // never depend on dedicated feature modules" and `creating-a-server-repository.md` restates as
  // "must not import from or otherwise know about a dedicated feature module". It had no executable
  // form before CH-S6; adding it is a tightening, and it touches none of the rules above.
  //
  // Both spellings of the dependency are caught: a bare specifier (intra-application imports resolve
  // through `baseUrl: ./src`) and a relative traversal out of `shared/` into a module. A scoped
  // package subpath whose last segment happens to name a module — `@warehouser/contracts/workspaces`
  // — is neither, and is not a module import (CR-AC-13).
  //
  // **Read from disk, never enumerated.** The literal this replaces named eight of the nine modules
  // and omitted `purchase-drafts`, so a shared repository importing it would have passed silently —
  // and the omission survived the very change that edited the list to add `customers`
  // (2026-09-04 backend review, finding 7).
  const FEATURE_MODULES = readdirSync(sourceRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && !NON_MODULE_DIRECTORIES.includes(entry.name),
    )
    .map((entry) => entry.name);

  // `creating-a-server-repository.md` § "Keep repositories isolated and operation-oriented":
  // "Repository classes must not contain private methods. If persistence logic is reusable, make it
  // a meaningful public operation." `server-architecture.md` § Domain restates it. Like the
  // feature-import rule above it had no executable form; T7's Definition of Done requires one, and
  // it is a tightening that changes none of the rules beside it.
  //
  // The constructor's `private readonly` parameter properties are dependency injection, not
  // methods, so the pattern requires the parenthesis of a method signature and not a property.
  const privateMethodPattern =
    /^\s*(?:private|protected)\s+(?!readonly\b)[\w$]+\s*(?:<[^>]*>)?\s*\(/mu;

  it.each(repositorySources)(
    '$fileName declares no private method',
    ({ source }) => {
      expect(source).not.toMatch(privateMethodPattern);
    },
  );

  it('still rejects a repository that hides persistence logic behind a private method', () => {
    expect('  private buildQuery(alias: string) {').toMatch(
      privateMethodPattern,
    );
    expect('  private readonly dataSource: DataSource;').not.toMatch(
      privateMethodPattern,
    );
  });

  const featureModuleImportPattern = (featureModule: string): RegExp =>
    new RegExp(`from\\s+['"](?:\\.\\.\\/)*${featureModule}\\/`, 'u');

  it.each(repositorySources)(
    '$fileName imports no feature module',
    ({ source }) => {
      for (const featureModule of FEATURE_MODULES) {
        expect(source).not.toMatch(featureModuleImportPattern(featureModule));
      }
    },
  );

  it.each(FEATURE_MODULES)(
    'rejects a repository that imports from %s/',
    (featureModule) => {
      expect(
        `import { Thing } from '${featureModule}/domain/errors/some.errors';`,
      ).toMatch(featureModuleImportPattern(featureModule));
      expect(
        `import { Thing } from '../../../${featureModule}/domain/errors/some.errors';`,
      ).toMatch(featureModuleImportPattern(featureModule));
    },
  );

  const commandSources = readdirSync(commandDirectory)
    .filter((fileName) => fileName.endsWith('.command.ts'))
    .map((fileName) => ({
      fileName,
      source: readFileSync(join(commandDirectory, fileName), 'utf8'),
    }));

  // Returns the body of every `try` block in `source` that awaits inside itself.
  //
  // What this rule protects against is a command swallowing or re-classifying a failure that the
  // global exception filter is the single boundary for — which in practice means wrapping an
  // awaited call: persistence, another use case, an infrastructure adapter. It is deliberately NOT
  // a textual ban on the `try` token. A synchronous value-object translation —
  // `try { return AccessName.create(input).value } catch (e) { if (e instanceof AssertionError)
  // throw typedError(rule); throw e }` — does exactly what the assertion name asks: it converts an
  // AssertionError that would surface as a 500 into a typed ApplicationError the filter renders as
  // a code-specific 4xx, and re-throws everything else untouched. server-error-handling.md §5
  // classifies that as naming a known condition, and apps/server/AGENTS.md bans "routine" try/catch
  // in controllers and endpoint handlers, not this. The same idiom already lives in
  // create-warehouse, rename-workspace and register commands.
  const awaitingTryBlocks = (source: string): string[] => {
    const blocks: string[] = [];
    const pattern = /\btry\s*\{/gu;

    for (const match of source.matchAll(pattern)) {
      let depth = 0;
      let cursor = match.index + match[0].length - 1;

      while (cursor < source.length) {
        if (source[cursor] === '{') {
          depth += 1;
        } else if (source[cursor] === '}') {
          depth -= 1;
          if (depth === 0) {
            break;
          }
        }
        cursor += 1;
      }

      const body = source.slice(match.index, cursor + 1);
      if (/\bawait\b/u.test(body)) {
        blocks.push(body);
      }
    }

    return blocks;
  };

  it.each(commandSources)(
    '$fileName delegates exception handling to the global filter',
    ({ source }) => {
      expect(awaitingTryBlocks(source)).toEqual([]);
    },
  );

  // The rule above is narrower than a token ban, so it carries its own teeth check. Inline sources
  // rather than fixture files: a real file under access/usecases/commands/ would change the
  // file-inventory counts several other specs assert.
  it('still rejects a command that wraps an awaited call in try/catch', () => {
    const offending = `
      async execute(input: Input): Promise<void> {
        try {
          await this.repository.persist(input);
        } catch (cause) {
          throw unavailableError(cause);
        }
      }
    `;

    expect(awaitingTryBlocks(offending)).toHaveLength(1);
  });

  it('admits a synchronous value-object translation', () => {
    const permitted = `
      export const validateName = (input: string): string => {
        try {
          return AccessName.create(input).value;
        } catch (error) {
          if (error instanceof AssertionError) {
            throw invalidNameError(RULE_BY_MESSAGE[error.message] ?? 'invalid');
          }
          throw error;
        }
      };
    `;

    expect(awaitingTryBlocks(permitted)).toEqual([]);
  });
});
