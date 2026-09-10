import { globSync, readFileSync } from 'node:fs';

// T20 — the static-analysis primitives behind the architecture check
// `docs/features/delivery-addresses/sad.md` §10 requires: **every read whose response schema can
// carry a customer-identity field declares `@ObservedPermission(CUSTOMERS:WATCH)`**.
//
// §11 chose *two mechanical defences rather than a review pass*, "because a missed surface leaks
// silently and forever". The contract shape is one (T13, T19); this is the other, and §8 states
// exactly why it has to exist: "A surface that forgets it fails silently and undetectably in
// production."
//
// **The surface list is derived, never enumerated.** Nothing here holds a list of handler names or
// of identity-bearing endpoints. The set is computed from the contract schemas themselves and then
// joined to handlers through each handler's declared return type, so a read added tomorrow whose
// response reaches customer identity fails this check **without anyone editing this file**. That is
// the whole point: a hand-maintained list is exactly the "remembered" defence §10 replaces, and the
// three stale module lists this repository already carries
// (`shared/domain/repositories/repository-boundaries.spec.ts` and two `module-boundaries.spec.ts`
// files, none of which lists `purchase-drafts`) are the standing evidence that such lists rot.

const CONTRACTS_GLOB = 'packages/contracts/src/**/*.ts';

// The projections module whose every schema **is** customer identity by subject rather than by
// field. `customers-projections.ts` says so itself: "This schema has no redacted form: every
// operation returning it already requires a `CUSTOMERS:*` Permission, so an actor who reaches it
// holds the Permission the identity is gated on (AC-09)."
const CUSTOMER_SUBJECT_MODULE = 'packages/contracts/src/customers/customers-projections.ts';

// The fields the redaction itself removes, read off the identified/redacted pair in
// `purchase-drafts-projections.ts`: `customer`, `customerName` and both the captured and the current
// Delivery Address are "absent as properties rather than null" on the redacted form (AC-09a).
//
// `addressText` and `accessNotes` are deliberately **not** here. They appear on
// `lineWarehouseDestinationSchema` too, which the contract states is "readable by any member holding
// `PURCHASE_DRAFTS:WATCH` in that Warehouse and is **never** gated on `CUSTOMERS:WATCH`" — the
// operator's own premises data, not a third party's. Keying on them would flag every Via Warehouse
// read and make the check noise. They are reached anyway wherever they matter, because a customer
// address is only ever nested under one of the customer-naming fields below.
const IDENTITY_FIELDS = [
  'customer',
  'customerId',
  'customerName',
  'customerDestination',
  'customerDeliveryAddressId',
];

const isProductionContract = (file) =>
  !file.includes('.spec.') && !file.endsWith('/index.ts');

/**
 * Every `const <name> = <body>;` declaration in one contract source, exported or not.
 *
 * Both forms matter. `export const fooSchema = z.strictObject({...})` is the schema a type infers
 * from; a bare `const fooCommonShape = {...}` is spread into two schemas and is how the identified
 * and redacted forms "can never drift in a field that is not the redaction itself". A walk that saw
 * only exported schemas would miss every field that reaches a projection through a shape.
 *
 * The body is taken by bracket balance rather than by regex, so a nested object, a `.refine(...)`
 * callback or a union spanning forty lines is captured whole.
 */
