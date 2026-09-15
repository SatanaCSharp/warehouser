import {
  productionSourceFiles,
  serverPath,
  serverProject,
} from 'test/architectural/server-project';
import type { SourceFile } from 'ts-morph';

/** The one directory a query may be declared in, per `server-architecture.md` § "Use cases":
 * `queries/` return data without changing business state, and they sit beside `commands/` and
 * `events/` under the feature module's `usecases/`. `adding-a-server-module.md` § 4 states the same
 * split — "put writes in `usecases/commands/` and reads in `usecases/queries/`". */
export const QUERY_DIRECTORY = /^src\/[a-z0-9-]+\/usecases\/queries\/[^/]+$/u;

export const isQueryDirectoryPath = (path: string): boolean =>
  QUERY_DIRECTORY.test(path);

/** Colocated unit and integration specs are explicitly allowed next to the code they cover
 * (`server-architecture.md` § Testing), so a `*.spec.ts` in `queries/` is not a stray file. */
export const isSpecPath = (path: string): boolean => path.endsWith('.spec.ts');

export const isQueryModulePath = (path: string): boolean =>
  isQueryDirectoryPath(path) && path.endsWith('.query.ts') && !isSpecPath(path);

/** A query is recognized by the suffix every one of them carries — `ListCustomersQuery`,
 * `ReadPurchaseDraftQuery`. The suffix is the whole signal on purpose: it is what makes a query
 * findable from outside its module, and a read use case that drops it would be invisible to this
 * gate *and* to the next person looking for it. */
export const isQueryClassName = (name: string | undefined): boolean =>
  name !== undefined && name.endsWith('Query');

export interface QueryClassDeclaration {
  readonly path: string;
  readonly line: number;
  readonly name: string;
}

/** Every class named `*Query` anywhere in production server code, so the placement assertion can
 * see a query written outside `queries/` rather than only judging the ones already inside it. */
export const serverQueryClasses = (): readonly QueryClassDeclaration[] =>
  productionSourceFiles().flatMap((file) => {
    const path = serverPath(file);

    return file
      .getClasses()
      .filter((declaration) => isQueryClassName(declaration.getName()))
      .map((declaration) => ({
        path,
        line: declaration.getStartLineNumber(),
        name: declaration.getName() ?? '(anonymous)',
      }));
  });

/** Every file under `src/`, specs included — `productionSourceFiles` filters specs out, and the
 * directory-contents rule has to judge them to allow them. */
export const serverSourceFiles = (): readonly SourceFile[] =>
  serverProject()
    .getSourceFiles()
    .filter((file) => serverPath(file).startsWith('src/'));
