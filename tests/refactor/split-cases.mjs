import { readFileSync } from 'node:fs';

// Static extraction of the `it` / `test` case names declared by a spec file
// (docs/change-requests/modules-level-refactor/spec.md CR-RG-01: "the four specs whose subject
// splits … split without losing a single case: the union of the cases after equals the set
// before"). Like `tests/access/authorization-coverage-classifier.mjs`, this reads source text — it
// never imports the spec, so it works across both test runners (vitest and jest) and needs no
// runner to be installed.
//
// Only the case title is recorded, never its enclosing `describe` path: a split moves cases into
// new files whose describe blocks are renamed by construction, and renaming a describe is the
// structural change the split is. Losing a case is not.

const CASE_TOKEN_PATTERN = /\b(?:it|test)\b/gu;
const MODIFIER_PATTERN = /^\.(\w+)/u;
const QUOTES = new Set(["'", '"', '`']);

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//u.test(line))
    .join('\n');

const skipWhitespace = (source, index) => {
  let cursor = index;
  while (cursor < source.length && /\s/u.test(source[cursor])) {
    cursor += 1;
  }
  return cursor;
};

/** Advances past a balanced `(...)` or `[...]` group starting at `index`. */
const skipBalanced = (source, index, open, close) => {
  let cursor = index;
  let depth = 0;
  while (cursor < source.length) {
    if (source[cursor] === open) {
      depth += 1;
    } else if (source[cursor] === close) {
      depth -= 1;
      if (depth === 0) {
        return cursor + 1;
      }
    }
    cursor += 1;
  }
  return -1;
};

/** Advances past a template literal starting at its opening backtick. */
const skipTemplate = (source, index) => {
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === '`') {
      return cursor + 1;
    }
    cursor += 1;
  }
  return -1;
};

/** Reads the string or template literal beginning at `index` and returns its raw text. A
 * data-driven title such as `it.each(...)('… rule %s …')` keeps its placeholders: the placeholder
 * is part of the case's identity, and expanding it would need the runner. */
const readLiteral = (source, index) => {
  const quote = source[index];
  let cursor = index + 1;
  let value = '';
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      value += source[cursor + 1];
      cursor += 2;
      continue;
    }
    if (source[cursor] === quote) {
      return { value, end: cursor + 1 };
    }
    value += source[cursor];
    cursor += 1;
  }
  return null;
};

/** Every case title declared in one spec file, in declaration order. */
export const extractCaseNames = (filePath) => {
  const source = stripComments(readFileSync(filePath, 'utf8'));
  const names = [];

  for (const match of source.matchAll(CASE_TOKEN_PATTERN)) {
    let cursor = skipWhitespace(source, match.index + match[0].length);

    // Walk the modifier chain (`.each([...])`, `.only`, `.skip`, `.concurrent`, `.failing`) until
    // the call's own argument list is reached.
    let modifier = MODIFIER_PATTERN.exec(source.slice(cursor));
    while (modifier) {
      cursor = skipWhitespace(source, cursor + modifier[0].length);
      if (modifier[1] === 'each') {
        if (source[cursor] === '(') {
          cursor = skipBalanced(source, cursor, '(', ')');
        } else if (source[cursor] === '`') {
          cursor = skipTemplate(source, cursor);
        } else {
          cursor = -1;
        }
        if (cursor === -1) {
          break;
        }
        cursor = skipWhitespace(source, cursor);
      }
      modifier = MODIFIER_PATTERN.exec(source.slice(cursor));
    }

    if (cursor === -1 || source[cursor] !== '(') {
      continue;
    }

    cursor = skipWhitespace(source, cursor + 1);
    if (!QUOTES.has(source[cursor])) {
      continue;
    }

    const literal = readLiteral(source, cursor);
    if (literal) {
      names.push(literal.value);
    }
  }

  return names;
};

/** The sorted union of every case title declared across `specFiles` — the identity CR-RG-01 holds
 * constant while the four splitting specs are broken up. */
export const buildCaseInventory = (specFiles) =>
  [...new Set(specFiles.flatMap((file) => extractCaseNames(file)))].sort();
