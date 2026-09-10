import {
  productionSourceFiles,
  serverPath,
} from 'test/architectural/server-project.js';
import type { Expression, ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { Node, SyntaxKind } from 'ts-morph';

/** Every shape a mapping is written in in this repository. A detector exists for each one, and the
 * name of the one that matched travels with the finding so a failure says *why* the declaration is
 * a mapper, not just that it is.
 *
 * - `object-projection` — returns an object literal whose fields are read off its parameters
 *   (`toCustomer`, `toItemResponse`).
 * - `collection-projection` — returns `xs.map(...)` / lodash `map(xs, ...)` producing such objects.
 * - `entity-construction` — builds a `*Entity` persistence row out of its parameters
 *   (`toSessionEntity`).
 * - `factory-construction` — feeds its parameters' fields to a domain factory or constructor
 *   (`toAccount`'s `Account.create({...})`).
 * - `branching-projection` — every branch of a ternary, `??` or `if/return` is one of the above
 *   (`toCustomerOrderResponse`'s redacted/identified split).
 * - `delegating-conversion` — a conversion whose branches are calls to other mappers.
 * - `contract-typed-conversion` — named as a conversion and declared to return a published contract,
 *   DTO or persistence type, whatever its body does. */
export const MAPPING_PATTERNS = [
  'object-projection',
  'collection-projection',
  'entity-construction',
  'factory-construction',
  'branching-projection',
  'delegating-conversion',
  'contract-typed-conversion',
] as const;

export type MappingPattern = (typeof MAPPING_PATTERNS)[number];

export interface MappingDeclaration {
  /** Declared name — a mapping is always named; an inline callback is not a *separate* mapper. */
  readonly name: string;
  /** Path relative to `apps/server`, POSIX separators. */
  readonly path: string;
  readonly line: number;
  readonly kind: 'function' | 'method';
  readonly patterns: readonly MappingPattern[];
  readonly isExported: boolean;
  /** True when the declaring file also calls it — the "mapper inlined into its consumer" case. */
  readonly usedInDeclaringFile: boolean;
}

/** A conversion reads as one in its name: `toCustomer`, `fromStoredRow`, `mapMemberPage`. */
const CONVERSION_NAME =
  /^(?:to|from|into|as|map|convert|adapt|serialize|deserialize|present|project|normalize|denormalize)[A-Z]/u;

/** Types that only a boundary crossing produces: a persistence row, a transport shape, a DTO. */
const BOUNDARY_TYPE_NAME =
  /(?:Entity|Dto|DTO|Response|Request|Payload|Projection|View|Row|Read)$/u;

const CONTRACT_MODULE = /^@warehouser\/(?:contracts|shared-types)(?:\/|$)/u;

type FunctionLike =
  | import('ts-morph').ArrowFunction
  | import('ts-morph').FunctionDeclaration
  | import('ts-morph').FunctionExpression
  | import('ts-morph').MethodDeclaration;

interface Candidate {
  readonly name: string;
  readonly kind: 'function' | 'method';
  readonly fn: FunctionLike;
  /** The node the finding is reported at, and whose name the declaring file may reference. */
  readonly declaration: Node;
  readonly file: SourceFile;
}

const asFunctionLike = (node: Node | undefined): FunctionLike | undefined =>
  node !== undefined &&
  (Node.isArrowFunction(node) || Node.isFunctionExpression(node))
    ? node
    : undefined;

/** Every named function-like declaration in a file, including ones nested inside another function:
 * a mapper hidden in the body of `execute` is still a mapper declared where it is used. */
const candidates = (file: SourceFile): readonly Candidate[] => {
  const found: Candidate[] = [];

  file.forEachDescendant((node) => {
    if (Node.isFunctionDeclaration(node)) {
      const name = node.getName();

      if (name !== undefined) {
        found.push({
          name,
          kind: 'function',
          fn: node,
          declaration: node,
          file,
        });
      }

      return;
    }

    if (Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node)) {
      const fn = asFunctionLike(node.getInitializer());
      const nameNode = node.getNameNode();

      if (fn !== undefined && Node.isIdentifier(nameNode)) {
        found.push({
          name: nameNode.getText(),
          kind: Node.isPropertyDeclaration(node) ? 'method' : 'function',
          fn,
          declaration: node,
          file,
        });
      }

      return;
    }

    if (Node.isPropertyAssignment(node)) {
      const fn = asFunctionLike(node.getInitializer());
      const nameNode = node.getNameNode();

      if (fn !== undefined && Node.isIdentifier(nameNode)) {
        found.push({
          name: nameNode.getText(),
          kind: 'method',
          fn,
          declaration: node,
          file,
        });
      }

      return;
    }

    if (Node.isMethodDeclaration(node)) {
      const nameNode = node.getNameNode();

      if (Node.isIdentifier(nameNode)) {
        found.push({
          name: nameNode.getText(),
          kind: 'method',
          fn: node,
          declaration: node,
          file,
        });
      }
    }
  });

  return found;
};