const declarationsIn = (source) => {
  const declarations = new Map();
  const pattern = /(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=/gu;

  for (const match of source.matchAll(pattern)) {
    let cursor = match.index + match[0].length;
    let depth = 0;
    let body = '';

    while (cursor < source.length) {
      const character = source[cursor];
      if ('([{'.includes(character)) {
        depth += 1;
      } else if (')]}'.includes(character)) {
        depth -= 1;
      } else if (character === ';' && depth === 0) {
        break;
      }
      body += character;
      cursor += 1;
    }

    declarations.set(match[1], body);
  }

  return declarations;
};

/** Field names a declaration states directly, e.g. `customerName: z.string()`. */
const declaredFields = (body) =>
  Array.from(body.matchAll(/(?:^|[{,\s])([A-Za-z0-9_$]+)\s*:/gu)).map(
    (match) => match[1],
  );

/** Other declarations this one names — a schema reference or a spread shape. */
const referencedDeclarations = (body) =>
  Array.from(body.matchAll(/\b([A-Za-z0-9_$]+)\b/gu)).map((match) => match[1]);

/**
 * Computes the field-bearing closure over every contract declaration, then resolves it to the
 * **exported TypeScript type names** a controller can annotate a handler with.
 *
 * Parameterised (T14) so a second field family — `rejections` / `REJECTIONS:*` — reuses the same
 * engine instead of a second hand-rolled walk: `identityFields` and `subjectModule` default to the
 * Customer-identity pair this function originally shipped with, so every existing caller
 * (`identityBearingContractTypes()`, no arguments) is unaffected byte-for-byte.
 *
 * Seeded two ways, both rules rather than lists:
 *   1. any declaration stating one of `identityFields` directly;
 *   2. (only when `subjectModule` is given) every record declaration in that module, whose
 *      subject *is* the field family — e.g. `customers-projections.ts` for Customer identity.
 *
 * Then propagated to a fixpoint: a schema that references a field-bearing schema or spreads a
 * field-bearing shape is itself field-bearing. `PurchaseDraftDetail` is reached this way —
 * detail → line → `lineCustomerDestinationSchema` → `customerName` — with no step written down.
 */
export const identityBearingContractTypes = ({
  identityFields = IDENTITY_FIELDS,
  subjectModule = CUSTOMER_SUBJECT_MODULE,
} = {}) => {
  const files = globSync(CONTRACTS_GLOB).filter(isProductionContract).sort();

  const declarations = new Map();
  const declarationFile = new Map();
  const typeToSchema = new Map();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    for (const [name, body] of declarationsIn(source)) {
      declarations.set(name, body);
      declarationFile.set(name, file);
    }

    // `export type X = z.infer<typeof xSchema>` is uniform across every contract module, which is
    // what lets a handler's return-type annotation be joined to a schema at all.
    for (const match of source.matchAll(
      /export\s+type\s+([A-Za-z0-9_$]+)\s*=\s*z\.infer<\s*typeof\s+([A-Za-z0-9_$]+)\s*>/gu,
    )) {
      typeToSchema.set(match[1], match[2]);
    }
  }

  const identityDeclarations = new Set();

  for (const [name, body] of declarations) {
    const statesIdentityField = declaredFields(body).some((field) =>
      identityFields.includes(field),
    );

    // Scoped to the **record** schemas of that module, not to every declaration in it, and only
    // when a `subjectModule` is supplied at all — a field-only rule (no whole-module subject, as
    // `rejections` has no module of its own the way Customer identity has
    // `customers-projections.ts`) passes `subjectModule: null` and this half of the seed is skipped
    // rather than matching everything or nothing by accident. It also
    // defines two bare value schemas — `addressTextSchema` and `accessNotesSchema` — which the
    // Warehouse's own `lineWarehouseDestinationSchema` shares. Seeding those would propagate
    // identity into the one destination the contract is explicit is *never* gated on
    // `CUSTOMERS:WATCH`, and from there into the **redacted** line form, flagging the very shape
    // that exists to prove the redaction. A shared string value object is not customer identity;
    // the record that carries it is.
    const isSubjectRecord =
      subjectModule !== null &&
      declarationFile.get(name) === subjectModule &&
      /^\s*z\s*\.\s*(?:strict)?[oO]bject\s*\(/u.test(body);

    if (statesIdentityField || isSubjectRecord) {
      identityDeclarations.add(name);
    }
  }

  // Fixpoint. Bounded by the declaration count, so it terminates on any graph including a cyclic
  // one; contracts have no cycles today, and this does not depend on that staying true.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, body] of declarations) {
      if (identityDeclarations.has(name)) {
        continue;
      }
      if (
        referencedDeclarations(body).some(
          (reference) =>
            reference !== name && identityDeclarations.has(reference),
        )
      ) {
        identityDeclarations.add(name);
        changed = true;
      }
    }
  }

  const types = new Set();
  for (const [typeName, schemaName] of typeToSchema) {
    if (identityDeclarations.has(schemaName)) {
      types.add(typeName);
    }
  }

  return { types, declarations: identityDeclarations };
};

