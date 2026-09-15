import {
  foreignDeclarationsIn,
  isQueryClassName,
  isQueryDirectoryPath,
  isQueryModulePath,
  isSpecPath,
  serverQueryClasses,
  serverSourceFiles,
} from 'test/architectural/query-placement';
import { serverPath } from 'test/architectural/server-project';
import { describe, expect, it } from 'vitest';

/** Where a query is allowed to live and what is allowed to live with it, checked against the whole
 * `apps/server` source tree.
 *
 * `server-architecture.md` § "Use cases" splits the application boundary three ways and gives reads
 * their own directory — `queries/` return data without changing business state — and
 * `adding-a-server-module.md` § 4 repeats it as the rule for a new module. The split only means
 * anything if it holds both ways: a read written outside `queries/` is a use case nobody looking for
 * the module's reads will find, and a `queries/` directory holding other things is no longer a list
 * of the module's reads.
 *
 * The second rule is about the file. A use case "declares the input and result types of that
 * operation in its own file" — the class and those types, and nothing else. A mapper, a predicate, a
 * derivation, or a lookup table written into a query's file is a unit with its own reason to change
 * that no other module can see; the next read needing the same rule cannot import what it cannot
 * find, so it gets a second copy, and the two then disagree. Those belong in the feature's
 * `domain/mappers/`, `domain/predicates/` or `domain/services/`, where the rest of the tree already
 * puts them. */

const describeViolation = ({
  path,
  line,
  detail,
}: {
  path: string;
  line: number;
  detail: string;
}): string => `${path}:${line} ${detail}`;

describe('query placement', () => {
  it('declares every query class under usecases/queries/', () => {
    const misplaced = serverQueryClasses()
      .filter((query) => !isQueryModulePath(query.path))
      .map((query) =>
        describeViolation({ ...query, detail: `${query.name} is a query` }),
      );

    expect(misplaced).toEqual([]);
  });

  it('holds nothing but queries and their tests in a queries directory', () => {
    const strays = serverSourceFiles()
      .map(serverPath)
      .filter(
        (path) =>
          isQueryDirectoryPath(path) &&
          !isSpecPath(path) &&
          !isQueryModulePath(path),
      );

    expect(strays).toEqual([]);
  });

  it('declares exactly one query class per query file', () => {
    const wrong = serverSourceFiles()
      .filter((file) => isQueryModulePath(serverPath(file)))
      .flatMap((file) => {
        const path = serverPath(file);
        const classes = file.getClasses();
        const names = classes.map(
          (declaration) => declaration.getName() ?? '(anonymous)',
        );

        if (classes.length === 1 && isQueryClassName(names[0])) {
          return [];
        }

        return [
          classes.length === 0
            ? `${path} declares no query class`
            : `${path} declares ${names.join(', ')}`,
        ];
      });

    expect(wrong).toEqual([]);
  });

  it('declares nothing but the query class and its request and response types', () => {
    const foreign = serverSourceFiles()
      .filter((file) => isQueryModulePath(serverPath(file)))
      .flatMap(foreignDeclarationsIn)
      .map(describeViolation);

    expect(foreign).toEqual([]);
  });
});