/** Peel away the wrappers that carry no meaning for what a function hands back, and split the ones
 * that hand back one of several things — so a ternary between two projections is two returns. */
const unwrapReturned = (expression: Expression): readonly Expression[] => {
  if (Node.isParenthesizedExpression(expression)) {
    return unwrapReturned(expression.getExpression());
  }

  if (
    Node.isAsExpression(expression) ||
    Node.isSatisfiesExpression(expression) ||
    Node.isNonNullExpression(expression) ||
    Node.isAwaitExpression(expression) ||
    Node.isTypeAssertion(expression)
  ) {
    return unwrapReturned(expression.getExpression());
  }

  if (Node.isConditionalExpression(expression)) {
    return [
      ...unwrapReturned(expression.getWhenTrue()),
      ...unwrapReturned(expression.getWhenFalse()),
    ];
  }

  if (Node.isBinaryExpression(expression)) {
    const operator = expression.getOperatorToken().getKind();

    if (
      operator === SyntaxKind.QuestionQuestionToken ||
      operator === SyntaxKind.BarBarToken
    ) {
      return [
        ...unwrapReturned(expression.getLeft()),
        ...unwrapReturned(expression.getRight()),
      ];
    }
  }

  return [expression];
};

const isFunctionBoundary = (node: Node): boolean =>
  Node.isArrowFunction(node) ||
  Node.isFunctionDeclaration(node) ||
  Node.isFunctionExpression(node) ||
  Node.isMethodDeclaration(node) ||
  Node.isClassDeclaration(node) ||
  Node.isClassExpression(node);

/** What this function itself returns. Returns belonging to a nested function are that function's. */
const returnedExpressions = (fn: FunctionLike): readonly Expression[] => {
  const body = fn.getBody();

  if (body === undefined) {
    return [];
  }

  if (!Node.isBlock(body)) {
    return unwrapReturned(body as Expression);
  }

  const returned: Expression[] = [];

  body.forEachDescendant((node, traversal) => {
    if (isFunctionBoundary(node)) {
      traversal.skip();

      return;
    }

    if (Node.isReturnStatement(node)) {
      const expression = node.getExpression();

      if (expression !== undefined) {
        returned.push(...unwrapReturned(expression));
      }
    }
  });

  return returned;
};

/** Identifiers that stand for a value, not for the name of a property being written or read. */
const valueIdentifiers = (node: Node): readonly string[] => {
  const names: string[] = [];

  const collect = (candidate: Node): void => {
    if (!Node.isIdentifier(candidate)) {
      return;
    }

    const parent = candidate.getParent();

    if (
      (Node.isPropertyAssignment(parent) &&
        parent.getNameNode() === candidate) ||
      (Node.isPropertyAccessExpression(parent) &&
        parent.getNameNode() === candidate)
    ) {
      return;
    }

    names.push(candidate.getText());
  };

  collect(node);
  node.forEachDescendant(collect);

  return names;
};

const readsAParameter = (
  node: Node,
  parameters: ReadonlySet<string>,
): boolean => valueIdentifiers(node).some((name) => parameters.has(name));

