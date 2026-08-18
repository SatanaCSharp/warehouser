import {
  extractCaseNamesFromSource,
  stripComments,
} from './split-cases.mjs';

// Case extraction that keeps the enclosing `describe`, for the T1 baseline capture of the
// `refactor-warehouse-components` change request.
//
// `split-cases.mjs` deliberately discards the describe path, because the split it guards renames
// describes by construction. This capture needs the opposite: sad.md §5.4 assigns cases to their
// destination spec *per describe block*, so the baseline has to record which block each case came
// from or the assignment table cannot be checked against it.

const DESCRIBE_PATTERN = /\bdescribe\s*\(\s*(['"`])/gu;

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

/**
 * The `describe` blocks of a spec file with the cases each declares, in declaration order.
 *
 * The first `describe` is the file's root wrapper and is not a group: every case in the subject
 * file lives inside one of the blocks nested under it. Groups are therefore the describes after
 * the first, and each one owns the cases declared between its own opening and the next describe's.
 *
 * This is a deliberately shallow reading — it assumes a single root wrapper and one level of
 * blocks beneath it, which is the shape of the file being captured. `assertGroupsAccountForEvery
 * Case` is what stops that assumption from failing silently: a case declared outside any group, or
 * a third nesting level, leaves the per-group total short of the file's own count.
 */
export const extractGroupedCases = (rawSource) => {
  const source = stripComments(rawSource);

  const describes = [];
  for (const match of source.matchAll(DESCRIBE_PATTERN)) {
    const quoteIndex = match.index + match[0].length - 1;
    const literal = readLiteral(source, quoteIndex);
    if (literal) {
      describes.push({ title: literal.value, start: literal.end });
    }
  }

  return describes.slice(1).map((group, index) => {
    const next = describes[index + 2];
    const body = source.slice(group.start, next ? next.start : source.length);

    return { describe: group.title, cases: extractCaseNamesFromSource(body) };
  });
};

/**
 * Throws unless the groups between them declare every case the file declares.
 *
 * The grouping walk above is shallow, so this is the check that makes it trustworthy: if a case
 * sits outside every group, or the file nests deeper than the walk understands, the per-group
 * total comes out below the file's own count and the capture refuses rather than writing a
 * baseline that is quietly missing a case.
 */
export const assertGroupsAccountForEveryCase = (rawSource, groups) => {
  const declared = extractCaseNamesFromSource(stripComments(rawSource)).length;
  const grouped = groups.reduce((total, group) => total + group.cases.length, 0);

  if (declared !== grouped) {
    throw new Error(
      `grouping accounted for ${grouped} of ${declared} declared cases — ` +
        'a case sits outside every describe block, or the file nests deeper than one level',
    );
  }
};
