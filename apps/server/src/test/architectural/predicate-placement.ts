import {
  productionSourceFiles,
  serverPath,
} from 'test/architectural/server-project';
import type {
  ArrowFunction,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  MethodDeclaration,
  Node as TsNode,
  SourceFile,
} from 'ts-morph';
import { Node, SyntaxKind } from 'ts-morph';

/** The two directories a predicate may be declared in.
 *
 * `server-error-handling.md` § 1 says to use the narrowest appropriate location — one server
 * feature gets its own, several get `shared/`, and anything genuinely general leaves the server for
 * `packages/utils/src/predicates/`. `server-architecture.md` § "Architectural tier" names the
 * feature-level one concretely: `predicates/` under the feature's `domain/`, beside `mappers/` and
 * `services/`, which is what every feature module in the tree already does. */
export const PREDICATE_DIRECTORY =
  /^src\/(?:shared|[a-z0-9-]+\/domain)\/predicates\/[^/]+$/u;

export const isPredicateDirectoryPath = (path: string): boolean =>
  PREDICATE_DIRECTORY.test(path);

/** A violation, keyed by something that survives an unrelated edit above it.
 *
 * `line` is what makes it findable, `detail` is the code that broke the rule. Both end up in the
 * failure message; nothing here is compared, so there is nothing to keep in sync. */
