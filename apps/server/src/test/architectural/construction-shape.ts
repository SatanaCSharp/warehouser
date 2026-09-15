import {
  productionSourceFiles,
  serverPath,
} from 'test/architectural/server-project';
import type {
  ClassDeclaration,
  ParameterDeclaration,
  SourceFile,
  Statement,
} from 'ts-morph';
import { Node, SyntaxKind } from 'ts-morph';

/** A kind of class the container assembles from collaborators: a command, a query, or a domain
 * service. Each is recognized by the suffix every one of them carries and by the file its module
 * keeps it in. */
export interface ConstructedKind {
  /** How a failure message names one of these. */
  readonly label: string;
  /** The same, pluralized — `queries`, not `querys`. */
  readonly plural: string;
  /** The class-name suffix, which is the whole signal that a class is of this kind. */
  readonly classSuffix: string;
  /** The directory a file of this kind lives in, relative to `apps/server`. */
  readonly directory: RegExp;
  /** The file-name suffix that goes with the class suffix. */
  readonly fileSuffix: string;
}

/** `server-architecture.md` § "Use cases" splits the application boundary three ways and gives
 * writes their own directory; `adding-a-server-module.md` § 4 repeats it for a new module. */
export const COMMAND: ConstructedKind = {
  label: 'command',
  plural: 'commands',
  classSuffix: 'Command',
  directory: /^src\/[a-z0-9-]+\/usecases\/commands\/[^/]+$/u,
  fileSuffix: '.command.ts',
};

/** The read half of the same split — `queries/` return data without changing business state. */
export const QUERY: ConstructedKind = {
  label: 'query',
  plural: 'queries',
  classSuffix: 'Query',
  directory: /^src\/[a-z0-9-]+\/usecases\/queries\/[^/]+$/u,
  fileSuffix: '.query.ts',
};

/** `server-architecture.md` § "Layer responsibilities → Domain": a service is an operation with
 * collaborators, and it lives under the owning feature's `domain/services/`. */
export const SERVICE: ConstructedKind = {
  label: 'service',
  plural: 'services',
  classSuffix: 'Service',
  directory: /^src\/[a-z0-9-]+\/domain\/services\/[^/]+$/u,
  fileSuffix: '.service.ts',
};

/** Everything the constructor rules judge. A command, a query and a service are assembled the same
 * way and by the same container, so the two questions asked of a constructor — may the container
 * leave a parameter out, and can it resolve the ones that are there — have one answer for all
 * three. A rule that held only for writes would be a rule the next read quietly escaped. */
export const CONSTRUCTED_KINDS: readonly ConstructedKind[] = [
  COMMAND,
  QUERY,
  SERVICE,
];

/** The kinds whose file may hold nothing but the class and its types.
 *
 * A service is deliberately not one of them. `server-architecture.md` § "Worked example: a
 * shared-check service" puts a stateless module-level function *in* the service file — `assertApplied`
 * there — precisely so the commands that only need that function are not coupled to the repositories
 * the class injects. `domain/services/` is where a module's stateless domain functions belong, which
 * is the same reason a use case may not keep one. */
export const USE_CASE_KINDS: readonly ConstructedKind[] = [COMMAND, QUERY];

export const isSpecPath = (path: string): boolean => path.endsWith('.spec.ts');

export const isDirectoryPathOf = (
  kind: ConstructedKind,
  path: string,
): boolean => kind.directory.test(path);

export const isModulePathOf = (kind: ConstructedKind, path: string): boolean =>
  isDirectoryPathOf(kind, path) &&
  path.endsWith(kind.fileSuffix) &&
  !isSpecPath(path);

/** Whether `name` carries the kind's suffix. The suffix is the whole signal on purpose: it is what
 * makes the class findable from outside its module, and one that drops it is invisible to this gate
 * *and* to the next person looking for it. */
export const isClassNameOf = (
  kind: ConstructedKind,
  name: string | undefined,
): boolean => name !== undefined && name.endsWith(kind.classSuffix);

export interface ConstructedClass {
  readonly kind: ConstructedKind;
  readonly path: string;
  readonly name: string;
  readonly declaration: ClassDeclaration;
}

/** Every class of `kind` in production server code, wherever it is written, so the constructor
 * rules judge one that was moved out of its directory too. */
