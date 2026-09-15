import { globSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The Warehouse a screen operates on is its address, not ambient state.
 * `effectiveWarehouseId` is the stored selection — where the actor has been,
 * not what they may see or do. Every reader beyond the three allowlisted below
 * would be a route back to the cross-Warehouse leak the workspace-warehouse
 * change request removes. See `docs/change-requests/workspace-warehouse/spec.md`
 * CR-AC-06/CR-AC-09 and `sad.md` §4/§5.
 *
 * **Why this is a spec and not a lint rule.** It was a `no-restricted-syntax`
 * entry in `eslint.config.mjs` until the repository moved from ESLint to
 * oxlint, which does not implement that rule. Porting it here rather than into
 * an oxlint JS plugin is the stronger choice on its own merits: a spec cannot
 * be silenced with an inline disable comment, and a control cited by an
 * acceptance criterion should fail the test suite rather than a linter that a
 * reviewer can wave through.
 *
 * **Why no file owns it.** The subject is the arrangement of the whole source
 * tree — the claim is about every file under `src/`, including files written
 * after this one — so no colocated spec could fail when a *new* screen reaches
 * for the stored selection (`placing-web-tests.md` §3, "Structural gates").
 *
 * **Why this spec drives the matcher on synthetic sources.** A pattern-shaped
 * gate that only ever runs against a corpus with no violations is
 * unfalsifiable from its own output: a broken pattern and a correct one both
 * report nothing. `restrictedReadsIn` therefore takes an injected
 * `{ file, source }` pair, so the teeth cases below drive the **same function**
 * the real-corpus test uses.
 */

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);

const RESTRICTED = 'effectiveWarehouseId';

/**
 * The three readers the change request admits. `landing.guard.ts` resolves the
 * retained selection on entry, `RetainedContextMessage.tsx` tells the actor
 * where they left off, and `useRecordWarehouseEntry.ts` writes the selection.
 * Nothing else may read it.
 */
const ALLOWED_READERS = [
  'guards/landing.guard.ts',
  'shared/components/RetainedContextMessage.tsx',
  'modules/warehouse/hooks/effects/useRecordWarehouseEntry.ts',
] as const;

/** Production web sources: the tree minus its own tests and test support. */
const productionFiles = (): string[] =>
  globSync('**/*.{ts,tsx}', { cwd: SRC_DIRECTORY })
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => !/\.spec\.tsx?$/u.test(entry))
    .filter((entry) => !entry.startsWith('test/'))
    .filter(
      (entry) =>
        !ALLOWED_READERS.includes(entry as (typeof ALLOWED_READERS)[number]),
    )
    .sort();

/** A source with its comments removed, so prose can neither fail nor excuse. */
const codeOf = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(?<keep>^|[^:])\/\/[^\n]*/gu, '$<keep>');

/**
 * Every reference to the restricted name, however it is spelled.
 *
 * The ESLint rule this replaces needed two selectors, and the second is the
 * one worth keeping: `ctx['effectiveWarehouseId']` parses as a string literal
 * rather than an identifier, so a selector matching only identifiers is
 * bypassable by writing the property as a string — which would read exactly
 * like the reference it forbids. A word-boundary match over the comment-free
 * source catches both spellings at once, and cannot be spelled around.
 */
const restrictedReadsIn = ({
  file,
  source,
}: {
  file: string;
  source: string;
}): string[] => {
  const matches = codeOf(source).match(new RegExp(`\\b${RESTRICTED}\\b`, 'gu'));

  return matches === null ? [] : [file];
};

describe('effectiveWarehouseId is restricted to its allowlisted readers', () => {
  it('is read by no production file outside the allowlist', () => {
    const offenders = productionFiles().flatMap((file) =>
      restrictedReadsIn({
        file,
        source: readFileSync(posix.join(SRC_DIRECTORY, file), 'utf8'),
      }),
    );

    expect(offenders).toEqual([]);
  });

  it('still admits all three allowlisted readers', () => {
    const missing = ALLOWED_READERS.filter((reader) => {
      const source = readFileSync(posix.join(SRC_DIRECTORY, reader), 'utf8');

      return restrictedReadsIn({ file: reader, source }).length === 0;
    });

    expect(missing).toEqual([]);
  });

  it('catches a plain identifier read', () => {
    expect(
      restrictedReadsIn({
        file: 'modules/thing/Thing.tsx',
        source: 'const id = selection.effectiveWarehouseId;',
      }),
    ).toEqual(['modules/thing/Thing.tsx']);
  });

  it('catches the string-key spelling a selector-based rule would miss', () => {
    expect(
      restrictedReadsIn({
        file: 'modules/thing/Thing.tsx',
        source: "const id = ctx['effectiveWarehouseId'];",
      }),
    ).toEqual(['modules/thing/Thing.tsx']);
  });

  it('does not fire on a mention in a comment', () => {
    expect(
      restrictedReadsIn({
        file: 'modules/thing/Thing.tsx',
        source:
          '// effectiveWarehouseId is deliberately not read here\nconst id = route.warehouseId;',
      }),
    ).toEqual([]);
  });

  it('does not fire on an unrelated name that merely contains it', () => {
    expect(
      restrictedReadsIn({
        file: 'modules/thing/Thing.tsx',
        source: 'const x = row.effectiveWarehouseIdentifier;',
      }),
    ).toEqual([]);
  });
});