export interface PredicateViolation {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

export const describeViolation = ({
  path,
  line,
  detail,
}: PredicateViolation): string => `${path}:${line} ${detail}`;

type FunctionLike =
  ArrowFunction | FunctionDeclaration | FunctionExpression | MethodDeclaration;

const isFunctionLike = (node: TsNode): node is FunctionLike =>
  Node.isArrowFunction(node) ||
  Node.isFunctionDeclaration(node) ||
  Node.isFunctionExpression(node) ||
  Node.isMethodDeclaration(node);

/** Whether `node` answers a question: it returns `boolean`, or it narrows with `value is T`.
 *
 * An assertion signature — `asserts value is T` — is not a predicate. It returns nothing and throws
 * instead of answering, which is the enforcement half of `server-error-handling.md` § 2 and belongs
 * with the code it guards, not in `predicates/`. */
export const isPredicateSignature = (node: FunctionLike): boolean => {
  const annotated = node.getReturnTypeNode();

  if (annotated !== undefined && Node.isTypePredicate(annotated)) {
    return annotated.getAssertsModifier() === undefined;
  }

  const returned = node.getReturnType();

  return returned.isBoolean() || returned.isBooleanLiteral();
};

export interface PredicateFunction extends PredicateViolation {
  readonly name: string;
  readonly exported: boolean;
  readonly file: SourceFile;
  readonly declaration: FunctionLike;
}

/** Every function declared at the top level of `file` — `function x() {}` and
 * `const x = () => {}` alike. Class methods are excluded by construction: a method is a member of
 * the class it belongs to, and this rule is about functions that stand outside one. Callbacks are
 * excluded too, for the same reason a `.filter` argument is not a unit anybody can import. */
interface ModuleFunction {
  readonly name: string;
  readonly exported: boolean;
  readonly node: FunctionLike;
}

const moduleLevelFunctions = (file: SourceFile): readonly ModuleFunction[] =>
  file.getStatements().flatMap((statement): readonly ModuleFunction[] => {
    const declared = statement.asKind(SyntaxKind.FunctionDeclaration);

    if (declared !== undefined) {
      return [
        {
          name: declared.getName() ?? '(anonymous)',
          exported: declared.isExported(),
          node: declared,
        },
      ];
    }

    const variables = statement.asKind(SyntaxKind.VariableStatement);

    if (variables === undefined) {
      return [];
    }

    return variables
      .getDeclarations()
      .flatMap((declaration): readonly ModuleFunction[] => {
        const initializer = declaration.getInitializer();

        if (
          initializer === undefined ||
          !(
            Node.isArrowFunction(initializer) ||
            Node.isFunctionExpression(initializer)
          )
        ) {
          return [];
        }

        return [
          {
            name: declaration.getName(),
            exported: variables.isExported(),
            node: initializer,
          },
        ];
      });
  });

export const predicateFunctionsIn = (
  file: SourceFile,
): readonly PredicateFunction[] => {
  const path = serverPath(file);

  return moduleLevelFunctions(file)
    .filter(({ node }) => isPredicateSignature(node))
    .map(({ name, exported, node }) => ({
      path,
      line: node.getStartLineNumber(),
      detail: name,
      name,
      exported,
      file,
      declaration: node,
    }));
};

/** Rule 1 — every module-level function that answers a question, wherever it is written. */
export const serverPredicateFunctions = (): readonly PredicateFunction[] =>
  productionSourceFiles().flatMap(predicateFunctionsIn);

export const misplacedPredicateFunctions = (): readonly PredicateViolation[] =>
  serverPredicateFunctions().filter(
    (predicate) => !isPredicateDirectoryPath(predicate.path),
  );

/** The shared predicates that already express a nullish check, from
 * `packages/utils/src/predicates/`. A comparison against `null` or `undefined` written by hand is a
 * second implementation of one of these three. */
export const SHARED_NULLISH_PREDICATES = [
  'isDefined',
  'isNull',
  'isUndefined',
] as const;

const EQUALITY_OPERATORS: readonly SyntaxKind[] = [
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
];

const NULLISH_LITERALS = new Set(['null', 'undefined']);

/** A hand-written nullish check: `x === null`, `x !== undefined`, `typeof x === 'undefined'`.
 *
 * Scope is deliberately the three checks `packages/utils/src/predicates/` already answers. A
 * `typeof value === 'string'` is also a type check written by hand, but there is no shared
 * predicate for it — a baseline entry nobody can act on is noise, so those stay out of this rule
 * until a shared predicate exists to point them at. */
const isNullishComparison = (node: TsNode): boolean => {
  if (!Node.isBinaryExpression(node)) {
    return false;
  }

  if (!EQUALITY_OPERATORS.includes(node.getOperatorToken().getKind())) {
    return false;
  }

  const left = node.getLeft();
  const right = node.getRight();
  const sides = [left.getText(), right.getText()];

  const comparesNullish = sides.some((text) => NULLISH_LITERALS.has(text));
  const comparesTypeofUndefined =
    (Node.isTypeOfExpression(left) || Node.isTypeOfExpression(right)) &&
    sides.some((text) => text === "'undefined'" || text === '"undefined"');

  return comparesNullish || comparesTypeofUndefined;
};

/** A hand-written nullish check: `x === null`, `x !== undefined`, `typeof x === 'undefined'`.
 *
 * Scope is deliberately the three checks `packages/utils/src/predicates/` already answers. A
 * `typeof value === 'string'` is also a type check written by hand, but there is no shared
 * predicate for it — a baseline entry nobody can act on is noise, so those stay out of this rule
 * until a shared predicate exists to point them at. */
export const nullishComparisonsIn = (
  file: SourceFile,
): readonly PredicateViolation[] => {
  const path = serverPath(file);
  const found: PredicateViolation[] = [];

  file.forEachDescendant((node) => {
    if (!isNullishComparison(node)) {
      return;
    }

    found.push({
      path,
      line: node.getStartLineNumber(),
      detail: node.getText().replace(/\s+/gu, ' '),
    });
  });

  return found;
};

/** Rule 3, everywhere in server production code — `predicates/` included.
 *
 * There is no carve-out for a predicate module. `packages/utils/src/predicates/` owns the single
 * implementation of "is this nullish"; a server predicate composes `isNull` / `isDefined` /
 * `isUndefined` rather than restating the comparison, exactly as `assertDefined` does. A rule that
 * held everywhere except in one directory would be a rule nobody could apply without first checking
 * where they were standing. */
export const handWrittenNullishChecks = (): readonly PredicateViolation[] =>
  productionSourceFiles().flatMap(nullishComparisonsIn);

const calleeName = (call: TsNode): string => {
  if (!Node.isCallExpression(call)) {
    return '';
  }

  const expression = call.getExpression().getText();

  return expression.split('.').pop() ?? expression;
};

const isAssertCall = (node: TsNode): boolean =>
  Node.isCallExpression(node) && /^assert[A-Z]?/u.test(calleeName(node));

/** A condition with its parentheses and `!` stripped off, so what is left is the question. */
const unwrapCondition = (node: TsNode): TsNode => {
  let current = node;

  for (;;) {
    if (Node.isParenthesizedExpression(current)) {
      current = current.getExpression();
      continue;
    }

    if (
      Node.isPrefixUnaryExpression(current) &&
      current.getOperatorToken() === SyntaxKind.ExclamationToken
    ) {
      current = current.getOperand();
      continue;
    }

    return current;
  }
};

export interface AssertionViolation extends PredicateViolation {
  readonly kind: 'nullish' | 'inline-condition';
}

const CHAIN_OPERATORS: readonly SyntaxKind[] = [
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
];

/** The separate questions a condition asks, flattened out of its `&&` / `||` chain and stripped of
 * the parentheses and `!` around each one.
 *
 * A chain is a composition of conditions, so it is judged one link at a time: `isOpen(draft) &&
 * line.quantity > 0` is half a named condition and half a rule nobody has named, and only the
 * second half is the finding. */
const conditionOperands = (condition: TsNode): readonly TsNode[] => {
  const unwrapped = unwrapCondition(condition);

  if (
    Node.isBinaryExpression(unwrapped) &&
    CHAIN_OPERATORS.includes(unwrapped.getOperatorToken().getKind())
  ) {
    return [
      ...conditionOperands(unwrapped.getLeft()),
      ...conditionOperands(unwrapped.getRight()),
    ];
  }

  return [unwrapped];
};

/** A condition operand that is not a call is a question written out instead of asked: a comparison
 * (`membership.workspaceId === currentUser.workspaceId`), a truthiness test (`if (header)`), a bare
 * flag (`assigned`), a length check (`rows.length > 0`). Each is a domain rule whose name lives only
 * in the reader's head at this one call site. A call has a name, which is the whole point — it is
 * the same rule the next caller can ask instead of restating. */
const isNamedCondition = (operand: TsNode): boolean =>
  Node.isCallExpression(operand);

const describeOperand = (operand: TsNode): string =>
  operand.getText().replace(/\s+/gu, ' ');

/** Rule 4 — what an `assert` is allowed to be handed.
 *
 * `assert(customerId !== null, ...)` states the condition twice: once as a comparison and once in
 * the error's name. `assertDefined(customerId, ...)` states it once, and `server-error-handling.md`
 * § 2 already ships it — so a nullish operand is reported as its own kind, because its fix is
 * `assertDefined` rather than the `isDefined` that rule 3 asks for everywhere else.
 *
 * `assertDefined` and `assertFail` take a value and an error, not a condition, so they are not
 * judged here. */
export const assertionsWithoutPredicatesIn = (
  file: SourceFile,
): readonly AssertionViolation[] => {
  const path = serverPath(file);
  const found: AssertionViolation[] = [];

  file.forEachDescendant((node) => {
    if (!Node.isCallExpression(node) || calleeName(node) !== 'assert') {
      return;
    }

    const args = node.getArguments();

    if (args.length === 0) {
      return;
    }

    for (const operand of conditionOperands(args[0])) {
      if (isNullishComparison(operand)) {
        found.push({
          path,
          line: operand.getStartLineNumber(),
          detail: describeOperand(operand),
          kind: 'nullish',
        });
        continue;
      }

      if (isNamedCondition(operand)) {
        continue;
      }

      found.push({
        path,
        line: operand.getStartLineNumber(),
        detail: describeOperand(operand),
        kind: 'inline-condition',
      });
    }
  });

  return found;
};

export const assertionsWithoutPredicates = (): readonly AssertionViolation[] =>
  productionSourceFiles().flatMap(assertionsWithoutPredicatesIn);

/** The condition each branching construct tests, if it tests one. `for (;;)` has no condition, and
 * a `switch` discriminates on a value rather than asking a question, so neither appears here. */
const branchConditionOf = (node: TsNode): TsNode | undefined => {
  if (
    Node.isIfStatement(node) ||
    Node.isWhileStatement(node) ||
    Node.isDoStatement(node)
  ) {
    return node.getExpression();
  }

  if (Node.isForStatement(node)) {
    return node.getCondition();
  }

  if (Node.isConditionalExpression(node)) {
    return node.getCondition();
  }

  return undefined;
};

/** Rule 5 — every branch asks a predicate.
 *
 * `if`, `while`, `do`, `for` and the ternary all read a condition, and the condition they read is a
 * rule about the domain. Written inline it is a rule with no name: the reader has to re-derive what
 * `header.archivedAt === null || header.state !== 'draft'` means every time, and the next branch
 * that needs the same rule restates it slightly differently. Asked as `isOpenDraft(header)` the rule
 * has one name, one definition, one test, and one place to change.
 *
 * Nullish operands are left to `handWrittenNullishChecks` rather than reported twice: `if (x ===
 * null)` and `if (x !== undefined)` are the same finding with the same fix, and rule 3 already names
 * the shared predicate to use. */
export const inlineBranchConditionsIn = (
  file: SourceFile,
): readonly PredicateViolation[] => {
  const path = serverPath(file);
  const found: PredicateViolation[] = [];

  file.forEachDescendant((node) => {
    const condition = branchConditionOf(node);

    if (condition === undefined) {
      return;
    }

    for (const operand of conditionOperands(condition)) {
      if (isNullishComparison(operand) || isNamedCondition(operand)) {
        continue;
      }

      found.push({
        path,
        line: operand.getStartLineNumber(),
        detail: describeOperand(operand),
      });
    }
  });

  return found;
};

export const inlineBranchConditions = (): readonly PredicateViolation[] =>
  productionSourceFiles().flatMap(inlineBranchConditionsIn);

/** Array and collection methods whose callback argument is a condition, so a predicate handed to
 * one is being used as a condition even though no `if` is written. */
const CONDITION_CALLBACK_METHODS = new Set([
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'some',
  'every',
  'reject',
  'partition',
  'takeWhile',
  'dropWhile',
]);

/** Whether the boolean produced at `node` is consumed as a condition rather than kept as a value.
 *
 * Accepted: an `if` / `while` / `for` test, a ternary's condition, an operand of `&&` / `||` / `??`
 * that itself lands in one of those, the first argument of an `assert*`, the callback of `filter`
 * and friends, and the return of a function that is itself a predicate — which is how one predicate
 * composes another. */
const TRANSPARENT_OPERATORS: readonly SyntaxKind[] = [
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
];

/** Nodes that pass a boolean through unchanged, so the answer is still travelling: parentheses, a
 * `!`, an operand of a `&&` / `||` / `??` chain, and the call `isFoo` is the callee of. */
const isTransparent = (parent: TsNode, current: TsNode): boolean => {
  if (Node.isParenthesizedExpression(parent)) {
    return true;
  }

  if (Node.isPrefixUnaryExpression(parent)) {
    return parent.getOperatorToken() === SyntaxKind.ExclamationToken;
  }

  if (Node.isBinaryExpression(parent)) {
    return TRANSPARENT_OPERATORS.includes(parent.getOperatorToken().getKind());
  }

  // `isFoo` in `isFoo(x)` is the call being made, not an argument to it.
  if (Node.isCallExpression(parent)) {
    return parent.getExpression() === current;
  }

  return false;
};

const isConditionArgument = (parent: TsNode, current: TsNode): boolean => {
  if (!Node.isCallExpression(parent)) {
    return false;
  }

  const args: readonly TsNode[] = parent.getArguments();

  if (isAssertCall(parent)) {
    return args[0] === current;
  }

  return (
    CONDITION_CALLBACK_METHODS.has(calleeName(parent)) && args.includes(current)
  );
};

/** Whether `parent` reads the boolean at `current` as a condition rather than keeping it. */
const readsAsCondition = (parent: TsNode, current: TsNode): boolean => {
  if (
    Node.isIfStatement(parent) ||
    Node.isWhileStatement(parent) ||
    Node.isDoStatement(parent)
  ) {
    return parent.getExpression() === current;
  }

  if (Node.isForStatement(parent)) {
    return parent.getCondition() === current;
  }

  if (Node.isConditionalExpression(parent)) {
    return parent.getCondition() === current;
  }

  if (Node.isCallExpression(parent)) {
    return isConditionArgument(parent, current);
  }

  // The expression body of an arrow, or the `return` of any function: a condition when the function
  // holding it is itself a predicate, which is how one predicate composes another.
  if (isFunctionLike(parent)) {
    return isPredicateSignature(parent);
  }

  if (Node.isReturnStatement(parent)) {
    const owner = parent.getFirstAncestor(isFunctionLike);

    return owner !== undefined && isPredicateSignature(owner);
  }

  return false;
};

export const isConditionPosition = (node: TsNode): boolean => {
  let current = node;
  let parent = current.getParent();

  while (parent !== undefined && isTransparent(parent, current)) {
    current = parent;
    parent = parent.getParent();
  }

  return parent !== undefined && readsAsCondition(parent, current);
};

/** Where `name`, exported by `declaration`, is referenced in production code.
 *
 * Resolved through the import that brought it in rather than through the language service: a
 * find-all-references over the whole program costs minutes on this tree, and an import edge answers
 * the same question. Import and export specifiers are the edge itself, not a use of the predicate,
 * so they are skipped, as is a property of the same name on some unrelated object. */
/** Identifier nodes in `file` that name `name` and are a use of it rather than a declaration of it.
 *
 * The import specifier, the export specifier and the `const isFoo =` on the declaration itself are
 * the predicate's own spelling, not somebody asking it. A `.isFoo` property on an unrelated object
 * happens to share the text and is not this predicate at all. */
const usesOfNameIn = (file: SourceFile, name: string): readonly Identifier[] =>
  file
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === name)
    .filter((identifier) => {
      const owner = identifier.getParent();

      return (
        !Node.isImportSpecifier(owner) &&
        !Node.isExportSpecifier(owner) &&
        !Node.isPropertyAccessExpression(owner) &&
        !Node.isVariableDeclaration(owner) &&
        !Node.isFunctionDeclaration(owner)
      );
    });