const HTTP_VERB_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'All',
]);

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//u.test(line))
    .join('\n');

// Consumes lines starting at `startIndex` until the parentheses opened on that line balance back
// to zero, returning the joined text and the index of the line the closing paren fell on.
//
// T14, blocking review — the previous version pushed only `{ name, text: line }` for a decorator's
// *opening* line, so `@ObservedPermission(\n  A,\n  B,\n)` was captured as the four characters
// `@ObservedPermission(` and every argument on it was silently discarded. That made a repository-
// wide gate produce false positives the moment any decorator on this subpath became multi-line
// (T13's four `@ObservedPermission(REJECTIONS:CREATE, CUSTOMERS:WATCH)` declarations) — the review
// that caught it is why this function exists at all.
const captureBalancedParens = (lines, startIndex) => {
  let depth = 0;
  let opened = false;
  let text = '';
  let index = startIndex;

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    text += (index === startIndex ? '' : '\n') + line;

    for (const character of line) {
      if (character === '(') {
        depth += 1;
        opened = true;
      } else if (character === ')') {
        depth -= 1;
      }
    }

    if (opened && depth <= 0) {
      break;
    }
  }

  return { text, endIndex: index };
};

// A decorator with no parentheses at all (rare on this subpath, but `@ArchivedTolerantRead` and
// `@UseGuards(...)` both occur) still needs a defined end index — one line — so the caller can
// advance past it without re-scanning.
const captureDecorator = (lines, startIndex) => {
  if (!lines[startIndex].includes('(')) {
    return { text: lines[startIndex], endIndex: startIndex };
  }
  return captureBalancedParens(lines, startIndex);
};

