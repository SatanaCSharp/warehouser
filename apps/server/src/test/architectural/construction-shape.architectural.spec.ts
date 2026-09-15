import type { ConstructedKind } from 'test/architectural/construction-shape';
import {
  classesOf,
  CONSTRUCTED_KINDS,
  foreignDeclarationsIn,
  isClassNameOf,
  moduleFilesOf,
  optionalDependenciesIn,
  unresolvableDependenciesIn,
  USE_CASE_KINDS,
} from 'test/architectural/construction-shape';
import { serverPath } from 'test/architectural/server-project';
import { describe, expect, it } from 'vitest';

/** How a command, a query or a domain service is constructed, and what a use case's file is allowed
 * to hold, checked against the whole `apps/server` source tree.
 *
 * `server-architecture.md` § "Use cases" gives writes and reads their own directories and § "Layer
 * responsibilities → Domain" puts an operation with collaborators in a service; all three are
 * classes the container assembles from a constructor parameter list.
 * `server-use-case-boundaries.md` § 5 already requires every constructor parameter to be used by
 * the body. These assertions add what that checklist cannot see by reading one file — that the
 * parameter list is the *whole* list, that the container can resolve it, and that a use case's file
 * holds the use case and nothing else.
 *
 * Together they keep one thing true: the object that runs in production is the object the specs
 * run. A parameter the container may omit, or one it cannot resolve without a default, introduces a
 * second object graph that only the tests ever assemble — and then the gate covering the class
 * covers the graph the gate itself built.
 *
 * The constructor rules judge all three kinds, because all three are built the same way and a rule
 * that held only for writes would be a rule the next read quietly escaped. The file-contents rules
 * judge use cases only: `domain/services/` is where a module's stateless domain functions are
 * *supposed* to live — `server-architecture.md`'s worked example puts `assertApplied` beside the
 * service class for exactly that reason — which is the same reason a use case may not keep one. */

const describeViolation = ({
  path,
  line,
  detail,
}: {
  path: string;
  line: number;
  detail: string;
}): string => `${path}:${line} ${detail}`;

describe.each(CONSTRUCTED_KINDS)(
  '$label construction',
  (kind: ConstructedKind) => {
    it(`has ${kind.plural} to judge`, () => {
      // A rename of the `*${kind.classSuffix}` suffix or of the directory would empty every list
      // below and pass every assertion silently.
      expect(classesOf(kind).length).toBeGreaterThan(0);
    });

    it('declares no optional constructor dependency', () => {
      const optional = classesOf(kind)
        .flatMap(optionalDependenciesIn)
        .map(describeViolation);

      expect(optional).toEqual([]);
    });

    it('names a class for every constructor dependency a decorator does not inject', () => {
      const unresolvable = classesOf(kind)
        .flatMap(unresolvableDependenciesIn)
        .map(describeViolation);

      expect(unresolvable).toEqual([]);
    });
  },
);

describe.each(USE_CASE_KINDS)('$label file', (kind: ConstructedKind) => {
  it(`has ${kind.label} files to judge`, () => {
    expect(moduleFilesOf(kind).length).toBeGreaterThan(0);
  });

  it('declares nothing but the use case class and its input and output types', () => {
    const foreign = moduleFilesOf(kind)
      .flatMap((file) => foreignDeclarationsIn(kind, file))
      .map(describeViolation);

    expect(foreign).toEqual([]);
  });

  it('declares exactly one use case class per file', () => {
    const wrong = moduleFilesOf(kind).flatMap((file) => {
      const classes = file
        .getClasses()
        .map((declaration) => declaration.getName() ?? '(anonymous)');
      const own = classes.filter((name) => isClassNameOf(kind, name));

      return own.length === 1
        ? []
        : [
            `${serverPath(file)} declares ${
              classes.length === 0 ? 'no class' : classes.join(', ')
            }`,
          ];
    });

    expect(wrong).toEqual([]);
  });
});