/** A constant that says nothing about where the data came from: `null`, `0`, `'applied'`, `[]`. */
const isConstant = (expression: Expression): boolean =>
  Node.isStringLiteral(expression) ||
  Node.isNumericLiteral(expression) ||
  Node.isNoSubstitutionTemplateLiteral(expression) ||
  expression.getKind() === SyntaxKind.TrueKeyword ||
  expression.getKind() === SyntaxKind.FalseKeyword ||
  expression.getKind() === SyntaxKind.NullKeyword ||
  expression.getText() === 'undefined';

/** An object literal is a projection when its fields are read off the function's own parameters:
 * at least one is, and no more of them come from somewhere else than do. */
const isProjection = (
  literal: ObjectLiteralExpression,
  parameters: ReadonlySet<string>,
): boolean => {
  let derived = 0;
  let foreign = 0;

  for (const property of literal.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      if (readsAParameter(property.getExpression(), parameters)) {
        derived++;
      } else {
        foreign++;
      }

      continue;
    }

    if (Node.isShorthandPropertyAssignment(property)) {
      if (parameters.has(property.getName())) {
        derived++;
      } else {
        foreign++;
      }

      continue;
    }

    if (Node.isPropertyAssignment(property)) {
      const initializer = property.getInitializer();

      if (initializer === undefined || isConstant(initializer)) {
        continue;
      }

      if (readsAParameter(initializer, parameters)) {
        derived++;
      } else {
        foreign++;
      }

      continue;
    }

    foreign++;
  }

  return derived >= 1 && derived >= foreign;
};

const projectingArgument = (
  call: import('ts-morph').CallExpression,
  parameters: ReadonlySet<string>,
): boolean =>
  call.getArguments().some((argument) => {
    const fn = asFunctionLike(argument);

    if (fn === undefined) {
      return false;
    }

    const inner = new Set([
      ...parameters,
      ...fn.getParameters().map((parameter) => parameter.getName()),
    ]);

    return returnedExpressions(fn).some(
      (expression) =>
        Node.isObjectLiteralExpression(expression) &&
        isProjection(expression, inner),
    );
  });

const calleeName = (call: import('ts-morph').CallExpression): string => {
  const callee = call.getExpression();

  if (Node.isPropertyAccessExpression(callee)) {
    return callee.getName();
  }

  return Node.isIdentifier(callee) ? callee.getText() : '';
};

/** A persistence row assembled statement by statement rather than in one literal:
 *
 * ```ts
 * const entity = new SessionEntity();
 * entity.accountId = session.accountId.value;   // <- the mapping
 * return entity;
 * ```
 *
 * TypeORM's own `manager.create(SessionEntity, { ... })` is the same crossing spelled as a call.
 * Both are mappings wherever they are written, which is why this looks at the whole body instead of
 * only at what comes back. */
const constructsAnEntity = (
  fn: FunctionLike,
  parameters: ReadonlySet<string>,
): boolean => {
  const body = fn.getBody();

  if (body === undefined) {
    return false;
  }

  let constructs = false;
  let fed = false;

  const inspect = (node: Node): void => {
    if (
      Node.isNewExpression(node) &&
      node.getExpression().getText().endsWith('Entity')
    ) {
      constructs = true;
      fed ||= readsAParameter(node, parameters);

      return;
    }

    if (Node.isCallExpression(node) && calleeName(node) === 'create') {
      const [target] = node.getArguments();

      if (target !== undefined && target.getText().endsWith('Entity')) {
        constructs = true;
        fed ||= node
          .getArguments()
          .slice(1)
          .some((argument) => readsAParameter(argument, parameters));
      }

      return;
    }

    if (
      Node.isBinaryExpression(node) &&
      node.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      Node.isPropertyAccessExpression(node.getLeft())
    ) {
      fed ||= readsAParameter(node.getRight(), parameters);
    }
  };

  inspect(body);

  body.forEachDescendant((node, traversal) => {
    if (isFunctionBoundary(node)) {
      traversal.skip();

      return;
    }

    inspect(node);
  });

  return constructs && fed;
};

