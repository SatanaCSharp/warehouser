import { readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// No single file owns this: the subject is every namespace file under
// `public/locales/<language>/`, and the fact it establishes is one no owner
// can assert about itself (`placing-web-tests.md` §3).
//
// It exists because the parity gate in `src/i18n.spec.ts` structurally cannot
// see a duplicate key. That spec compares *parsed* resources, and `JSON.parse`
// keeps only the last occurrence of a repeated key — so a namespace carrying
// the same key twice parses to the same object as one carrying it once, and
// every key-set and value comparison passes. The duplicate is only visible in
// the file's text, which is what this gate reads.
//
// A duplicate is never harmless: the later occurrence silently wins, so an
// edit to the earlier one has no effect and a reviewer reading either copy
// cannot tell which is live.

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);
const LOCALES_DIRECTORY = posix.join(
  posix.dirname(SRC_DIRECTORY),
  'public',
  'locales',
);

type DuplicateKey = { file: string; key: string; path: string };

/**
 * Every key that appears more than once inside the same JSON object, found by
 * walking the raw text — `JSON.parse` cannot report this because it collapses
 * a repeated key into its last value.
 */
/** Where the JSON string literal starting at `start` ends, honouring escapes. */
const endOfString = (text: string, start: number): number => {
  let end = start + 1;
  while (end < text.length && text[end] !== '"') {
    end += text[end] === '\\' ? 2 : 1;
  }
  return end;
};

/** The first index at or after `from` that is not whitespace. */
const skipSpace = (text: string, from: number): number => {
  let index = from;
  while (index < text.length && /\s/u.test(text[index] ?? '')) {
    index += 1;
  }
  return index;
};

/**
 * Every key that appears more than once inside the same JSON object, found by
 * walking the raw text — `JSON.parse` cannot report this because it collapses
 * a repeated key into its last value.
 */
const duplicateKeysIn = (file: string, text: string): DuplicateKey[] => {
  const duplicates: DuplicateKey[] = [];
  const seen: Set<string>[] = [];
  const path: string[] = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (character === '{') {
      seen.push(new Set<string>());
      index += 1;
      continue;
    }

    if (character === '}') {
      seen.pop();
      path.pop();
      index += 1;
      continue;
    }

    if (character !== '"') {
      index += 1;
      continue;
    }

    const end = endOfString(text, index);
    const literal = text.slice(index + 1, end);
    const after = skipSpace(text, end + 1);

    // A string is a key only when a `:` follows it; anything else is a value.
    if (text[after] === ':') {
      const scope = seen.at(-1);
      if (scope?.has(literal) === true) {
        duplicates.push({
          file,
          key: literal,
          path: [...path.slice(0, seen.length - 1), literal].join('.'),
        });
      }
      scope?.add(literal);
      path[seen.length - 1] = literal;
    }

    index = after;
  }

  return duplicates;
};

const localeFiles = readdirSync(LOCALES_DIRECTORY).flatMap((language) =>
  readdirSync(posix.join(LOCALES_DIRECTORY, language)).map((namespace) => ({
    label: `${language}/${namespace}`,
    path: posix.join(LOCALES_DIRECTORY, language, namespace),
  })),
);

describe('locale namespace files', () => {
  it('reads every namespace file in every language', () => {
    expect(localeFiles.length).toBeGreaterThan(0);
  });

  it('declares each key at most once per object, in every language', () => {
    const duplicates = localeFiles.flatMap(({ label, path }) =>
      duplicateKeysIn(label, readFileSync(path, 'utf8')),
    );

    expect(duplicates).toEqual([]);
  });

  it('detects a duplicate when one is present — the control that keeps the gate honest', () => {
    const contrived = '{ "a": { "b": 1, "c": 2, "b": 3 } }';

    expect(duplicateKeysIn('contrived.json', contrived)).toEqual([
      { file: 'contrived.json', key: 'b', path: 'a.b' },
    ]);
  });
});