/** Where `name`, exported by `declaration`, is used in production code — its own file included.
 *
 * A predicate composed by its neighbour is being asked: `canDeactivateItem` is written as
 * `isItemActive(deactivatedAt)`, and a rule that only looked at importers would call `isItemActive`
 * dead while the file two lines below it does nothing but ask it.
 *
 * Cross-file references are resolved through the import that brought the name in rather than
 * through the language service: a find-all-references over the whole program costs minutes on this
 * tree, and an import edge answers the same question. */
const referencesTo = (
  declaration: SourceFile,
  name: string,
): readonly Identifier[] =>
  productionSourceFiles().flatMap((consumer): readonly Identifier[] => {
    if (consumer === declaration) {
      return usesOfNameIn(consumer, name);
    }

    const importsName = consumer
      .getImportDeclarations()
      .filter(
        (statement) =>
          statement.getModuleSpecifierSourceFile() === declaration &&
          !statement.isTypeOnly(),
      )
      .some((statement) =>
        statement
          .getNamedImports()
          .some(
            (specifier) =>
              !specifier.isTypeOnly() &&
              (specifier.getAliasNode()?.getText() ?? specifier.getName()) ===
                name,
          ),
      );

    if (!importsName) {
      return [];
    }

    return usesOfNameIn(consumer, name);
  });

