import {
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
 * What a query's file may then hold — the class and the operation's input and output types, and
 * nothing else — is the same rule a command's file obeys, so it is stated once for both in
 * `construction-shape.architectural.spec.ts` rather than twice here. */

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
});
