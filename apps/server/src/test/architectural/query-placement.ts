import {
  productionSourceFiles,
  serverPath,
  serverProject,
} from 'test/architectural/server-project';
import type { SourceFile, Statement } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';

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

/** What a query file may declare: the query class itself, and the request and response types of the
 * operation it names — "a use case ... declares the input and result types of that operation in its
 * own file" (`server-architecture.md` § "Use cases"). Imports are how it reaches its collaborators.
 *
 * Everything else is a second thing living in the query's file. A named function, a constant, a
 * lookup table, a second class: each is a unit with its own reason to change, and none of them is
 * findable from another module that needs the same rule — which is how the second, divergent copy
 * gets written. They belong in the feature's `domain/` — `mappers/` for a conversion,
 * `predicates/` for a question about a value, `services/` for an operation with collaborators. */
const ALLOWED_STATEMENTS: readonly SyntaxKind[] = [
  SyntaxKind.ImportDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.ClassDeclaration,
];

const describeStatement = (statement: Statement): string => {
  const named = statement.asKind(SyntaxKind.FunctionDeclaration)?.getName();

  if (named !== undefined) {
    return `function ${named}`;
  }

  const variables = statement
    .asKind(SyntaxKind.VariableStatement)
    ?.getDeclarations()
    .map((declaration) => declaration.getName());

  if (variables !== undefined) {
    return `const/let ${variables.join(', ')}`;
  }

  return statement.getKindName();
};

export interface QueryFileViolation {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

/** Declarations in `file` that are neither the query class nor a type. */
export const foreignDeclarationsIn = (
  file: SourceFile,
): readonly QueryFileViolation[] =>
  file
    .getStatements()
    .filter((statement) => !ALLOWED_STATEMENTS.includes(statement.getKind()))
    .map((statement) => ({
      path: serverPath(file),
      line: statement.getStartLineNumber(),
      detail: describeStatement(statement),
    }));