const isCalleeReference = (reference: Identifier): boolean => {
  const parent = reference.getParent();

  return Node.isCallExpression(parent) && parent.getExpression() === reference;
};

export interface PredicateUsage extends PredicateViolation {
  readonly reason: 'unused' | 'not-a-condition';
}

/** Rule 2 — a predicate exists to be asked. Every exported predicate must be referenced from
 * production code, and every one of those references must sit where a condition is read.
 *
 * A predicate nothing calls is a rule nothing enforces. A predicate whose answer is stored, put in
 * an object, or handed back as data is a boolean field wearing a question's name — the caller is
 * carrying the answer around instead of branching on it, and the condition it encodes is no longer
 * the thing the code reads. */
export const predicatesNotUsedAsConditions = (): readonly PredicateUsage[] =>
  productionSourceFiles()
    .filter((file) => isPredicateDirectoryPath(serverPath(file)))
    .flatMap((file) =>
      predicateFunctionsIn(file)
        .filter((predicate) => predicate.exported)
        .flatMap((predicate): readonly PredicateUsage[] => {
          const references = referencesTo(file, predicate.name);

          if (references.length === 0) {
            return [
              {
                path: predicate.path,
                line: predicate.line,
                detail: `${predicate.name} is never called`,
                reason: 'unused',
              },
            ];
          }

          // Only a *call* produces the boolean this rule is about. A bare `canAmendOrder` handed
          // to `lockAmendableOrder` is the predicate itself travelling to whoever will ask it —
          // the condition is read at the other end, where this file cannot see it.
          return references
            .filter((reference) => isCalleeReference(reference))
            .filter((reference) => !isConditionPosition(reference))
            .map((reference) => ({
              path: serverPath(reference.getSourceFile()),
              line: reference.getStartLineNumber(),
              detail: `${predicate.name} is read as a value`,
              reason: 'not-a-condition',
            }));
        }),
    );