const MAP_FUNCTIONS = new Set(['map', 'flatMap', 'mapValues']);

/** Which mapping pattern, if any, one returned expression is written in. */
const patternOf = (
  expression: Expression,
  parameters: ReadonlySet<string>,
  knownMappers: ReadonlySet<string>,
): MappingPattern | undefined => {
  if (Node.isObjectLiteralExpression(expression)) {
    return isProjection(expression, parameters)
      ? 'object-projection'
      : undefined;
  }

  if (Node.isArrayLiteralExpression(expression)) {
    return expression
      .getElements()
      .some(
        (element) =>
          Node.isObjectLiteralExpression(element) &&
          isProjection(element, parameters),
      )
      ? 'collection-projection'
      : undefined;
  }

  if (Node.isNewExpression(expression)) {
    return expression.getExpression().getText().endsWith('Entity') &&
      readsAParameter(expression, parameters)
      ? 'entity-construction'
      : undefined;
  }

  if (Node.isCallExpression(expression)) {
    const name = calleeName(expression);

    if (MAP_FUNCTIONS.has(name) && projectingArgument(expression, parameters)) {
      return 'collection-projection';
    }

    if (
      MAP_FUNCTIONS.has(name) &&
      expression
        .getArguments()
        .some(
          (argument) =>
            Node.isIdentifier(argument) && knownMappers.has(argument.getText()),
        )
    ) {
      return 'collection-projection';
    }

    if (name === 'assign' && /new\s+\w*Entity\b/u.test(expression.getText())) {
      return 'entity-construction';
    }

    // `Account.create({ id: entity.id, ... })` — the fields are still read off the source, the
    // object they end up in is just built by a factory rather than written as a literal.
    if (
      expression
        .getArguments()
        .some(
          (argument) =>
            Node.isObjectLiteralExpression(argument) &&
            isProjection(argument, parameters),
        )
    ) {
      return 'factory-construction';
    }

    if (knownMappers.has(name) && readsAParameter(expression, parameters)) {
      return 'delegating-conversion';
    }
  }

  return undefined;
};

const importedFrom = (file: SourceFile, local: string): string | undefined => {
  for (const declaration of file.getImportDeclarations()) {
    const named = declaration
      .getNamedImports()
      .some(
        (specifier) =>
          (specifier.getAliasNode() ?? specifier.getNameNode()).getText() ===
          local,
      );
    const defaulted = declaration.getDefaultImport()?.getText() === local;

    if (named || defaulted) {
      return declaration.getModuleSpecifierValue();
    }
  }

  return undefined;
};

/** A type annotation that names a boundary: a published contract, a persistence entity, a DTO, a
 * transport response, a repository read row. */
const namesABoundaryType = (
  file: SourceFile,
  typeNode: Node | undefined,
): boolean => {
  if (typeNode === undefined) {
    return false;
  }

  const names = [
    ...(Node.isIdentifier(typeNode) ? [typeNode.getText()] : []),
    ...typeNode
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .map((identifier) => identifier.getText()),
  ];

  return names.some((name) => {
    if (BOUNDARY_TYPE_NAME.test(name)) {
      return true;
    }

    const module = importedFrom(file, name);

    return module !== undefined && CONTRACT_MODULE.test(module);
  });
};

/** The declaration crosses a boundary in its signature: it is handed one of those types, or it
 * promises one. Either side is enough — `toAccount(entity: AccountEntity)` announces the crossing
 * on the way in, `toSessionEntity(session): Partial<SessionEntity>` on the way out. */
const crossesABoundary = (candidate: Candidate): boolean =>
  namesABoundaryType(candidate.file, candidate.fn.getReturnTypeNode()) ||
  candidate.fn
    .getParameters()
    .some((parameter) =>
      namesABoundaryType(candidate.file, parameter.getTypeNode()),
    );