export const classesOf = (kind: ConstructedKind): readonly ConstructedClass[] =>
  productionSourceFiles().flatMap((file) => {
    const path = serverPath(file);

    return file
      .getClasses()
      .filter((declaration) => isClassNameOf(kind, declaration.getName()))
      .map((declaration) => ({
        kind,
        path,
        name: declaration.getName() ?? '(anonymous)',
        declaration,
      }));
  });

/** Production files of `kind`: the ones the file-level assertions judge. */
export const moduleFilesOf = (kind: ConstructedKind): readonly SourceFile[] =>
  productionSourceFiles().filter((file) =>
    isModulePathOf(kind, serverPath(file)),
  );

export interface ConstructionViolation {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

const constructorParametersOf = (
  declaration: ClassDeclaration,
): readonly ParameterDeclaration[] =>
  declaration
    .getConstructors()
    .flatMap((constructor) => constructor.getParameters());

const parameterName = (parameter: ParameterDeclaration): string =>
  parameter.getNameNode().getText();

const decoratorNamesOf = (parameter: ParameterDeclaration): readonly string[] =>
  parameter.getDecorators().map((decorator) => decorator.getName());

/** `@Optional()` is the marker for the one thing the first rule forbids, so it never counts as the
 * "injected by a decorator" exemption the second rule grants. */
const OPTIONALITY_DECORATORS: readonly string[] = ['Optional'];

const injectingDecoratorsOf = (
  parameter: ParameterDeclaration,
): readonly string[] =>
  decoratorNamesOf(parameter).filter(
    (name) => !OPTIONALITY_DECORATORS.includes(name),
  );

/** A multi-line type annotation — a wrapped function type, say — collapsed onto the single line a
 * violation occupies, so the failure list stays one finding per line. */
const oneLine = (text: string): string => text.replaceAll(/\s+/gu, ' ');

/** A union that admits `undefined` or `null` is an optional dependency spelled in the type instead
 * of in the parameter list; it leaves the body with the same "is anything there?" question a `?`
 * would. */
const admitsAbsence = (parameter: ParameterDeclaration): boolean => {
  const typeNode = parameter.getTypeNode();
  const union = typeNode?.asKind(SyntaxKind.UnionType);

  return (
    union
      ?.getTypeNodes()
      .some((member) =>
        [SyntaxKind.UndefinedKeyword, SyntaxKind.NullKeyword].includes(
          member.getKind(),
        ),
      ) ?? false
  );
};

/** Why this parameter is an optional dependency, or `undefined` when it is a required one.
 *
 * A collaborator is what the operation is made of; every one of them is used by the body
 * (`server-use-case-boundaries.md` § 5). A dependency the container may leave out therefore has a
 * default standing behind it, and that default is a second implementation of the behaviour that
 * only the test tier ever exercises: production runs one object graph, the unit specs run another,
 * and the gate that is supposed to cover the first covers the second. Nothing downstream can tell
 * the two apart — the seam is invisible at the call site and invisible in the module that registers
 * the provider. */
const optionalityOf = (parameter: ParameterDeclaration): string | undefined => {
  const optionalDecorators = decoratorNamesOf(parameter).filter((name) =>
    OPTIONALITY_DECORATORS.includes(name),
  );

  if (optionalDecorators.length > 0) {
    return `is decorated @${optionalDecorators.join(', @')}()`;
  }

  if (parameter.hasQuestionToken()) {
    return 'is declared optional with `?`';
  }

  const initializer = parameter.getInitializer();

  if (initializer !== undefined) {
    return `defaults to ${oneLine(initializer.getText())}`;
  }

  if (admitsAbsence(parameter)) {
    return `is typed ${oneLine(parameter.getTypeNode()?.getText() ?? 'optional')}`;
  }

  return undefined;
};

/** Constructor parameters of `constructed` that the container is allowed to leave out. */
export const optionalDependenciesIn = (
  constructed: ConstructedClass,
): readonly ConstructionViolation[] =>
  constructorParametersOf(constructed.declaration).flatMap((parameter) => {
    const optionality = optionalityOf(parameter);

    return optionality === undefined
      ? []
      : [
          {
            path: constructed.path,
            line: parameter.getStartLineNumber(),
            detail: `${constructed.name}.${parameterName(parameter)} ${optionality}`,
          },
        ];
  });

/** Whether the parameter's declared type is a bare reference to a class — `ItemCatalogueRepository`,
 * `CustomerOrderLifecycleService` — rather than a function type, a `typeof`, an interface, or an
 * object literal type.
 *
 * Both halves matter. The syntax must be a type reference, so `typeof SomeClass` (the constructor,
 * not an instance) does not slip through on the strength of resolving to a class; and the reference
 * must resolve to a `class`, so an interface named like a service does not either. */
const namesAClass = (parameter: ParameterDeclaration): boolean => {
  if (parameter.getTypeNode()?.getKind() !== SyntaxKind.TypeReference) {
    return false;
  }

  return (
    parameter
      .getType()
      .getSymbol()
      ?.getDeclarations()
      .some((declaration) => Node.isClassDeclaration(declaration)) ?? false
  );
};

/** What the parameter's type is, when it is not a class, phrased for the failure message. */
const describeNonClassType = (parameter: ParameterDeclaration): string => {
  const typeNode = parameter.getTypeNode();

  if (typeNode === undefined) {
    return 'has no declared type';
  }

  const resolved = parameter
    .getType()
    .getSymbol()
    ?.getDeclarations()
    .at(0)
    ?.getKindName();
  const typed = `is typed ${oneLine(typeNode.getText())}`;

  return resolved === undefined ? typed : `${typed} (${resolved})`;
};

/** Constructor parameters of `constructed` that are neither a class nor injected by a decorator.
 *
 * A constructor is the list of collaborators the container assembles the object from, and a class
 * name is the only spelling the container can resolve on its own. A function type, a `typeof`, or
 * an interface cannot be — so each one arrives through a default value instead, and the parameter
 * stops being a dependency and becomes a configuration point: `register.command.ts` took
 * `hash: typeof hashPassword = hashPassword`, `generateSecret`, and `runtime` that way. Those are
 * module-level functions; the body should call them directly, exactly as it calls `randomUUID`.
 *
 * `@Inject(TOKEN)` stays available for the dependency that genuinely has no class to name — a
 * structural type narrower than the class behind it, a value from configuration — because the token
 * makes the wiring explicit at the constructor *and* in the module that provides it, which is
 * precisely what a defaulted parameter hides. */
export const unresolvableDependenciesIn = (
  constructed: ConstructedClass,
): readonly ConstructionViolation[] =>
  constructorParametersOf(constructed.declaration).flatMap((parameter) => {
    if (injectingDecoratorsOf(parameter).length > 0 || namesAClass(parameter)) {
      return [];
    }

    return [
      {
        path: constructed.path,
        line: parameter.getStartLineNumber(),
        detail: `${constructed.name}.${parameterName(parameter)} ${describeNonClassType(parameter)}`,
      },
    ];
  });

/** What a use case's file may declare: the class itself, and the input and output types of the
 * operation it names — "a use case ... declares the input and result types of that operation in its
 * own file" (`server-architecture.md` § "Use cases"). Imports are how it reaches everything else.
 *
 * Anything further is a second unit living in the use case's file, with its own reason to change and
 * no way for another module to find it — which is how the second, divergent copy gets written. A
 * conversion belongs in the feature's `domain/mappers/`, a question about a value in
 * `domain/predicates/`, an operation or a stateless rule in `domain/services/`. */
const ALLOWED_STATEMENTS: readonly SyntaxKind[] = [
  SyntaxKind.ImportDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
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

  const className = statement.asKind(SyntaxKind.ClassDeclaration)?.getName();

  if (className !== undefined) {
    return `class ${className}`;
  }

  return statement.getKindName();
};

/** Whether the statement is the file's own use-case class. Every other class declaration is
 * foreign, which is what makes "the command class" and "the query class" singular. */
const isOwnClassStatement = (
  kind: ConstructedKind,
  statement: Statement,
): boolean =>
  isClassNameOf(
    kind,
    statement.asKind(SyntaxKind.ClassDeclaration)?.getName() ?? undefined,
  );

/** Declarations in `file` that are neither its use-case class nor a type. */
export const foreignDeclarationsIn = (
  kind: ConstructedKind,
  file: SourceFile,
): readonly ConstructionViolation[] =>
  file
    .getStatements()
    .filter(
      (statement) =>
        !ALLOWED_STATEMENTS.includes(statement.getKind()) &&
        !isOwnClassStatement(kind, statement),
    )
    .map((statement) => ({
      path: serverPath(file),
      line: statement.getStartLineNumber(),
      detail: describeStatement(statement),
    }));
