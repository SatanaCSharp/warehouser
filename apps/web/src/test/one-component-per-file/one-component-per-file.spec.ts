import { globSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `writing-web-components.md` §1 "Export one component per file", read as the
 * one trigger a scan can decide mechanically.
 *
 * §1 lets a file keep a small private render helper, and names three moments
 * the helper must move into its own file. Two of them — "a second component
 * renders it" and "it grows its own state, effects, or data access" — need a
 * judgement about what a hook call means, and the guide deliberately leaves
 * that judgement to the reviewer. The third does not: **a helper annotated
 * with a props type its own file exports** has, by construction, "a props type
 * worth naming and exporting", because the file already named and exported it.
 *
 * That is the fact this gate enforces, and no other. A private helper taking
 * an inline or unexported parameter type is untouched here, so the accepted
 * helpers this repository keeps (`DatasetCard`'s `DatasetMessage`,
 * `MemberRow`'s `MemberRowTrailing`) stay accepted; only a file that has
 * already conceded the props type is a component in its own right fails.
 *
 * **Why no file owns it.** The subject is the arrangement of the component
 * tree rather than any component's behaviour: the claim is about every file
 * under `src/`, including files added after this was written, so no colocated
 * spec could fail when a *new* file grows a second component
 * (`placing-web-tests.md` §3, "Structural gates").
 */

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);

/** Every production `.tsx` under `apps/web/src`, relative to `src`. */
const componentFiles = (): string[] =>
  globSync('**/*.tsx', { cwd: SRC_DIRECTORY })
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => !/\.spec\.tsx$/u.test(entry))
    .sort();

/** A source with its comments removed, so prose can neither fail nor excuse. */
const codeOf = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(?<keep>^|[^:])\/\/[^\n]*/gu, '$<keep>');

/** `const Name = (` / `const Name = <`, exported or not. */
const DECLARATION = /^(?:export )?const (?<name>[A-Z]\w*)\s*=\s*[(<]/gmu;

/** The component declarations in one file, in source order. */
const componentsIn = (
  code: string,
): { end: number; name: string; start: number }[] => {
  const declarations = [...code.matchAll(DECLARATION)]
    .map((match) => ({ name: match.groups?.name ?? '', start: match.index }))
    .filter(({ start }) =>
      /React(?:Element|Node)/u.test(code.slice(start, start + 400)),
    );

  return declarations.map((declaration, index) => ({
    ...declaration,
    end: declarations[index + 1]?.start ?? code.length,
  }));
};

/** The props types the file itself exports. */
const exportedTypesIn = (code: string): string[] =>
  [...code.matchAll(/^export type (?<name>\w+)/gmu)].map(
    (match) => match.groups?.name ?? '',
  );

/**
 * The name of every non-exported component annotated with a props type its own
 * file exports — §1's "it needs a props type worth naming and exporting",
 * already conceded.
 */
const conflatedComponentsIn = (relativePath: string): string[] => {
  const code = codeOf(
    readFileSync(posix.join(SRC_DIRECTORY, relativePath), 'utf8'),
  );
  const exportedTypes = exportedTypesIn(code);
  const declarations = componentsIn(code);

  return declarations
    .filter(({ start }) => !code.slice(start, start + 7).startsWith('export'))
    .filter(({ end, start }) =>
      exportedTypes.some((type) =>
        new RegExp(`[:,)]\\s*${type}\\b`, 'u').test(code.slice(start, end)),
      ),
    )
    .map(({ name }) => name);
};

describe('one component per file', () => {
  it('keeps no private component that already has an exported props type', () => {
    const offenders = componentFiles()
      .map((file) => [file, conflatedComponentsIn(file)] as const)
      .filter(([, components]) => components.length > 0);

    expect(Object.fromEntries(offenders)).toStrictEqual({});
  });
});