const isExported = (candidate: Candidate): boolean => {
  const declaration = candidate.declaration;

  if (Node.isVariableDeclaration(declaration)) {
    return declaration.getVariableStatement()?.isExported() ?? false;
  }

  return Node.isExportable(declaration) ? declaration.isExported() : false;
};

/** Whether the declaring file names the mapping anywhere outside the declaration itself — the
 * "written beside its one caller" case, which is the shape this rule exists for. Position ranges
 * rather than a reference lookup: the declaration's own name node and every identifier in its body
 * fall inside it, and nothing else does. */
const usedInDeclaringFile = (candidate: Candidate): boolean => {
  const start = candidate.declaration.getStart();
  const end = candidate.declaration.getEnd();

  return candidate.file
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (identifier) =>
        identifier.getText() === candidate.name &&
        (identifier.getStart() < start || identifier.getEnd() > end),
    );
};

const classify = (
  candidate: Candidate,
  knownMappers: ReadonlySet<string>,
): MappingDeclaration | undefined => {
  const parameters = candidate.fn.getParameters();

  if (parameters.length === 0) {
    return undefined;
  }

  const parameterNames = new Set(
    parameters.flatMap((parameter) =>
      parameter
        .getNameNode()
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .map((identifier) => identifier.getText())
        .concat(
          Node.isIdentifier(parameter.getNameNode())
            ? [parameter.getName()]
            : [],
        ),
    ),
  );

  const namedAsConversion = CONVERSION_NAME.test(candidate.name);
  const boundaryTyped = crossesABoundary(candidate);

  // A method is a mapper only when it says so in its name. `execute`, `handle` and a controller's
  // route methods return projections as a matter of course — that is the use case's own output, not
  // a mapper someone hid inside a class.
  if (candidate.kind === 'method' && !namedAsConversion) {
    return undefined;
  }

  if (!namedAsConversion && !boundaryTyped) {
    return undefined;
  }

  const returned = returnedExpressions(candidate.fn);
  const matched = returned
    .map((expression) => patternOf(expression, parameterNames, knownMappers))
    .filter((pattern): pattern is MappingPattern => pattern !== undefined);

  const patterns = new Set<MappingPattern>(matched);

  if (constructsAnEntity(candidate.fn, parameterNames)) {
    patterns.add('entity-construction');
  }

  // Every branch mapped, and there was more than one: the split itself is the mapping.
  if (returned.length > 1 && matched.length === returned.length) {
    patterns.add('branching-projection');
  }

  if (patterns.size === 0) {
    if (
      !namedAsConversion ||
      !namesABoundaryType(candidate.file, candidate.fn.getReturnTypeNode())
    ) {
      return undefined;
    }

    patterns.add('contract-typed-conversion');
  }

  return {
    name: candidate.name,
    path: serverPath(candidate.file),
    line: candidate.declaration.getStartLineNumber(),
    kind: candidate.kind,
    patterns: [...patterns].sort(),
    isExported: isExported(candidate),
    usedInDeclaringFile: usedInDeclaringFile(candidate),
  };
};

/** Every mapping declaration in the given files.
 *
 * Two passes: `delegating-conversion` can only be recognized once the mappers a conversion delegates
 * to are known, so the first pass collects the names the shape-based detectors find and the second
 * re-runs with them in hand. */
export const findMappingDeclarations = (
  files: readonly SourceFile[],
): readonly MappingDeclaration[] => {
  const all = files.flatMap((file) => candidates(file));
  const firstPass = all
    .map((candidate) => classify(candidate, new Set<string>()))
    .filter((mapping): mapping is MappingDeclaration => mapping !== undefined);
  const knownMappers = new Set(firstPass.map((mapping) => mapping.name));

  return all
    .map((candidate) => classify(candidate, knownMappers))
    .filter((mapping): mapping is MappingDeclaration => mapping !== undefined)
    .sort((left, right) =>
      left.path === right.path
        ? left.line - right.line
        : left.path.localeCompare(right.path),
    );
};

export const serverMappingDeclarations = (): readonly MappingDeclaration[] =>
  findMappingDeclarations(productionSourceFiles());