// Splits one balanced parameter list's *inner* text (parentheses stripped) into its top-level
// parameters, respecting nested `()`, `[]`, `{}` and `<>` so a parameter carrying a decorator call,
// an array type or a generic is never split in the middle of it.
const splitTopLevelParameters = (parameterListText) => {
  const open = parameterListText.indexOf('(');
  const close = parameterListText.lastIndexOf(')');
  const inner =
    open === -1 || close === -1
      ? parameterListText
      : parameterListText.slice(open + 1, close);

  const parameters = [];
  let depth = 0;
  let current = '';

  for (const character of inner) {
    if ('([{<'.includes(character)) {
      depth += 1;
    } else if (')]}>'.includes(character)) {
      depth -= 1;
    }

    if (character === ',' && depth === 0) {
      parameters.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  if (current.trim() !== '') {
    parameters.push(current);
  }

  return parameters;
};

// The `@Body()` parameter's declared type, distinguished from `@Query()`/`@Param()`/`@Req()`
// parameters carrying an unrelated Dto — T14, blocking review: `paramTypes.find((t) =>
// t?.isZodDto)` took the *first* Zod-backed parameter regardless of which decorator introduced it,
// so `(@Query() filter: SomeQueryDto, @Body() input: ArrivalDto)` would have been judged on the
// query schema. `undefined` means no `@Body()` parameter was found at all (a GET/DELETE, typically)
// — that is not a parser failure and callers must not report it as one.
const bodyParameterType = (parameterListText) => {
  const bodyParameter = splitTopLevelParameters(parameterListText).find(
    (parameter) => /@Body\s*\(\s*\)/u.test(parameter),
  );
  if (!bodyParameter) {
    return undefined;
  }
  const type = /:\s*([A-Za-z0-9_$]+)/u.exec(bodyParameter);
  return type ? type[1] : null;
};

/**
 * Every handler in one controller, with the decorators above it, the contract type it returns, and
 * the `@Body()` parameter's own declared type (if any).
 *
 * A handler is a method carrying an HTTP verb decorator. Its response type is read from the text
 * strictly between the parameter list's own closing parenthesis and the method body's opening
 * brace (or a trailing `;`) — never from an unbounded lookahead window. T14, blocking review: the
 * previous version searched up to 40 lines *forward from the method's own line*, with nothing
 * stopping the search once it crossed into a *later* method's signature; an unannotated handler
 * (against this repository's lint rule, but not against what this parser must survive) would
 * silently adopt the next handler's return type. Anchoring to this method's own parameter-list
 * close makes that impossible: there is nothing to find past a `{` or `;` this method's own
 * signature ends with.
 */
const parseHandlers = (file) => {
  const source = stripComments(readFileSync(file, 'utf8'));
  const lines = source.split('\n');

  const handlers = [];
  let pending = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    const decorator = /^\s*@([A-Za-z0-9_$]+)/u.exec(line);
    if (decorator) {
      const { text, endIndex } = captureDecorator(lines, index);
      pending.push({ name: decorator[1], text });
      index = endIndex;
      continue;
    }

    if (/\bclass\s+[A-Za-z0-9_$]+/u.test(line)) {
      pending = [];
      continue;
    }

    const method =
      /^\s*(?:public\s+|private\s+|protected\s+|static\s+)?(?:async\s+)?([A-Za-z0-9_$]+)\s*\(/u.exec(
        line,
      );
    if (!method || method[1] === 'constructor') {
      continue;
    }

    const verb = pending.find((entry) => HTTP_VERB_DECORATORS.has(entry.name));
    if (verb) {
      const { text: parameterListText, endIndex: parameterListEnd } =
        captureBalancedParens(lines, index);

      // Scoped strictly to the text between this method's own parameter-list close and its body
      // (or a trailing `;` for an interface-style signature) — see the function comment above for
      // why an unbounded forward window is the bug this replaces.
      const afterParameters = lines
        .slice(parameterListEnd, parameterListEnd + 5)
        .join('\n');
      const boundary = afterParameters.search(/[{;]/u);
      const scopedAfterParameters =
        boundary === -1 ? afterParameters : afterParameters.slice(0, boundary + 1);
      const returnType = /:\s*Promise<\s*([A-Za-z0-9_$]+)\s*(\[\])?\s*>/u.exec(
        scopedAfterParameters,
      );

      handlers.push({
        file,
        methodName: method[1],
        verb: verb.name,
        responseType: returnType ? returnType[1] : null,
        requestBodyType: bodyParameterType(parameterListText),
        decorators: pending.map((entry) => entry.text).join('\n'),
      });
    }

    pending = [];
  }

  return handlers;
};

// Reads a decorator's full, possibly multi-line argument list and tests whether one of them names
// `PermissionId.<permissionIdentifier>` — as opposed to requiring that identifier be the *sole*
// argument, which is the false-positive `T14`'s review found: `@ObservedPermission(A, B)` was read
// as declaring neither `A` nor `B`.
const decoratorArguments = (decoratorsText, decoratorName) => {
  const match = new RegExp(`@${decoratorName}\\(([\\s\\S]*?)\\)`, 'u').exec(
    decoratorsText,
  );
  return match ? match[1] : null;
};

const observesPermission = (decoratorsText, permissionIdentifier) => {
  const args = decoratorArguments(decoratorsText, 'ObservedPermission');
  return (
    args !== null &&
    new RegExp(`PermissionId\\.${permissionIdentifier}\\b`, 'u').test(args)
  );
};

const requiresPermissionMatching = (decoratorsText, pattern) =>
  pattern.test(decoratorsText);

// A handler that already **requires** a `CUSTOMERS:*` Permission needs no observed declaration: the
// identity is gated by the Permission that admits the request. `customers.controller.ts` states the
// same rule in prose — "No read here declares an `@ObservedPermission`. Both already require
// `CUSTOMERS:WATCH`" — and this is that sentence made mechanical.
const REQUIRES_CUSTOMERS_PERMISSION =
  /@RequiredPermission\(\s*PermissionId\.CUSTOMERS_[A-Z_]+\s*\)/u;

/**
 * The rule itself, over an already-parsed handler set: every handler whose response can carry the
 * field family in question but which neither requires an exempting Permission nor declares the
 * observed one, **plus** every handler whose return type the parser could not resolve at all.
 *
 * An unresolved return type — a paginated wrapper, a union, or any shape the
 * `Promise<Identifier>` / `Promise<Identifier[]>` parser cannot read — is reported rather than
 * skipped. The parser's blind spot must not become the check's: whether the response can carry the
 * field is unknown, not "no", so an unresolved handler is reported with its own message rather
 * than dropped out of the join silently (sad.md §11: "a missed surface leaks silently and
 * forever").
 *
 * Parameterised (T14) so the customer-identity rule and the Rejection-cause rule are the same
 * function: `observedIdentifier`/`requiredPattern`/`ruleLabel` default to the Customer-identity
 * configuration this function originally shipped with, and `verbs` — absent here — restricts a
 * caller's rule to a subset of HTTP verbs (T14 scopes the Rejection-cause read rule to `@Get`
 * alone; sad.md §7 fixes the two ending routes' own observed list, so they are deliberately outside
 * this rule's read half).
 *
 * Shared by `findObservedPermissionGaps`, which parses the real controller tree, and
 * `gapsInHandlerSet`, which re-runs the same rule over the positive control's mutated in-memory
 * set — so the two cannot silently diverge into different rules.
 */
const gapsFor = (
  handlers,
  identityTypes,
  {
    observedIdentifier = 'CUSTOMERS_WATCH',
    requiredPattern = REQUIRES_CUSTOMERS_PERMISSION,
    verbs = null,
    ruleLabel = 'customer identity',
  } = {},
) => {
  const gaps = [];

  for (const handler of handlers) {
    if (verbs !== null && !verbs.has(handler.verb)) {
      continue;
    }

    if (handler.responseType === null) {
      gaps.push(
        `${handler.file}::${handler.methodName}: return type could not be resolved by the ` +
          '`Promise<Identifier>` / `Promise<Identifier[]>` parser, so whether it can carry ' +
          `${ruleLabel} is unknown — sad.md §10`,
      );
      continue;
    }

    if (!identityTypes.has(handler.responseType)) {
      continue;
    }

    const declaresObserved = observesPermission(
      handler.decorators,
      observedIdentifier,
    );
    const exempted =
      requiredPattern !== null &&
      requiresPermissionMatching(handler.decorators, requiredPattern);

    if (!declaresObserved && !exempted) {
      gaps.push(
        `${handler.file}::${handler.methodName}: returns ${handler.responseType}, which can carry ` +
          `${ruleLabel}, but declares neither @ObservedPermission(...PermissionId.${observedIdentifier}...) ` +
          'nor an exempting required Permission — sad.md §10',
      );
    }
  }

  return gaps;
};

/**
 * Every handler whose response can carry the field family in question but which neither requires
 * an exempting Permission nor declares the observed one — the violations sad.md §10's check exists
 * to make impossible to merge.
 *
 * `identityTypes` is supplied by the caller rather than recomputed here so a test can drive this
 * rule against a deliberately altered handler set and prove it fails — the positive control the
 * Definition of Done requires ("proven by removing one").
 */
export const findObservedPermissionGaps = (controllerFiles, identityTypes, options) =>
  gapsFor(
    controllerFiles.flatMap((file) => parseHandlers(file)),
    identityTypes,
    options,
  );

/** Exposed so a test can assert the join actually found handlers rather than passing on an empty set. */
export const identityBearingHandlers = (controllerFiles, identityTypes) =>
  controllerFiles
    .flatMap((file) => parseHandlers(file))
    .filter(
      (handler) =>
        handler.responseType !== null && identityTypes.has(handler.responseType),
    )
    .map((handler) => `${handler.file}::${handler.methodName}`);

/** Every handler, so a test can prove a controller was parsed at all. */
export const allHandlers = (controllerFiles) =>
  controllerFiles.flatMap((file) => parseHandlers(file));

/**
 * Strips the entire `@ObservedPermission(...)` declaration from one named handler's decorator
 * text, returning a handler set the rule can be re-run against.
 *
 * This is the positive control, and it deliberately mutates an **in-memory** copy rather than the
 * shipped source: a fixture file under `apps/server/src` would be compiled by `tsc` and linted by
 * `eslint src`, making the deliberate violation a real one in the tree — the same reasoning
 * `access/module-boundaries.spec.ts` records for using inline fixtures.
 */
export const withoutObservedPermission = (controllerFiles, methodName) =>
  controllerFiles.flatMap((file) =>
    parseHandlers(file).map((handler) => {
      if (handler.methodName !== methodName) {
        return handler;
      }
      const match = /@ObservedPermission\([\s\S]*?\)/u.exec(handler.decorators);
      return {
        ...handler,
        decorators: match
          ? handler.decorators.slice(0, match.index) +
            handler.decorators.slice(match.index + match[0].length)
          : handler.decorators,
      };
    }),
  );

/** Re-runs the observed-Permission rule over an already-parsed handler set. */
export const gapsInHandlerSet = (handlers, identityTypes, options) =>
  gapsFor(handlers, identityTypes, options);

// ---------------------------------------------------------------------------------------------
// T14 — the request-body half. A field the *request* schema carries, rather than the response,
// needs the same field-bearing closure over the contract schemas (`identityBearingContractTypes`
// already computes it and returns the raw *schema* names as `declarations`) joined to a handler
// through its `@Body()` Dto's own `createZodDto(...)` argument, which every Dto in this repository
// is required to be a thin, redefine-nothing adapter over (adding-and-using-contracts.md §5).
// ---------------------------------------------------------------------------------------------

const DTO_GLOB = 'apps/server/src/**/rest/dtos/*.dto.ts';

/**
 * Maps every `createZodDto`-backed Dto class name to the schema it adapts, read off
 * `class Foo extends createZodDto(fooSchema) {}` — the one shape `adding-and-using-contracts.md`
 * §5 permits a Dto file to declare. Exposed separately from `requestBodyBearingDtoTypes` so a
 * caller can tell "this Dto name is unknown to the Dto layer at all" (a parser blind spot) apart
 * from "this Dto is known and does not carry the field" (a clean handler).
 */
export const dtoSchemaNames = () => {
  const dtoToSchema = new Map();

  for (const file of globSync(DTO_GLOB)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /class\s+([A-Za-z0-9_$]+)\s+extends\s+createZodDto\(\s*([A-Za-z0-9_$]+)\s*,?\s*\)/gu,
    )) {
      dtoToSchema.set(match[1], match[2]);
    }
  }

  return dtoToSchema;
};

/**
 * The Dto class names whose underlying schema is in the field-bearing closure — the request-side
 * counterpart of `identityBearingContractTypes`'s `types`. Built from that same function's
 * `declarations` (raw schema names), so the two field families can never compute the closure two
 * different ways.
 */
export const requestBodyBearingDtoTypes = (identityFields) => {
  const { declarations } = identityBearingContractTypes({
    identityFields,
    subjectModule: null,
  });
  const dtoToSchema = dtoSchemaNames();

  const types = new Set();
  for (const [dtoName, schemaName] of dtoToSchema) {
    if (declarations.has(schemaName)) {
      types.add(dtoName);
    }
  }
  return types;
};

/**
 * The request-body mirror of `gapsFor`: every handler whose `@Body()` Dto carries the field family
 * in question but does not declare the observed Permission. A handler with no `@Body()` parameter
 * at all (`requestBodyType === undefined`) is not a violation and is not reported — most handlers
 * have no body. A `@Body()` Dto the Dto layer does not recognise at all (absent from
 * `dtoSchemaNames()`) is the request-side parser blind spot and is reported exactly as an
 * unresolved response type is above: unknown, not "no".
 */
export const gapsForRequestField = (
  handlers,
  requestBodyTypes,
  { observedIdentifier, ruleLabel, knownDtoTypes = dtoSchemaNames() } = {},
) => {
  const gaps = [];

  for (const handler of handlers) {
    const bodyType = handler.requestBodyType;
    if (bodyType === undefined) {
      continue;
    }
    if (bodyType === null || !knownDtoTypes.has(bodyType)) {
      gaps.push(
        `${handler.file}::${handler.methodName}: @Body() parameter type could not be resolved to ` +
          `a known Dto, so whether it carries ${ruleLabel} is unknown — sad.md §10`,
      );
      continue;
    }
    if (!requestBodyTypes.has(bodyType)) {
      continue;
    }
    if (!observesPermission(handler.decorators, observedIdentifier)) {
      gaps.push(
        `${handler.file}::${handler.methodName}: request body is ${bodyType}, which carries ` +
          `${ruleLabel}, but does not declare @ObservedPermission(...PermissionId.${observedIdentifier}...) ` +
          '— sad.md §8',
      );
    }
  }

  return gaps;
};

